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
const configuredBaseUrl = process.env.TEEEX_ENGINE_BASE_URL || DEFAULT_BASE_URL;
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

/** Check if a local file exists and is non-empty */
async function getLocalFileInfo(filePath) {
  try {
    const s = await stat(filePath);
    return s.isFile() && s.size > 0 ? s : null;
  } catch {
    return null;
  }
}

/** True when every file in the profile is present at its recorded size. */
async function isProvisioned(manifest) {
  if (!manifest) return false;
  if (manifest.engineVersion !== ENGINE_VERSION) return false;

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
 * Downloads or copies an asset to disk via a temp file so an interrupted run never leaves
 * a truncated .wasm or .data behind — those fail at WebAssembly instantiation
 * with messages that point nowhere near the real cause.
 */
async function download(name) {
  const localSource = join(LOCAL_RELEASE, name);
  const target = join(DEST, name);
  const temp = `${target}.partial`;

  const localInfo = await getLocalFileInfo(localSource);

  try {
    if (localInfo) {
      await pipeline(
        createReadStream(localSource),
        createWriteStream(temp)
      );

      const copied = await stat(temp);
      if (copied.size !== localInfo.size) {
        await rm(temp, { force: true });
        throw new Error(
          `Size mismatch copying ${name}: source=${localInfo.size}, copied=${copied.size}`
        );
      }
      await rename(temp, target);
      return { bytes: copied.size, sha256: null, source: 'local' };
    }

    // Remote download fallback
    const url = `${configuredBaseUrl.replace(/\/+$/, '')}/${name}`;
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
    }

    const contentEncoding = res.headers.get('content-encoding');
    const rawContentLength = res.headers.get('content-length');
    // Node fetch automatically decompresses gzip/br/deflate, so Content-Length
    // reflects the compressed wire bytes while downloaded.size is uncompressed bytes.
    const expectedLength = !contentEncoding && rawContentLength
      ? parseInt(rawContentLength, 10)
      : null;

    await pipeline(
      Readable.fromWeb(res.body),
      createWriteStream(temp)
    );

    const downloaded = await stat(temp);
    if (expectedLength && downloaded.size !== expectedLength) {
      await rm(temp, { force: true });
      throw new Error(
        `Size mismatch downloading ${name}: expected=${expectedLength}, downloaded=${downloaded.size}`
      );
    }
    if (downloaded.size === 0) {
      await rm(temp, { force: true });
      throw new Error(`Downloaded zero-byte asset: ${name}`);
    }

    await rename(temp, target);
    return { bytes: downloaded.size, sha256: null, source: 'remote' };
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

async function main() {
  const hasLocalRelease = (await getLocalFileInfo(join(LOCAL_RELEASE, 'busytex_worker.js'))) !== null;
  const baseUrl = hasLocalRelease ? 'local-release:texlyre-busytex@1.4.0' : configuredBaseUrl;

  console.log('\n  Teeex TeX engine assets');
  console.log(`  profile  ${profileName} (${files.length} files)`);
  console.log(`  source   ${hasLocalRelease ? 'local official release assets' : configuredBaseUrl}`);
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

      const localSourceInfo = await getLocalFileInfo(join(LOCAL_RELEASE, name));

      // Re-download/copy if forced, missing, empty, or differs from local source (when local exists)
      const needsFetch =
        force ||
        !info ||
        !info.isFile() ||
        info.size === 0 ||
        (localSourceInfo && info.size !== localSourceInfo.size);

      if (needsFetch) {
        await download(name);
        info = await stat(join(DEST, name));
      }

      if (!info || !info.isFile() || info.size === 0) {
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
    `\n  Validated ${files.length} engine assets, ${mib(totalBytes)} total.`
  );
}

main().catch((error) => {
  console.error('\n  FATAL: Engine provisioning failed.');
  console.error(error?.stack || error);
  process.exitCode = 1;
});
