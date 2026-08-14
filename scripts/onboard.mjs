#!/usr/bin/env node
/**
 * Interactive first-time setup + deploy walkthrough.
 *
 *   npm run onboard              # normal (protects Oracle production config)
 *   npm run onboard -- --yes     # fully non-interactive new site (wrangler.toml)
 *   npm run onboard:sandbox      # separate Worker + D1; never touches wrangler.toml
 *   npm run onboard:sandbox -- --yes
 *
 * Schedule: user picks announce weekday + time; meet/ratings are derived
 * (ratings close the next calendar day). Crons follow those times.
 */
import { execSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import {
  addMinutesHhmm,
  buildCronBundle,
  deriveRelatedTimes,
  formatScheduleSummary,
  isValidIanaTimeZone,
  parseHhmmStrict,
  parseWeekdayStrict,
  WEEKDAY_LABELS,
} from './schedule-lib.mjs';
import {
  extractWorkersDevUrl,
  isCronLimitError,
  isValidDatabaseId,
  isValidOptionalPassword,
  isValidResourceName,
  isValidSiteOrigin,
  normalizeResourceName,
  normalizeSiteOrigin,
  parseYesNo,
  setCronBlock,
  setTomlVar,
  shouldSyncSiteOriginToWorkersDev,
} from './onboard-lib.mjs';

const SANDBOX = process.argv.includes('--sandbox');
/** Fully non-interactive (CI / agents). Only --yes skips prompts. */
const YES = process.argv.includes('--yes');
/** Auto-accept defaults when --yes is passed. Sandbox stays interactive. */
const AUTO = YES;
const CONFIG = SANDBOX ? 'wrangler.sandbox.toml' : 'wrangler.toml';
const PASSWORD_FILE = SANDBOX ? '.sandbox-admin-password.txt' : '.admin-password.txt';

const RESERVED_WORKER_NAMES = new Set(['oracle']);
const RESERVED_DB_NAMES = new Set(['oracle-db']);

/** Optional local list of D1 UUIDs never to overwrite (gitignored `.protect-databases`). */
function protectedDatabaseIds() {
  if (!existsSync('.protect-databases')) return new Set();
  return new Set(
    readFileSync('.protect-databases', 'utf8')
      .split('\n')
      .map((line) => line.replace(/#.*/g, '').trim())
      .filter(Boolean)
  );
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

function readLine(promptText) {
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => resolve(answer));
  });
}

/**
 * Prompt with example + default; validate and retry on invalid input.
 * @param {object} opts
 * @param {string} opts.question
 * @param {string} [opts.example] shown as "example: …"
 * @param {string} [opts.defaultValue] Enter accepts this
 * @param {(raw: string) => { ok: true, value: any } | { ok: false, error: string }} opts.validate
 * @param {boolean} [opts.human] if true, only skipped by --yes (not by sandbox AUTO)
 */
async function askValidated({ question, example = '', defaultValue = '', validate, human = false }) {
  const skip = human ? YES : AUTO;
  if (skip) {
    const raw = defaultValue;
    const result = validate(raw);
    if (!result.ok) {
      throw new Error(`Invalid default for "${question}": ${result.error}`);
    }
    console.log(`${question}: ${result.value === '' ? '(none)' : result.value}${example ? `  (example: ${example})` : ''}`);
    return result.value;
  }

  for (;;) {
    const parts = [question];
    if (example) parts.push(`example: ${example}`);
    if (defaultValue !== '') parts.push(`default: ${defaultValue}`);
    const promptText = `${parts.join(' · ')}: `;
    const raw = await readLine(promptText);
    const trimmed = raw.trim();
    const candidate = trimmed === '' ? defaultValue : trimmed;
    const result = validate(candidate);
    if (result.ok) return result.value;
    console.log(`  ✗ ${result.error} Try again.`);
  }
}

async function yesValidated(question, defaultYes = true, { human = false, example = 'y' } = {}) {
  const value = await askValidated({
    question,
    example,
    defaultValue: defaultYes ? 'y' : 'n',
    human,
    validate: (raw) => {
      const parsed = parseYesNo(raw, defaultYes);
      if (!parsed.ok) {
        return { ok: false, error: 'Please answer y or n (yes/no also fine).' };
      }
      return { ok: true, value: parsed.value };
    },
  });
  return value;
}

function yes(question, defaultYes = true) {
  return yesValidated(question, defaultYes, { human: false, example: defaultYes ? 'y' : 'n' });
}

function yesHuman(question, defaultYes = true) {
  return yesValidated(question, defaultYes, { human: true, example: defaultYes ? 'y' : 'n' });
}

function wranglerConfigArgs() {
  return SANDBOX ? ['--config', CONFIG] : [];
}

function run(cmd, opts = {}) {
  console.log(`\n→ ${cmd}\n`);
  // shell required so `npm` resolves on Windows and macOS/Linux the same way
  execSync(cmd, { stdio: 'inherit', shell: true, ...opts });
}

function wranglerBin() {
  const local = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (existsSync(local)) return local;
  throw new Error('wrangler is not installed. Run npm install first.');
}

/**
 * Run local wrangler via node — portable on macOS, Linux, and Windows
 * (avoids `spawn npx` ENOENT on Windows).
 *
 * Critical on Windows: piped stdin makes Wrangler treat the process as CI and
 * demand CLOUDFLARE_API_TOKEN even when `wrangler login` OAuth exists. Keep
 * stdin as a real TTY whenever we are not feeding `input`.
 */
function wranglerEnv() {
  const env = { ...process.env };
  // ci-info / Wrangler treat any of these as "non-interactive".
  for (const key of [
    'CI',
    'CONTINUOUS_INTEGRATION',
    'BUILD_ID',
    'BUILD_NUMBER',
    'BUILD_URL',
    'BUILDKITE',
    'CIRCLECI',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'HEROKU_TEST_RUN_ID',
    'JENKINS_URL',
    'TEAMCITY_VERSION',
    'TF_BUILD',
    'TRAVIS',
    'APPVEYOR',
    'CODEBUILD_BUILD_ID',
  ]) {
    delete env[key];
  }
  delete env.npm_config_yes;
  return env;
}

/** Default stdio: TTY stdin (OAuth works) + capture stdout/stderr. */
function wranglerStdio(opts = {}) {
  if (opts.stdio) return opts.stdio;
  // Feeding stdin (e.g. secret put) requires a pipe — caller should refresh auth first.
  if (opts.input !== undefined) return ['pipe', 'pipe', 'pipe'];
  if (process.stdin.isTTY) return ['inherit', 'pipe', 'pipe'];
  return ['ignore', 'pipe', 'pipe'];
}

function wranglerSync(args, opts = {}) {
  const { env: extraEnv, stdio: _stdio, ...rest } = opts;
  return spawnSync(process.execPath, [wranglerBin(), ...args], {
    encoding: 'utf8',
    ...rest,
    stdio: wranglerStdio(opts),
    env: { ...wranglerEnv(), ...(extraEnv || {}) },
  });
}

function wranglerCapture(args) {
  const result = wranglerSync(args);
  const out = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.status !== 0) {
    const detail = result.error?.message || out || `(exit ${result.status ?? 'unknown'})`;
    throw new Error(detail);
  }
  return out;
}

