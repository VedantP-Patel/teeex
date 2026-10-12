#!/usr/bin/env node
/**
 * Teeex — Upload TeX engine assets to Cloudflare R2 bucket.
 *
 * Usage:
 *   node scripts/upload-r2.mjs
 *   node scripts/upload-r2.mjs --bucket my-custom-bucket
 *
 * Prerequisites:
 *   1. Logged into Cloudflare: npx wrangler login
 *   2. Bucket created: npx wrangler r2 bucket create teeex-engine
 */

import { execSync } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'public', 'core', 'busytex');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const BUCKET = process.env.TEEEX_ENGINE_BUCKET || option('bucket', 'teeex-engine');

function mib(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

async function main() {
  console.log('\n  Teeex Cloudflare R2 Asset Uploader');
  console.log(`  bucket  ${BUCKET}`);
  console.log(`  source  public/core/busytex\n`);

  let files;
  try {
    files = (await readdir(SOURCE_DIR)).filter(
      (f) => !f.startsWith('.') && !f.endsWith('.partial')
    );
  } catch (err) {
    console.error(`Cannot read ${SOURCE_DIR}: ${err.message}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('No assets found in public/core/busytex/. Run "npm run engine" first.');
    process.exit(1);
  }

  console.log(`Found ${files.length} assets to upload:\n`);

  for (const [index, file] of files.entries()) {
    const filePath = join(SOURCE_DIR, file);
    const fileStat = await stat(filePath);
    const pos = `[${index + 1}/${files.length}]`;

    process.stdout.write(`  ${pos} Uploading ${file.padEnd(28)} (${mib(fileStat.size)})... `);

    try {
      execSync(
        `npx wrangler r2 object put "${BUCKET}/${file}" --file "${filePath}" --remote`,
        { stdio: 'pipe', encoding: 'utf8' }
      );
      console.log('DONE');
    } catch (err) {
      console.log('FAILED');
      console.error(`\nError uploading ${file}:`);
      console.error(err.stderr || err.message);
      console.error('\nMake sure you are logged into Cloudflare (npx wrangler login) and the bucket exists.');
      process.exit(1);
    }
  }

  console.log('\n  All assets successfully uploaded to Cloudflare R2!\n');
  console.log('  Next step in Cloudflare Dashboard:');
  console.log('  1. Navigate to: Workers & Pages -> your Pages project -> Settings -> Functions');
  console.log('  2. Under "R2 bucket bindings", click "Add binding":');
  console.log(`     - Variable name: TEEEX_ENGINE_BUCKET`);
  console.log(`     - R2 bucket:     ${BUCKET}`);
  console.log('  3. Re-deploy or trigger a new deployment.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
