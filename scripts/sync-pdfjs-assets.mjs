#!/usr/bin/env node
/**
 * Teeex — PDF.js runtime asset sync.
 *
 * pdf.js resolves CMaps (CID-keyed font encodings, required for CJK and many
 * subset-embedded fonts) and the 14 standard PDF fonts at runtime from URLs.
 * They are directory trees, so they cannot be pulled in as bundler imports.
 *
 * Serving them from a CDN at a pinned version — as this project previously did
 * — guarantees drift: the installed pdf.js and the fetched data diverge the
 * moment either moves, and the failure shows up as missing glyphs rather than
 * an error. Copying them out of the installed package keeps them exactly in
 * step with the library doing the rendering.
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(ROOT, 'public', 'pdfjs');
const STAMP = join(DEST, '.version');

const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`\n  ERROR  ${message}\n`);
  process.exit(1);
}

async function main() {
  let pkgPath;
  try {
    pkgPath = require.resolve('pdfjs-dist/package.json');
  } catch {
    fail('pdfjs-dist is not installed. Run "npm install" first.');
  }

  const pkgRoot = dirname(pkgPath);
  const { version } = JSON.parse(await readFile(pkgPath, 'utf8'));

  let stamped = null;
  try {
    stamped = (await readFile(STAMP, 'utf8')).trim();
  } catch {
    // Not yet synced.
  }

  if (stamped === version && !process.argv.includes('--force')) {
    console.log(`  PDF.js assets already synced for ${version}.`);
    return;
  }

  // Replace wholesale: a stale CMap left behind from an older version is
  // indistinguishable at runtime from a correct one.
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });

  for (const name of ['cmaps', 'standard_fonts']) {
    const source = join(pkgRoot, name);
    try {
      await cp(source, join(DEST, name), { recursive: true });
    } catch (error) {
      fail(
        `Could not copy "${name}" from pdfjs-dist ${version}: ${error.message}\n` +
          `         Expected it at ${source}`,
      );
    }
    console.log(`  Copied ${name}`);
  }

  await writeFile(STAMP, `${version}\n`);
  console.log(`  PDF.js assets synced for ${version}.\n`);
}

main().catch((error) => fail(error?.stack || String(error)));
