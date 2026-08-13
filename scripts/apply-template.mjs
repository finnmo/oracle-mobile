#!/usr/bin/env node
/** Cross-platform blank template apply (Windows / macOS / Linux). */
import { copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

copyFileSync('template/index.html', 'index.html');
copyFileSync('template/manifest.json', 'public/manifest.json');
copyFileSync('template/icon.svg', 'public/icon.svg');
execSync('npm run icons', { stdio: 'inherit' });
console.log('✓ Blank template assets applied');
