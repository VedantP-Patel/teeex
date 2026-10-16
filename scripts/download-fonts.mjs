#!/usr/bin/env node
/**
 * Teeex — Self-hosted WOFF2 Variable Fonts Downloader.
 *
 * Downloads modern WOFF2 variable font subsets for Plus Jakarta Sans, JetBrains Mono,
 * and Newsreader into `public/fonts/`, completely eliminating third-party render-blocking
 * network requests to Google Fonts, visitor IP leakage, and CSP external font holes.
 *
 * Total footprint: ~196.8 KB (5 variable font files covering all weights 300..800).
 */

import { existsSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS_DIR = join(ROOT, 'public', 'fonts');

const FONTS = [
  {
    name: 'PlusJakartaSans-Variable.woff2',
    url: 'https://fonts.gstatic.com/s/plusjakartasans/v12/LDIoaomQNQcsA88c7O9yZ4KMCoOg4Ko20yw.woff2',
    expectedMinBytes: 20_000,
  },
  {
    name: 'JetBrainsMono-Variable.woff2',
    url: 'https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwg.woff2',
    expectedMinBytes: 25_000,
  },
  {
    name: 'JetBrainsMono-Italic-Variable.woff2',
    url: 'https://fonts.gstatic.com/s/jetbrainsmono/v24/tDba2o-flEEny0FZhsfKu5WU4xD-IQ-PuZJJXxfpAO-LfmOXmaI.woff2',
    expectedMinBytes: 18_000,
  },
  {
    name: 'Newsreader-Variable.woff2',
    url: 'https://fonts.gstatic.com/s/newsreader/v26/cY9VfjOCX1hbuyalUrK49dLafXjalZCsZBsgBgbNJYQ.woff2',
    expectedMinBytes: 45_000,
  },
  {
    name: 'Newsreader-Italic-Variable.woff2',
    url: 'https://fonts.gstatic.com/s/newsreader/v26/cY9XfjOCX1hbuyalUrK439vogqCz_goCYw7oRd6JFYYzbA.woff2',
    expectedMinBytes: 50_000,
  },
];

const force = process.argv.includes('--force');

async function main() {
  await mkdir(FONTS_DIR, { recursive: true });
  console.log('\n  Teeex Self-Hosted Fonts Provisioning');
  console.log(`  dest: public/fonts/ (${FONTS.length} variable WOFF2 files)\n`);

  let totalBytes = 0;

  for (const [idx, font] of FONTS.entries()) {
    const target = join(FONTS_DIR, font.name);
    const pos = `[${idx + 1}/${FONTS.length}]`;

    if (!force && existsSync(target)) {
      const s = await stat(target);
      if (s.size >= font.expectedMinBytes) {
        totalBytes += s.size;
        console.log(`  ${pos} ${font.name.padEnd(36)} ${(s.size / 1024).toFixed(1).padStart(6)} KB (cached)`);
        continue;
      }
    }

    process.stdout.write(`  ${pos} Downloading ${font.name.padEnd(30)} ... `);
    const res = await fetch(font.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to download ${font.name}: HTTP ${res.status} ${res.statusText}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < font.expectedMinBytes) {
      throw new Error(`Downloaded font ${font.name} is too small (${buf.length} bytes, expected >= ${font.expectedMinBytes})`);
    }

    // Verify WOFF2 magic bytes: 'wOF2' = 0x77, 0x4F, 0x46, 0x32
    if (buf[0] !== 0x77 || buf[1] !== 0x4f || buf[2] !== 0x46 || buf[3] !== 0x32) {
      throw new Error(`Downloaded font ${font.name} has invalid WOFF2 magic header`);
    }

    await writeFile(target, buf);
    totalBytes += buf.length;
    console.log(`${(buf.length / 1024).toFixed(1).padStart(6)} KB (OK)`);
  }

  console.log(`\n  Successfully verified ${FONTS.length} self-hosted fonts (${(totalBytes / 1024).toFixed(1)} KB total).\n`);
}

main().catch((err) => {
  console.error('\n  FATAL: Font provisioning failed.');
  console.error(err);
  process.exit(1);
});