/** Stream wrangler output to the terminal and return it for parsing. */
function wranglerCaptureInherit(args) {
  console.log(`\n→ wrangler ${args.join(' ')}\n`);
  // stdin inherit keeps OAuth working; still capture out for URL / cron-limit parsing.
  const result = wranglerSync(args);
  const out = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return { status: result.status ?? 1, out };
}

function wranglerInherit(args) {
  console.log(`\n→ wrangler ${args.join(' ')}\n`);
  const result = spawnSync(process.execPath, [wranglerBin(), ...args], {
    stdio: 'inherit',
    env: wranglerEnv(),
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`wrangler ${args[0]} failed`);
  }
}

function wranglerOAuthConfigPath() {
  if (process.env.WRANGLER_CONFIG_PATH) return process.env.WRANGLER_CONFIG_PATH;
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Preferences', '.wrangler', 'config', 'default.toml');
  }
  // Windows + Linux use XDG-style paths (Windows: %APPDATA%\xdg.config\…)
  const xdg =
    process.env.XDG_CONFIG_HOME ||
    (process.platform === 'win32'
      ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'xdg.config')
      : join(homedir(), '.config'));
  return join(xdg, '.wrangler', 'config', 'default.toml');
}

function hasCloudflareApiToken() {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim());
}

function hasWranglerOAuthFile() {
  const path = wranglerOAuthConfigPath();
  if (!existsSync(path)) return false;
  try {
    return /oauth_token\s*=/.test(readFileSync(path, 'utf8'));
  } catch {
    return false;
  }
}

/** Quiet check — prefer TTY stdin so OAuth refresh is allowed. */
function wranglerLoggedIn() {
  if (hasCloudflareApiToken()) return true;
  const result = wranglerSync(['whoami']);
  return (result.status ?? 1) === 0;
}

