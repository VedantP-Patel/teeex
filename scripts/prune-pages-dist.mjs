#!/usr/bin/env node
/**
 * Teeex — Cloudflare Pages Static Output Pruner & 25 MiB CI Budget Guard.
 */

import { existsSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = join(ROOT, 'dist');
const DIST_BUSYTEX = join(DIST_DIR, 'core', 'busytex');
const MAX_BYTES = 25 * 1024 * 1024; // 25 MiB (26,214,400 bytes)

async function findOversizedFiles(dir, oversized = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await findOversizedFiles(fullPath, oversized);
    } else if (entry.isFile()) {
      const s = await stat(fullPath);
      if (s.size > MAX_BYTES) {
        oversized.push({ path: relative(DIST_DIR, fullPath), size: s.size });
      }
    }
  }
  return oversized;
}

async function main() {
  if (!existsSync(DIST_DIR)) {
    console.log('  No dist/ directory found; skipping Pages pruning.');
    return;
  }

  let prunedCount = 0;
  if (existsSync(DIST_BUSYTEX)) {
    const entries = await readdir(DIST_BUSYTEX);
    for (const entry of entries) {
      const fullPath = join(DIST_BUSYTEX, entry);
      const s = await stat(fullPath);
      if (s.isFile() && s.size > MAX_BYTES) {
        await rm(fullPath, { force: true });
        console.log(
          `  [prune] Removed >25MiB asset from dist: ${entry} (${(s.size / 1024 / 1024).toFixed(1)} MiB)`
        );
        prunedCount++;
      }
    }
  }

  // Full-dist budget audit: fail CI if any remaining static file exceeds 25 MiB
  const violations = await findOversizedFiles(DIST_DIR);
  if (violations.length > 0) {
    console.error('\n  [ERROR] Cloudflare Pages 25 MiB asset limit exceeded in dist/:');
    for (const v of violations) {
      console.error(`    - ${v.path} (${(v.size / 1024 / 1024).toFixed(2)} MiB)`);
    }
    process.exit(1);
  }

  console.log(
    `  Cloudflare Pages static budget check passed: pruned ${prunedCount} heavy files; 0 assets > 25 MiB.\n`
  );
}

main().catch((err) => {
  console.error('Failed to prune Pages dist:', err);
  process.exit(1);
});