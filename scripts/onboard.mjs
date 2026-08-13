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

const ORACLE_DB_ID = '00000000-0000-0000-0000-000000000000';
const ORACLE_WORKER = 'oracle';
const SANDBOX = process.argv.includes('--sandbox');
const CONFIG = SANDBOX ? 'wrangler.sandbox.toml' : 'wrangler.toml';

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

function patchWrangler({ name, databaseName, databaseId, siteOrigin }) {
  let content = readFileSync(CONFIG, 'utf8');

  content = content.replace(/^name\s*=.*/m, `name = "${name}"`);
  content = content.replace(/database_name\s*=.*/m, `database_name = "${databaseName}"`);
  content = content.replace(/database_id\s*=.*/m, `database_id = "${databaseId}"`);

  const origin = siteOrigin.replace(/\/$/, '');
  if (/SITE_ORIGIN\s*=/.test(content)) {
    content = content.replace(/SITE_ORIGIN\s*=.*/m, `SITE_ORIGIN = "${origin}"`);
  } else if (/\[vars\]/.test(content)) {
    content = content.replace(/\[vars\]/, `[vars]\nSITE_ORIGIN = "${origin}"`);
  } else {
    content += `\n[vars]\nSITE_ORIGIN = "${origin}"\n`;
  }

  writeFileSync(CONFIG, content);
}

function isOracleProduction(content) {
  return content.includes(ORACLE_DB_ID) || /^name\s*=\s*"oracle"\s*$/m.test(content);
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════╗
║  Weekly Picker — ${SANDBOX ? 'SANDBOX wizard' : 'setup wizard'}              ║
╚══════════════════════════════════════════════════╝
`);

  if (SANDBOX) {
    console.log(`Sandbox mode: writes ${CONFIG} only.
Oracle production (wrangler.toml / oracle-db / worker "oracle") is left alone.
`);
  } else {
    console.log(`This walks you through Cloudflare login, database, secrets,
and optional deploy. It does NOT delete existing D1 data.
`);
  }

  if (!SANDBOX) {
    const hasWrangler = existsSync('wrangler.toml');
    const wranglerContent = hasWrangler ? readFileSync('wrangler.toml', 'utf8') : '';

    if (hasWrangler && isOracleProduction(wranglerContent)) {
      console.log('Detected Finn\'s Oracle production config in wrangler.toml.');
      console.log('  • Updating Oracle?          → Y to deploy-only');
      console.log('  • Your OWN new site (fork)? → N, then Y to overwrite wrangler.toml');
      console.log('  • Safe trial only?          → Ctrl+C and run: npm run onboard:sandbox\n');
      if (await yes('Deploy code only to Oracle (safe — keeps all pubs & branding in D1)?', true)) {
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

  const defaultWorker = SANDBOX ? 'oracle-sandbox' : 'my-weekly-picker';
  const defaultDb = SANDBOX ? 'oracle-sandbox-db' : 'oracle-db';

  let workerName = await ask('Worker name (workers.dev subdomain)', defaultWorker);
  if (SANDBOX && (workerName === ORACLE_WORKER || workerName === 'oracle')) {
    console.log(`Refusing worker name "${workerName}" in sandbox — that is production.`);
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
    console.log('Refusing database name "oracle-db" in sandbox — that is production.');
    rl.close();
    process.exit(1);
  }

  const databases = listD1();
  const existing = databases.find((db) => db.name === dbName);
  let databaseId = existing?.uuid;

  if (existing) {
    if (existing.uuid === ORACLE_DB_ID) {
      console.log('That database is Oracle production. Aborting.');
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

  if (databaseId === ORACLE_DB_ID) {
    console.log('Refusing Oracle production database_id. Aborting.');
    rl.close();
    process.exit(1);
  }

  patchWrangler({ name: workerName, databaseName: dbName, databaseId, siteOrigin });
  console.log(`✓ Updated ${CONFIG}`);

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

${SANDBOX ? `Oracle production was not modified.
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
