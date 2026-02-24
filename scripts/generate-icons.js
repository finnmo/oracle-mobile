#!/usr/bin/env node
// Generates PNG icons from public/icon.svg.
// Run once after changing the SVG: npm run icons

import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');
const svg       = readFileSync(join(root, 'public', 'icon.svg'));

const sizes = [192, 512];

for (const size of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(root, 'public', `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}

// Apple touch icon (180×180)
await sharp(svg)
  .resize(180, 180)
  .png()
  .toFile(join(root, 'public', 'apple-touch-icon.png'));
console.log('✓ apple-touch-icon.png');
