#!/usr/bin/env node
/**
 * Interactive first-time setup + deploy walkthrough.
 *
 *   npm run onboard              # normal (protects Oracle production config)
 *   npm run onboard:sandbox      # separate Worker + D1; never touches wrangler.toml
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
  parseHhmmInput,
  parseWeekdayInput,
  WEEKDAY_LABELS,
} from './schedule-lib.mjs';

const SANDBOX = process.argv.includes('--sandbox');
const CONFIG = SANDBOX ? 'wrangler.sandbox.toml' : 'wrangler.toml';

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
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue);
    });
  });
}

function yes(question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return ask(`${question} (${hint})`, defaultYes ? 'y' : 'n').then(
    (a) => a.toLowerCase() === 'y' || (defaultYes && a === '')
  );
}

function wranglerArgs(extra) {
  return SANDBOX ? `--config ${CONFIG} ${extra}` : extra;
}

function run(cmd, opts = {}) {
  console.log(`\n→ ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
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
    input: value,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    throw new Error(`Failed to set secret ${name}`);
  }
}

function setTomlVar(content, key, value) {
  const line = `${key} = "${value}"`;
  const re = new RegExp(`^${key}\\s*=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  if (/\[vars\]/.test(content)) {
    return content.replace(/\[vars\]/, `[vars]\n${line}`);
  }
  return `${content.trimEnd()}\n\n[vars]\n${line}\n`;
}

function patchWrangler({ name, databaseName, databaseId, siteOrigin, schedule }) {
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
  const cronBlock = `[triggers]\ncrons = [\n  "${crons.announce}",\n  "${crons.openRatings}",\n  "${crons.closeRatings}",\n]\n`;
  if (/\[triggers\][\s\S]*?crons\s*=\s*\[[\s\S]*?\]/.test(content)) {
    content = content.replace(/\[triggers\][\s\S]*?crons\s*=\s*\[[\s\S]*?\]/, cronBlock.trimEnd());
  } else {
    content = `${content.trimEnd()}\n\n${cronBlock}`;
  }

  writeFileSync(CONFIG, content);
  return crons;
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

async function main() {
  console.log(`
╔══════════════════════════════════════════════════╗
║  Weekly Picker — ${SANDBOX ? 'SANDBOX wizard' : 'setup wizard'}              ║
╚══════════════════════════════════════════════════╝
`);

  if (SANDBOX) {
    console.log(`Sandbox mode: writes ${CONFIG} only.
Any existing production wrangler.toml is left alone.
`);
  } else {
    console.log(`This walks you through Cloudflare login, database, secrets,
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
      if (await yes('Deploy code only (safe — keeps all pubs & branding in D1)?', true)) {
        if (!wranglerLoggedIn()) run('npx wrangler login');
        run('npm run deploy');
        console.log('\n✓ Deploy complete. Your D1 data was not modified.\n');
        rl.close();
        return;
      }
      if (!await yes('Overwrite wrangler.toml and set up a NEW site on YOUR Cloudflare account?', false)) {
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

  if (SANDBOX) {
    if (!existsSync(CONFIG) || await yes(`Recreate ${CONFIG} from example?`, !existsSync(CONFIG))) {
      copyFileSync('wrangler.toml.example', CONFIG);
      console.log(`✓ Copied wrangler.toml.example → ${CONFIG}`);
    }
  } else if (!existsSync('wrangler.toml') || await yes('Create wrangler.toml from wrangler.toml.example?', !existsSync('wrangler.toml'))) {
    copyFileSync('wrangler.toml.example', 'wrangler.toml');
    console.log('✓ Copied wrangler.toml.example → wrangler.toml');
  }

  const defaultWorker = SANDBOX ? 'weekly-picker-sandbox' : 'my-weekly-picker';
  const defaultDb = SANDBOX ? 'weekly-picker-sandbox-db' : 'weekly-picker-db';

  let workerName = await ask('Worker name (workers.dev subdomain)', defaultWorker);
  if (SANDBOX && workerName === 'oracle') {
    console.log('Refusing worker name "oracle" in sandbox — reserved for production.');
    workerName = defaultWorker;
    console.log(`Using ${workerName} instead.`);
  }

  let siteOrigin = await ask(
    'Public site URL',
    `https://${workerName}.workers.dev`
  );
  if (!siteOrigin.startsWith('http')) siteOrigin = `https://${siteOrigin}`;

  console.log('\n── Database (D1) ──');
  const dbName = await ask('D1 database name', defaultDb);

  if (SANDBOX && dbName === 'oracle-db') {
    console.log('Refusing database name "oracle-db" in sandbox — reserved for production.');
    rl.close();
    process.exit(1);
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
    if (!await yes('Use this database?', true)) databaseId = undefined;
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

  console.log('\n── Weekly schedule ──');
  console.log('Announce day/time in your local timezone. Ratings open at meet+20 by default.');
  const timezone = await ask('IANA timezone', 'Australia/Perth');
  const announceWeekday = parseWeekdayInput(
    await ask('Announce weekday (Mon–Sun)', 'Friday'),
    5
  );
  const announceLocalTime = parseHhmmInput(await ask('Announce time (HH:MM)', '10:00'), '10:00');
  const meetLocalTime = parseHhmmInput(await ask('Meet time (HH:MM)', '12:00'), '12:00');
  const defaultOpen = addMinutesHhmm(meetLocalTime, 20);
  const rateOpenLocalTime = parseHhmmInput(
    await ask('Ratings open time (HH:MM)', defaultOpen),
    defaultOpen
  );
  const rateCloseLocalTime = parseHhmmInput(
    await ask('Ratings close time next day (HH:MM)', '23:59'),
    '23:59'
  );
  let holidayShift = 'none';
  if (await yes('Shift announce one day earlier when that weekday is a WA public holiday?', false)) {
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

  const crons = patchWrangler({
    name: workerName,
    databaseName: dbName,
    databaseId,
    siteOrigin,
    schedule,
  });
  console.log(`✓ Updated ${CONFIG}`);
  console.log(
    `  Schedule: ${WEEKDAY_LABELS[announceWeekday]} ${announceLocalTime} (${timezone}), meet ${meetLocalTime}`
  );
  console.log(`  Crons (UTC): ${crons.announce} | ${crons.openRatings} | ${crons.closeRatings}`);

  if (!SANDBOX && await yes('Apply blank template assets (HTML, icon, manifest)?', true)) {
    run('npm run apply-template');
  } else if (SANDBOX) {
    console.log('Skipping apply-template in sandbox (keeps your local Oracle HTML/icons unchanged).');
  }

  console.log('\n── Admin password ──');
  console.log('This is what you type on /admin.');
  let adminPassword = await ask('Choose an admin password (leave empty to auto-generate)', '');
  if (!adminPassword) {
    adminPassword = randomBytes(9).toString('base64url');
    console.log(`\nGenerated password (save this):\n\n  ${adminPassword}\n`);
  }

  if (await yes('Upload ADMIN_PASSWORD to Cloudflare now?', true)) {
    putSecret('ADMIN_PASSWORD', adminPassword);
    console.log('✓ ADMIN_PASSWORD set');
  }

  if (await yes('Also set an optional API token for curl/scripts?', false)) {
    const adminToken = randomBytes(32).toString('hex');
    console.log(`\nADMIN_API_TOKEN:\n\n  ${adminToken}\n`);
    putSecret('ADMIN_API_TOKEN', adminToken);
    console.log('✓ ADMIN_API_TOKEN set');
  }

  console.log('\n── Database tables ──');
  console.log('Creates empty tables only (no venues).');
  if (await yes('Apply schema.sql to this remote D1?', true)) {
    run(`npx wrangler d1 execute ${dbName} --remote ${wranglerArgs('')} --file=schema.sql`.replace(/\s+/g, ' ').trim());
  }

  if (!SANDBOX) {
    console.log('\n── Custom domain ──');
    console.log(
      'After deploy: Workers & Pages → your worker → Settings → Domains & Routes → add your domain.'
    );
  }

  if (await yes('Deploy now?', true)) {
    run('npm run build');
    run(`npx wrangler deploy ${wranglerArgs('')}`.trim());
  }

  const origin = siteOrigin.replace(/\/$/, '');
  console.log(`
╔══════════════════════════════════════════════════╗
║  ${SANDBOX ? 'Sandbox' : 'Setup'} complete                                  ║
╚══════════════════════════════════════════════════╝

  Site:   ${origin}
  Admin:  ${origin}/admin
  Worker: https://${workerName}.workers.dev
  Config: ${CONFIG}
  D1:     ${dbName}
  When:   ${WEEKDAY_LABELS[announceWeekday]} ${announceLocalTime} ${timezone}

${SANDBOX ? `Existing production configs were not modified.
Delete this trial later in Cloudflare dashboard (Worker + D1) if you want.
` : `Next:
  • Attach custom domain if needed
  • Open /admin and sign in with your password
  • Site branding + add venues
`}
Docs: SETUP.md
`);
  rl.close();
}

main().catch((err) => {
  console.error(err.message || err);
  rl.close();
  process.exit(1);
});
