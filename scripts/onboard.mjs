#!/usr/bin/env node
/**
 * Interactive first-time setup + deploy walkthrough.
 *
 *   npm run onboard              # normal (protects Oracle production config)
 *   npm run onboard -- --yes     # fully non-interactive new site (wrangler.toml)
 *   npm run onboard:sandbox      # separate Worker + D1; asks schedule + password only
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
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import {
  addMinutesHhmm,
  buildCronBundle,
  deriveRelatedTimes,
  formatScheduleSummary,
  parseHhmmInput,
  parseWeekdayInput,
  WEEKDAY_LABELS,
} from './schedule-lib.mjs';
import {
  extractWorkersDevUrl,
  isCronLimitError,
  setCronBlock,
  setTomlVar,
  shouldSyncSiteOriginToWorkersDev,
} from './onboard-lib.mjs';

const SANDBOX = process.argv.includes('--sandbox');
/** Fully non-interactive (CI / agents). Sandbox still asks schedule + password unless --yes. */
const YES = process.argv.includes('--yes');
/** Auto-accept infra defaults (names, D1, deploy). Sandbox always does this. */
const AUTO = SANDBOX || YES;
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

function ask(question, defaultValue = '') {
  if (AUTO) {
    const shown = defaultValue || '(none)';
    console.log(`${question}: ${shown}`);
    return Promise.resolve(defaultValue);
  }
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue);
    });
  });
}

/** Always prompt unless `--yes` (used for schedule + admin password). */
function askHuman(question, defaultValue = '') {
  if (YES) {
    const shown = defaultValue || '(none)';
    console.log(`${question}: ${shown}`);
    return Promise.resolve(defaultValue);
  }
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue);
    });
  });
}

function yes(question, defaultYes = true) {
  if (AUTO) {
    console.log(`${question}: ${defaultYes ? 'yes' : 'no'} (auto)`);
    return Promise.resolve(defaultYes);
  }
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return ask(`${question} (${hint})`, defaultYes ? 'y' : 'n').then(
    (a) => a.toLowerCase() === 'y' || (defaultYes && a === '')
  );
}

function yesHuman(question, defaultYes = true) {
  if (YES) {
    console.log(`${question}: ${defaultYes ? 'yes' : 'no'} (auto)`);
    return Promise.resolve(defaultYes);
  }
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return askHuman(`${question} (${hint})`, defaultYes ? 'y' : 'n').then(
    (a) => a.toLowerCase() === 'y' || (defaultYes && a === '')
  );
}

function wranglerArgs(extra = '') {
  return SANDBOX ? `--config ${CONFIG} ${extra}`.trim() : extra.trim();
}

function run(cmd, opts = {}) {
  console.log(`\n→ ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/** Run a command, stream output to the terminal, and return combined stdout+stderr. */
function runCaptureInherit(cmd) {
  console.log(`\n→ ${cmd}\n`);
  const result = spawnSync(cmd, {
    shell: true,
    encoding: 'utf8',
  });
  const out = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return { status: result.status ?? 1, out };
}

function wranglerLoggedIn() {
  try {
    runCapture('npx wrangler whoami');
    return true;
  } catch {
    return false;
  }
}

function listD1() {
  try {
    return JSON.parse(runCapture('npx wrangler d1 list --json'));
  } catch {
    return [];
  }
}

function createD1(name) {
  const out = runCapture(`npx wrangler d1 create ${name}`);
  const match = out.match(/database_id\s*=\s*"([^"]+)"/);
  if (match) return match[1];
  const list = listD1().find((db) => db.name === name);
  return list?.uuid ?? null;
}

function putSecret(name, value) {
  const args = ['wrangler', 'secret', 'put', name];
  if (SANDBOX) args.push('--config', CONFIG);
  const result = spawnSync('npx', args, {
    // Trailing newline required; avoid PowerShell pipe quirks by feeding spawnSync directly.
    input: `${value}\n`,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    throw new Error(`Failed to set secret ${name}`);
  }
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

  let deploy = runCaptureInherit(`npx wrangler deploy ${wranglerArgs()}`.trim());
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
    deploy = runCaptureInherit(`npx wrangler deploy ${wranglerArgs()}`.trim());
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
    const again = runCaptureInherit(`npx wrangler deploy ${wranglerArgs()}`.trim());
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

  const timezone = await askHuman('IANA timezone', 'Australia/Perth');
  const announceWeekday = parseWeekdayInput(
    await askHuman('Announce weekday (Mon–Sun)', 'Friday'),
    5
  );
  const announceLocalTime = parseHhmmInput(await askHuman('Announce time (HH:MM)', '10:00'), '10:00');
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
    meetLocalTime = parseHhmmInput(await askHuman('Meet time (HH:MM)', meetLocalTime), meetLocalTime);
    const defaultOpen = addMinutesHhmm(meetLocalTime, 20);
    rateOpenLocalTime = parseHhmmInput(
      await askHuman('Ratings open time same day (HH:MM)', defaultOpen),
      defaultOpen
    );
    rateCloseLocalTime = parseHhmmInput(
      await askHuman(
        `Ratings close time next day (${WEEKDAY_LABELS[(announceWeekday + 1) % 7]}) (HH:MM)`,
        rateCloseLocalTime
      ),
      rateCloseLocalTime
    );
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
  let adminPassword = await askHuman('Choose an admin password', '');
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

  if (SANDBOX) {
    console.log(`Sandbox mode: writes ${CONFIG} only (never touches wrangler.toml).
Infra steps are automatic. You will still choose announce day/time and an admin password.
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
        if (!wranglerLoggedIn()) run('npx wrangler login');
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

  if (!wranglerLoggedIn()) {
    console.log('Log in to Cloudflare (browser window will open)…');
    run('npx wrangler login');
  } else {
    console.log('✓ Cloudflare login OK');
  }

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

  let workerName = await ask('Worker name (workers.dev subdomain)', defaultWorker);
  if (SANDBOX && RESERVED_WORKER_NAMES.has(workerName)) {
    console.log(`Refusing worker name "${workerName}" in sandbox — reserved for production.`);
    workerName = defaultWorker;
    console.log(`Using ${workerName} instead.`);
  }

  // Placeholder until deploy prints the real https://name.account.workers.dev URL.
  // Custom domains entered here are kept (never overwritten after deploy).
  let siteOrigin = await ask('Public site URL', `https://${workerName}.workers.dev`);
  if (!siteOrigin.startsWith('http')) siteOrigin = `https://${siteOrigin}`;

  console.log('\n── Database (D1) ──');
  let dbName = await ask('D1 database name', defaultDb);

  if (SANDBOX && RESERVED_DB_NAMES.has(dbName)) {
    console.log(`Refusing database name "${dbName}" in sandbox — reserved for production.`);
    dbName = defaultDb;
    console.log(`Using ${dbName} instead.`);
  }

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
      databaseId = await ask('Paste database_id from Cloudflare dashboard');
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
    run(
      `npx wrangler d1 execute ${dbName} --remote ${wranglerArgs()} --file=schema.sql`
        .replace(/\s+/g, ' ')
        .trim()
    );
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