function printLoginHelp() {
  const isWin = process.platform === 'win32';
  console.error(`
Cloudflare login did not finish${isWin ? ' (common on Windows when launched from npm)' : ''}.

In this same terminal, run:

  ${isWin ? 'Remove-Item Env:CI -ErrorAction SilentlyContinue\n  ' : ''}npx wrangler login
  npx wrangler whoami

Then re-run:

  npm run onboard:sandbox

Or set a token instead of browser login:
  https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
  ${isWin ? '$env:CLOUDFLARE_API_TOKEN="your-token-here"' : 'export CLOUDFLARE_API_TOKEN=your-token-here'}
`);
}

/**
 * Open the Wrangler OAuth browser flow. Returns true if login appears to succeed.
 * On Windows, retries via `npx` + shell when the direct node spawn fails.
 */
function runWranglerLogin() {
  console.log(`
Log in to Cloudflare (browser window will open)…
`);

  let result = spawnSync(process.execPath, [wranglerBin(), 'login'], {
    stdio: 'inherit',
    env: wranglerEnv(),
  });
  if ((result.status ?? 1) === 0) return true;

  if (process.platform === 'win32') {
    console.log('\nRetrying with: npx wrangler login\n');
    result = spawnSync('npx', ['wrangler', 'login'], {
      stdio: 'inherit',
      env: wranglerEnv(),
      shell: true,
    });
    if ((result.status ?? 1) === 0) return true;
  }

  return false;
}

function ensureCloudflareLogin() {
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    console.log('Note: CI was set in the environment; clearing it for Wrangler calls.');
  }

  if (wranglerLoggedIn()) {
    console.log(
      hasCloudflareApiToken()
        ? '✓ Using CLOUDFLARE_API_TOKEN'
        : '✓ Cloudflare login OK'
    );
    return;
  }

  if (!process.stdin.isTTY) {
    console.error(`
Not logged in to Cloudflare, and this terminal has no interactive TTY.
Run in a real terminal:

  npx wrangler login
  npx wrangler whoami

Or set CLOUDFLARE_API_TOKEN.
`);
    process.exit(1);
  }

  if (!hasWranglerOAuthFile() && !hasCloudflareApiToken()) {
    console.log('Not logged in to Cloudflare yet — starting login…');
  }

  if (!runWranglerLogin()) {
    printLoginHelp();
    process.exit(1);
  }

  if (!wranglerLoggedIn()) {
    console.error('Still not logged in after wrangler login.');
    printLoginHelp();
    process.exit(1);
  }
  console.log('✓ Cloudflare login OK');
}

