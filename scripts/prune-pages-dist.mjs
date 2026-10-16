#!/usr/bin/env node
/**
 * Teeex — Cloudflare Pages Static Output Pruner.
 *
 * Cloudflare Pages enforces a hard 25 MiB cap per static file in `dist/`.
 * Assets exceeding 25 MiB (`busytex.wasm`, `texlive-basic.data`, `biber.data`)
 * are streamed via `functions/core/busytex/[[path]].ts` from R2 or edge cache.
 *
 * This script prunes files > 25 MiB from `dist/core/busytex/` post-build so
 * Cloudflare Pages deployment never fails with "Asset exceeds maximum allowed size".
 * It leaves `public/core/busytex/` untouched so local development stays 100% offline.
 */

import { existsSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_BUSYTEX = join(ROOT, 'dist', 'core', 'busytex');
const MAX_BYTES = 25 * 1024 * 1024; // 25 MiB (26,214,400 bytes)

async function main() {
  if (!existsSync(DIST_BUSYTEX)) {
    console.log('  No dist/core/busytex directory found; skipping Pages pruning.');
    return;
  }

  const entries = await readdir(DIST_BUSYTEX);
  let prunedCount = 0;

  for (const entry of entries) {
    const fullPath = join(DIST_BUSYTEX, entry);
    const s = await stat(fullPath);
    if (s.isFile() && s.size > MAX_BYTES) {
      await rm(fullPath, { force: true });
      console.log(`  [prune] Removed >25MB asset from dist: ${entry} (${(s.size / 1024 / 1024).toFixed(1)} MiB)`);
      prunedCount++;
    }
  }

  console.log(`  Cloudflare Pages static budget check: pruned ${prunedCount} heavy files from dist.\n`);
}

main().catch((err) => {
  console.error('Failed to prune Pages dist:', err);
  process.exit(1);
});
