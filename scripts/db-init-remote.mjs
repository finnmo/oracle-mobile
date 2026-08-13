#!/usr/bin/env node
/**
 * Apply schema.sql to the remote D1 named in wrangler.toml (or --config).
 * Usage: node scripts/db-init-remote.mjs
 *        node scripts/db-init-remote.mjs --config wrangler.sandbox.toml
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const configIdx = process.argv.indexOf('--config');
const config = configIdx >= 0 ? process.argv[configIdx + 1] : 'wrangler.toml';
const content = readFileSync(config, 'utf8');
const match = content.match(/database_name\s*=\s*"([^"]+)"/);
if (!match) {
  console.error(`No database_name found in ${config}`);
  process.exit(1);
}
const dbName = match[1];
const cfgArg = config === 'wrangler.toml' ? '' : ` --config ${config}`;
const cmd = `npx wrangler d1 execute ${dbName} --remote${cfgArg} --file=schema.sql`;
console.log(`→ ${cmd}`);
execSync(cmd, { stdio: 'inherit' });