/** Extract JSON when wrangler appends ANSI warnings after the payload. */
function parseJsonPayload(text) {
  const raw = String(text ?? '');
  const start = raw.search(/[\[{]/);
  if (start < 0) throw new Error('No JSON in wrangler output');
  const sliced = raw.slice(start);
  try {
    return JSON.parse(sliced);
  } catch {
    // Trailing noise after a top-level array/object — trim to last matching closer.
    const open = sliced[0];
    const close = open === '[' ? ']' : '}';
    const end = sliced.lastIndexOf(close);
    if (end < 0) throw new Error('No JSON in wrangler output');
    return JSON.parse(sliced.slice(0, end + 1));
  }
}

function listD1() {
  const result = wranglerSync(['d1', 'list', '--json']);
  const errText = `${result.stderr || ''}${result.stdout || ''}`;
  if ((result.status ?? 1) !== 0) {
    if (/CLOUDFLARE_API_TOKEN|non-interactive|not logged in|Did not login/i.test(errText)) {
      throw new Error(
        `Wrangler is not authenticated for API calls.\n${errText.trim()}\n\nFix: npx wrangler login   OR   set CLOUDFLARE_API_TOKEN`
      );
    }
    // Soft-fail for transient list issues — create path can still work.
    console.warn(`Warning: d1 list failed (exit ${result.status}). Continuing…`);
    if (errText.trim()) console.warn(errText.trim());
    return [];
  }
  // JSON is on stdout; warnings land on stderr — never merge before parse.
  const payload = (result.stdout || '').trim();
  if (!payload) return [];
  try {
    return parseJsonPayload(payload);
  } catch (err) {
    console.warn(`Warning: could not parse d1 list JSON (${err.message}). Continuing…`);
    return [];
  }
}

function createD1(name) {
  console.log(`\n→ wrangler d1 create ${name}\n`);
  const result = wranglerSync(['d1', 'create', name]);
  const out = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const match = out.match(/database_id\s*=\s*"([^"]+)"/);
  if (match) return match[1];

  // Already exists (or create output lacked the id) — resolve via list.
  if ((result.status ?? 1) !== 0 && !/already exists/i.test(out)) {
    if (/CLOUDFLARE_API_TOKEN|non-interactive/i.test(out)) {
      throw new Error(
        `D1 create failed because Wrangler thinks this terminal is non-interactive.\n` +
          `Run in PowerShell:\n` +
          `  Remove-Item Env:CI -ErrorAction SilentlyContinue\n` +
          `  npx wrangler login\n` +
          `  npx wrangler d1 create ${name}\n` +
          `Or set CLOUDFLARE_API_TOKEN, then re-run the wizard.\n\n${out.trim()}`
      );
    }
    throw new Error(out.trim() || `Failed to create D1 database ${name}`);
  }
  const listed = listD1().find((db) => db.name === name);
  return listed?.uuid ?? null;
}

function putSecret(name, value) {
  // Refresh OAuth while stdin is still a TTY, then pipe the secret value.
  if (!hasCloudflareApiToken()) {
    const who = wranglerSync(['whoami']);
    if ((who.status ?? 1) !== 0) {
      throw new Error('Not logged in to Cloudflare — run: npx wrangler login');
    }
  }
  const args = ['secret', 'put', name, ...wranglerConfigArgs()];
  const result = wranglerSync(args, {
    // Trailing newline required for wrangler secret put stdin.
    input: `${value}\n`,
  });
  if (result.status !== 0) {
    const detail =
      result.error?.message ||
      result.stderr ||
      result.stdout ||
      `(exit ${result.status ?? 'unknown'})`;
    console.error(detail);
    throw new Error(`Failed to set secret ${name}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function patchWrangler({ name, databaseName, databaseId, siteOrigin, schedule, includeCrons }) {
  let content = readFileSync(CONFIG, 'utf8');

  content = content.replace(/^name\s*=.*/m, `name = "${name}"`);
  content = content.replace(/database_name\s*=.*/m, `database_name = "${databaseName}"`);
  content = content.replace(/database_id\s*=.*/m, `database_id = "${databaseId}"`);

  const origin = siteOrigin.replace(/\/$/, '');
  content = setTomlVar(content, 'SITE_ORIGIN', origin);
  content = setTomlVar(content, 'SCHEDULE_TIMEZONE', schedule.timezone);
  content = setTomlVar(content, 'SCHEDULE_ANNOUNCE_WEEKDAY', String(schedule.announceWeekday));
  content = setTomlVar(content, 'SCHEDULE_ANNOUNCE_TIME', schedule.announceLocalTime);
  content = setTomlVar(content, 'SCHEDULE_MEET_TIME', schedule.meetLocalTime);
  content = setTomlVar(content, 'SCHEDULE_RATE_OPEN_TIME', schedule.rateOpenLocalTime);
  content = setTomlVar(content, 'SCHEDULE_RATE_CLOSE_TIME', schedule.rateCloseLocalTime);
  content = setTomlVar(content, 'SCHEDULE_HOLIDAY_SHIFT', schedule.holidayShift);

  const crons = buildCronBundle(schedule);
  const cronLines = includeCrons
    ? [crons.announce, crons.openRatings, crons.closeRatings]
    : [];
  // Persist exact trigger strings so the Worker matches Cloudflare's event.cron
  // even across DST seasons (regenerating UTC hours at runtime can drift).
  if (includeCrons) {
    content = setTomlVar(content, 'SCHEDULE_CRON_ANNOUNCE', crons.announce);
    content = setTomlVar(content, 'SCHEDULE_CRON_OPEN', crons.openRatings);
    content = setTomlVar(content, 'SCHEDULE_CRON_CLOSE', crons.closeRatings);
  }
  content = setCronBlock(content, cronLines);

  writeFileSync(CONFIG, content);
  return { crons, includeCrons };
}

function updateSiteOrigin(origin) {
  let content = readFileSync(CONFIG, 'utf8');
  content = setTomlVar(content, 'SITE_ORIGIN', origin.replace(/\/$/, ''));
  writeFileSync(CONFIG, content);
}

function clearCronsInConfig() {
  let content = readFileSync(CONFIG, 'utf8');
  content = setCronBlock(content, []);
  writeFileSync(CONFIG, content);
}

function isProtectedExistingConfig(content) {
  const protectedIds = protectedDatabaseIds();
  for (const id of protectedIds) {
    if (content.includes(id)) return true;
  }
  // Local maintainer convention: worker name "oracle" means production on this machine.
  return /^name\s*=\s*"oracle"\s*$/m.test(content);
}

function isProtectedDatabaseId(id) {
  return Boolean(id) && protectedDatabaseIds().has(id);
}

/**
 * Build + deploy. If Free-plan cron limit hits, strip crons and retry once.
 * Then sync SITE_ORIGIN to the real workers.dev URL when the configured value
 * was a placeholder (never overwrites a custom domain).
 */
function buildAndDeploy({ workerName, siteOrigin, includeCrons }) {
  run('npm run build');

  const deployArgs = ['deploy', ...wranglerConfigArgs()];
  let deploy = wranglerCaptureInherit(deployArgs);
  let usedCrons = includeCrons;

  const cronBlocked =
    isCronLimitError(deploy.out) && (deploy.status !== 0 || includeCrons);

  if (cronBlocked && includeCrons) {
    console.log(`
⚠ Cloudflare Free plan allows only 5 cron triggers per account.
  Clearing cron schedules on this Worker and redeploying.
  You can still announce / open / close ratings from /admin.
`);
    clearCronsInConfig();
    usedCrons = false;
    deploy = wranglerCaptureInherit(deployArgs);
  }

  if (deploy.status !== 0) {
    throw new Error('Deploy failed. See wrangler output above.');
  }

  const liveUrl = extractWorkersDevUrl(deploy.out, workerName);
  let finalOrigin = siteOrigin.replace(/\/$/, '');

  if (shouldSyncSiteOriginToWorkersDev(finalOrigin, liveUrl, workerName)) {
    console.log(`\n✓ Live URL is ${liveUrl} — updating SITE_ORIGIN and redeploying vars…`);
    updateSiteOrigin(liveUrl);
    finalOrigin = liveUrl;
    const again = wranglerCaptureInherit(deployArgs);
    if (again.status !== 0) {
      console.log('⚠ Redeploy to sync SITE_ORIGIN failed; site still works at the URL above.');
    }
  } else if (liveUrl && finalOrigin === liveUrl) {
    finalOrigin = liveUrl;
  }

  return { origin: finalOrigin, usedCrons, liveUrl };
}

function defaultSchedule() {
  const announceLocalTime = '10:00';
  const related = deriveRelatedTimes(announceLocalTime);
  return {
    timezone: 'Australia/Perth',
    announceWeekday: 5,
    announceLocalTime,
    ...related,
    holidayShift: 'none',
  };
}

/**
 * Ask announce day/time (always, unless --yes), then derive meet + ratings crons.
 * Crons: announce + open-ratings on announce weekday; close-ratings next weekday.
 */
async function promptSchedule() {
  if (YES) {
    const schedule = defaultSchedule();
    console.log('\n── Weekly schedule (auto) ──');
    console.log(formatScheduleSummary(schedule));
    return schedule;
  }

  console.log('\n── Weekly schedule ──');
  console.log('Pick when the pub is announced. Meet and ratings times are derived from that');
  console.log('(ratings close the following calendar day). You can tweak the derived times.\n');

  const timezone = await askValidated({
    question: 'IANA timezone',
    example: 'Australia/Perth',
    defaultValue: 'Australia/Perth',
    human: true,
    validate: (raw) => {
      if (!isValidIanaTimeZone(raw)) {
        return {
          ok: false,
          error: 'Not a valid IANA timezone (use Continent/City).',
        };
      }
      return { ok: true, value: String(raw).trim() };
    },
  });

  const announceWeekday = await askValidated({
    question: 'Announce weekday',
    example: 'Friday',
    defaultValue: 'Friday',
    human: true,
    validate: (raw) => {
      const day = parseWeekdayStrict(raw);
      if (day === null) {
        return {
          ok: false,
          error: 'Use a day name like Monday–Sunday (or 0–6).',
        };
      }
      return { ok: true, value: day };
    },
  });

  const announceLocalTime = await askValidated({
    question: 'Announce time (24-hour HH:MM)',
    example: '10:00',
    defaultValue: '10:00',
    human: true,
    validate: (raw) => {
      const t = parseHhmmStrict(raw);
      if (!t) {
        return { ok: false, error: 'Use 24-hour HH:MM, e.g. 09:00 or 14:30.' };
      }
      return { ok: true, value: t };
    },
  });

  const related = deriveRelatedTimes(announceLocalTime);

  let meetLocalTime = related.meetLocalTime;
  let rateOpenLocalTime = related.rateOpenLocalTime;
  let rateCloseLocalTime = related.rateCloseLocalTime;

  const preview = {
    timezone,
    announceWeekday,
    announceLocalTime,
    meetLocalTime,
    rateOpenLocalTime,
    rateCloseLocalTime,
    holidayShift: 'none',
  };
  console.log(`\nDerived from announce ${WEEKDAY_LABELS[announceWeekday]} ${announceLocalTime}:`);
  console.log(formatScheduleSummary(preview));
  console.log('');

  if (await yesHuman('Customize meet / ratings open / ratings close times?', false)) {
    meetLocalTime = await askValidated({
      question: 'Meet time (24-hour HH:MM)',
      example: '12:00',
      defaultValue: meetLocalTime,
      human: true,
      validate: (raw) => {
        const t = parseHhmmStrict(raw);
        if (!t) return { ok: false, error: 'Use 24-hour HH:MM, e.g. 12:00.' };
        return { ok: true, value: t };
      },
    });
    const defaultOpen = addMinutesHhmm(meetLocalTime, 20);
    rateOpenLocalTime = await askValidated({
      question: 'Ratings open time same day (24-hour HH:MM)',
      example: defaultOpen,
      defaultValue: defaultOpen,
      human: true,
      validate: (raw) => {
        const t = parseHhmmStrict(raw);
        if (!t) return { ok: false, error: 'Use 24-hour HH:MM, e.g. 12:20.' };
        return { ok: true, value: t };
      },
    });
    rateCloseLocalTime = await askValidated({
      question: `Ratings close time next day (${WEEKDAY_LABELS[(announceWeekday + 1) % 7]}) (24-hour HH:MM)`,
      example: '23:59',
      defaultValue: rateCloseLocalTime,
      human: true,
      validate: (raw) => {
        const t = parseHhmmStrict(raw);
        if (!t) return { ok: false, error: 'Use 24-hour HH:MM, e.g. 23:59.' };
        return { ok: true, value: t };
      },
    });
  }

  let holidayShift = 'none';
  if (await yesHuman('Shift announce one day earlier when that weekday is a WA public holiday?', false)) {
    holidayShift = 'wa';
  }

  const schedule = {
    timezone,
    announceWeekday,
    announceLocalTime,
    meetLocalTime,
    rateOpenLocalTime,
    rateCloseLocalTime,
    holidayShift,
  };
  console.log('\nFinal schedule:');
  console.log(formatScheduleSummary(schedule));
  return schedule;
}

async function promptAdminPassword() {
  console.log('\n── Admin password ──');
  console.log('This is what you type on /admin. Leave blank to auto-generate one.');
  let adminPassword = await askValidated({
    question: 'Choose an admin password',
    example: 'correct-horse-battery',
    defaultValue: '',
    human: true,
    validate: (raw) => {
      if (!isValidOptionalPassword(raw)) {
        return {
          ok: false,
          error: 'Password must be 4–128 characters with no leading/trailing spaces (or leave blank).',
        };
      }
      return { ok: true, value: String(raw ?? '').trim() };
    },
  });
  if (!adminPassword) {
    adminPassword = randomBytes(9).toString('base64url');
    console.log(`\nGenerated password:\n\n  ${adminPassword}\n`);
  }
  writeFileSync(PASSWORD_FILE, adminPassword, 'utf8');
  console.log(`Saved to ${PASSWORD_FILE}`);
  return adminPassword;
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════╗
║  Weekly Picker — ${SANDBOX ? 'SANDBOX wizard' : 'setup wizard'}              ║
╚══════════════════════════════════════════════════╝
`);

  if (!YES && !process.stdin.isTTY) {
    console.error(`
This wizard needs an interactive terminal (prompts + Cloudflare login).
Open PowerShell or Command Prompt in the project folder, then run:

  npx wrangler login
  npm run onboard${SANDBOX ? ':sandbox' : ''}

Or for a fully non-interactive run (after login / with CLOUDFLARE_API_TOKEN):

  npm run onboard${SANDBOX ? ':sandbox' : ''} -- --yes
`);
    process.exit(1);
  }

  if (SANDBOX) {
    console.log(`Sandbox mode: writes ${CONFIG} only (never touches wrangler.toml).
You will choose Worker/D1 names, schedule, admin password, and deploy.
`);
  } else if (YES) {
    console.log(`Auto mode (--yes): accepting all defaults for a brand-new site.
Writes ${CONFIG}. Does not run if a protected production config is present
(unless you choose deploy-only interactively — --yes takes deploy-only).
`);
  } else {
    console.log(`This walks you through Cloudflare login, schedule, database, secrets,
and optional deploy. It does NOT delete existing D1 data.
`);
  }

  if (!SANDBOX) {
    const hasWrangler = existsSync('wrangler.toml');
    const wranglerContent = hasWrangler ? readFileSync('wrangler.toml', 'utf8') : '';

    if (hasWrangler && isProtectedExistingConfig(wranglerContent)) {
      console.log('Detected a protected production config in wrangler.toml (local guard).');
      console.log('  • Updating that site?     → Y to deploy-only');
      console.log('  • Brand-new site (fork)?  → N, then Y to overwrite wrangler.toml');
      console.log('  • Safe trial only?        → Ctrl+C and run: npm run onboard:sandbox\n');

      // --yes on a machine with production config → deploy-only (never wipe/recreate).
      if (await yes('Deploy code only (safe — keeps all pubs & branding in D1)?', true)) {
        ensureCloudflareLogin();
        run('npm run deploy');
        console.log('\n✓ Deploy complete. Your D1 data was not modified.\n');
        rl.close();
        return;
      }
      if (!(await yes('Overwrite wrangler.toml and set up a NEW site on YOUR Cloudflare account?', false))) {
        console.log('Aborted. Use npm run onboard:sandbox for a safe trial.');
        rl.close();
        return;
      }
    }
  }

  if (!existsSync('node_modules')) {
    run('npm install');
  }

  ensureCloudflareLogin();

  // Always start from the example when config is missing.
  // Avoid short-circuit bugs that steal the first typed answer as the worker name.
  if (!existsSync(CONFIG)) {
    copyFileSync('wrangler.toml.example', CONFIG);
    console.log(`✓ Copied wrangler.toml.example → ${CONFIG}`);
  } else if (!AUTO && (await yes(`Recreate ${CONFIG} from example?`, false))) {
    copyFileSync('wrangler.toml.example', CONFIG);
    console.log(`✓ Copied wrangler.toml.example → ${CONFIG}`);
  }

  const defaultWorker = SANDBOX ? 'weekly-picker-sandbox' : 'my-weekly-picker';
  const defaultDb = SANDBOX ? 'weekly-picker-sandbox-db' : 'weekly-picker-db';

  let workerName = await askValidated({
    question: 'Worker name (workers.dev subdomain)',
    example: defaultWorker,
    defaultValue: defaultWorker,
    validate: (raw) => {
      const name = normalizeResourceName(raw);
      if (!isValidResourceName(name)) {
        return {
          ok: false,
          error: 'Use lowercase letters, numbers, hyphens; start with a letter (e.g. my-weekly-picker).',
        };
      }
      if (SANDBOX && RESERVED_WORKER_NAMES.has(name)) {
        return { ok: false, error: `"${name}" is reserved for production — pick another name.` };
      }
      return { ok: true, value: name };
    },
  });

  // Placeholder until deploy prints the real https://name.account.workers.dev URL.
  // Custom domains entered here are kept (never overwritten after deploy).
  let siteOrigin = await askValidated({
    question: 'Public site URL',
    example: `https://${workerName}.workers.dev`,
    defaultValue: `https://${workerName}.workers.dev`,
    validate: (raw) => {
      if (!isValidSiteOrigin(raw)) {
        return {
          ok: false,
          error: 'Enter a full URL like https://my-site.workers.dev or https://picker.example.com',
        };
      }
      return { ok: true, value: normalizeSiteOrigin(raw) };
    },
  });

  console.log('\n── Database (D1) ──');
  let dbName = await askValidated({
    question: 'D1 database name',
    example: defaultDb,
    defaultValue: defaultDb,
    validate: (raw) => {
      const name = normalizeResourceName(raw);
      if (!isValidResourceName(name)) {
        return {
          ok: false,
          error: 'Use lowercase letters, numbers, hyphens; start with a letter (e.g. weekly-picker-db).',
        };
      }
      if (SANDBOX && RESERVED_DB_NAMES.has(name)) {
        return { ok: false, error: `"${name}" is reserved for production — pick another name.` };
      }
      return { ok: true, value: name };
    },
  });

  const databases = listD1();
  const existing = databases.find((db) => db.name === dbName);
  let databaseId = existing?.uuid;

  if (existing) {
    if (isProtectedDatabaseId(existing.uuid)) {
      console.log('That database is listed in .protect-databases. Aborting.');
      rl.close();
      process.exit(1);
    }
    console.log(`Found existing database: ${dbName} (${databaseId})`);
    if (!(await yes('Use this database?', true))) databaseId = undefined;
  }

  if (!databaseId) {
    if (await yes(`Create new D1 database named ${dbName}?`, true)) {
      databaseId = createD1(dbName);
      if (!databaseId) {
        console.error('Could not determine database_id after create. Check wrangler output.');
        rl.close();
        process.exit(1);
      }
      console.log(`✓ Created ${dbName} (${databaseId})`);
    } else {
      databaseId = await askValidated({
        question: 'Paste database_id from Cloudflare dashboard',
        example: 'd60055ce-335a-4afa-b6ad-d4c6da7fde9c',
        defaultValue: '',
        validate: (raw) => {
          const id = String(raw ?? '').trim().toLowerCase();
          if (!isValidDatabaseId(id)) {
            return {
              ok: false,
              error: 'Must be a UUID like d60055ce-335a-4afa-b6ad-d4c6da7fde9c.',
            };
          }
          return { ok: true, value: id };
        },
      });
    }
  }

  if (isProtectedDatabaseId(databaseId)) {
    console.log('Refusing database_id listed in .protect-databases. Aborting.');
    rl.close();
    process.exit(1);
  }

  const schedule = await promptSchedule();

  // Sandbox shares the Free-plan cron quota with any existing Workers — skip crons up front.
  // Normal onboard includes crons, then falls back automatically if the account is out of quota.
  const includeCrons = !SANDBOX;
  const { crons } = patchWrangler({
    name: workerName,
    databaseName: dbName,
    databaseId,
    siteOrigin,
    schedule,
    includeCrons,
  });
  console.log(`✓ Updated ${CONFIG}`);
  console.log(formatScheduleSummary(schedule));
  if (includeCrons) {
    console.log(`  Crons (UTC): ${crons.announce} | ${crons.openRatings} | ${crons.closeRatings}`);
    console.log(
      `  (= announce+open on ${WEEKDAY_LABELS[schedule.announceWeekday]}; close on ${WEEKDAY_LABELS[(schedule.announceWeekday + 1) % 7]})`
    );
  } else {
    console.log('  Crons: skipped in sandbox (Free-plan limit; use Admin to announce)');
  }

  if (!SANDBOX && (await yes('Apply blank template assets (HTML, icon, manifest)?', true))) {
    run('npm run apply-template');
  } else if (SANDBOX) {
    console.log('Skipping apply-template in sandbox (keeps your local HTML/icons unchanged).');
  }

  const adminPassword = await promptAdminPassword();

  if (await yes('Upload ADMIN_PASSWORD to Cloudflare now?', true)) {
    putSecret('ADMIN_PASSWORD', adminPassword);
    console.log('✓ ADMIN_PASSWORD set');
  }

  if (!YES && !SANDBOX && (await yes('Also set an optional API token for curl/scripts?', false))) {
    const adminToken = randomBytes(32).toString('hex');
    console.log(`\nADMIN_API_TOKEN:\n\n  ${adminToken}\n`);
    putSecret('ADMIN_API_TOKEN', adminToken);
    console.log('✓ ADMIN_API_TOKEN set');
  }

  console.log('\n── Database tables ──');
  console.log('Creates empty tables only (no venues).');
  if (await yes('Apply schema.sql to this remote D1?', true)) {
    wranglerInherit([
      'd1',
      'execute',
      dbName,
      '--remote',
      ...wranglerConfigArgs(),
      '--file=schema.sql',
    ]);
  }

  if (!SANDBOX && !YES) {
    console.log('\n── Custom domain ──');
    console.log(
      'After deploy: Workers & Pages → your worker → Settings → Domains & Routes → add your domain.'
    );
  }

  let origin = siteOrigin.replace(/\/$/, '');
  let usedCrons = includeCrons;
  let liveUrl = null;

  if (await yes('Deploy now?', true)) {
    const result = buildAndDeploy({ workerName, siteOrigin, includeCrons });
    origin = result.origin;
    usedCrons = result.usedCrons;
    liveUrl = result.liveUrl;
  }

  const liveNote =
    liveUrl && liveUrl !== origin
      ? `  workers.dev (also live): ${liveUrl}\n`
      : '';

  console.log(`
╔══════════════════════════════════════════════════╗
║  ${SANDBOX ? 'Sandbox' : 'Setup'} complete                                  ║
╚══════════════════════════════════════════════════╝

  Site:     ${origin}
  Admin:    ${origin}/admin
${liveNote}  Password: ${adminPassword}
            (also in ${PASSWORD_FILE})
  Config:   ${CONFIG}
  D1:       ${dbName}
  When:     ${WEEKDAY_LABELS[schedule.announceWeekday]} ${schedule.announceLocalTime} ${schedule.timezone}
${!usedCrons ? '  Crons:    off on this Worker (announce from Admin)\n' : ''}
${
  SANDBOX
    ? `Existing production configs were not modified.
Delete this trial later in Cloudflare dashboard (Worker + D1) if you want.

Next: open Admin → Site branding, then add venues.
`
    : `Next:
  • Open /admin and sign in with the password above
  • Site branding + add venues
  • Attach a custom domain if you want (SITE_ORIGIN already keeps a custom URL if you entered one)
`
}Docs: SETUP.md
`);
  rl.close();
}

main().catch((err) => {
  console.error(err.message || err);
  rl.close();
  process.exit(1);
});
