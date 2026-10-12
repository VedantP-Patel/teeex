#!/usr/bin/env node
/**
 * Teeex — TeX engine asset provisioning.
 *
 * The authoritative layout engine is pdfLaTeX compiled to WebAssembly
 * (texlyre-busytex / TeX Live 2026). Its assets are NOT on npm: the complete
 * release archive is ~522 MB, which is infeasible to commit or to pull through
 * a build step.
 *
 * This script fetches only the subset the configured engine profile actually
 * loads, straight into `public/core/busytex/`, so the worker is served
 * same-origin and version-pinned rather than proxied from a third party at
 * runtime.
 *
 * Everything outside the preloaded `texlive-basic` package resolves on demand
 * at compile time through the TeX Live remote endpoint (see
 * VITE_TEXLIVE_REMOTE_ENDPOINT), so this small subset does not limit which
 * packages a document may use.
 *
 * Usage:
 *   node scripts/fetch-engine.mjs                  # pdftex profile (default)
 *   node scripts/fetch-engine.mjs --profile full   # + xetex/luahbtex + catalogs
 *   node scripts/fetch-engine.mjs --force          # re-download, ignore manifest
 *   node scripts/fetch-engine.mjs --verify         # check only, exit 1 if incomplete
 *
 * Env:
 *   TEEEX_ENGINE_BASE_URL   override the asset source origin
 */

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(ROOT, 'public', 'core', 'busytex');
const MANIFEST = join(DEST, '.teeex-manifest.json');

/**
 * Pinned to the texlyre-busytex version in package.json. The upstream project
 * publishes these same files per release; bumping the dependency means bumping
 * this and re-running with --force.
 */
const ENGINE_VERSION = '1.4.0';
const DEFAULT_BASE_URL = 'https://texlyre.github.io/texlyre-busytex/core/busytex';

/**
 * Derived from BusyTexRunner.initializeWorker() / getEngineAssetNames() /
 * getBiberAssetPaths() in texlyre-busytex. If those change, this list must too —
 * which is exactly why --verify exists.
 */
const PROFILES = {
  pdftex: [
    'busytex_worker.js',
    'busytex_pipeline.js',
    'busytex_biber.js',
    'busytex.js',
    'busytex.wasm',
    'texlive-basic.js',
    'texlive-basic.data',
    'biber.js',
    'biber.wasm',
    'biber.data',
  ],
  full: [
    'busytex_worker.js',
    'busytex_pipeline.js',
    'busytex_biber.js',
    'busytex.js',
    'busytex.wasm',
    'texlive-basic.js',
    'texlive-basic.data',
    'texlive-recommended.js',
    'texlive-recommended.data',
    'biber.js',
    'biber.wasm',
    'biber.data',
  ],
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const profileName = option('profile', 'full');
const baseUrl = 'local-release:texlyre-busytex@1.4.0';
const LOCAL_RELEASE = join(ROOT, 'tmp-busytex-assets', 'busytex');
const force = flag('force');
const verifyOnly = flag('verify');

const files = PROFILES[profileName];
if (!files) {
  fail(
    `Unknown profile "${profileName}". Available: ${Object.keys(PROFILES).join(', ')}.`,
  );
}

function fail(message) {
  console.error(`\n  ERROR  ${message}\n`);
  process.exit(1);
}

function mib(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {
    return null;
  }
}

/** True when every file in the profile is present at its recorded size. */
async function isProvisioned(manifest) {
  if (!manifest) return false;
  if (manifest.engineVersion !== ENGINE_VERSION) return false;
  if (manifest.baseUrl !== baseUrl) return false;

  for (const name of files) {
    const recorded = manifest.files?.[name];
    if (!recorded) return false;
    try {
      const stats = await stat(join(DEST, name));
      if (stats.size !== recorded.bytes) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Streams one asset to disk via a temp file so an interrupted run never leaves
 * a truncated .wasm or .data behind — those fail at WebAssembly instantiation
 * with messages that point nowhere near the real cause.
 */
async function download(name) {
  const source = join(LOCAL_RELEASE, name);
  const target = join(DEST, name);
  const temp = `${target}.partial`;

  try {
    const sourceInfo = await stat(source);
    if (!sourceInfo.isFile() || sourceInfo.size === 0) {
      throw new Error(`Missing or empty local release asset: ${source}`);
    }

    await pipeline(
      createReadStream(source),
      createWriteStream(temp)
    );

    const copied = await stat(temp);
    if (copied.size !== sourceInfo.size) {
      await rm(temp, { force: true });
      throw new Error(
        `Size mismatch copying ${name}: source=${sourceInfo.size}, copied=${copied.size}`
      );
    }

    await rename(temp, target);
    return { bytes: copied.size, sha256: null };
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}
async function main() {
  console.log('\n  Teeex TeX engine assets');
  console.log(`  profile  ${profileName} (${files.length} files)`);
  console.log('  source   local official release assets');
  console.log('  dest     public/core/busytex\n');

  await mkdir(DEST, { recursive: true });

  const record = {};
  let totalBytes = 0;

  for (const [index, name] of files.entries()) {
    const position = `${String(index + 1).padStart(2)}/${files.length}`;

    try {
      let info;
      try {
        info = await stat(join(DEST, name));
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }

      if (force || !info || !info.isFile() || info.size === 0) {
        await download(name);
        info = await stat(join(DEST, name));
      }

      const sourceInfo = await stat(join(LOCAL_RELEASE, name));
      if (info.size !== sourceInfo.size) {
        await download(name);
        info = await stat(join(DEST, name));
      }

      if (!info.isFile() || info.size === 0) {
        fail(`Missing or empty engine asset: ${name}`);
      }

      record[name] = {
        bytes: info.size,
        sha256: null,
      };

      totalBytes += info.size;

      console.log(
        `  ${position}  ${name.padEnd(26)}${mib(info.size).padStart(10)}`
      );
    } catch (error) {
      fail(`Failed to provision ${name}: ${error.message}`);
    }
  }

  const manifest = {
    engineVersion: ENGINE_VERSION,
    profile: profileName,
    baseUrl,
    provisionedAt: new Date().toISOString(),
    totalBytes,
    files: record,
  };

  if (verifyOnly) {
    const existing = await readManifest();

    if (!(await isProvisioned(existing))) {
      fail(
        'The asset manifest is missing or stale.\n' +
        '         Run: node scripts/fetch-engine.mjs'
      );
    }

    console.log(`\n  Verified ${files.length} local assets.\n`);
    return;
  }

  await writeFile(
    MANIFEST,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  console.log(
    `\n  Validated ${files.length} local assets, ${mib(totalBytes)} total.`
  );
  console.log('  No remote downloads required.\n');
}
main().catch((error) => {
  console.error('\n  FATAL: Engine provisioning failed.');
  console.error(error?.stack || error);
  process.exitCode = 1;
});
