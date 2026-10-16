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
 * loads (~159.5 MB for pdftex), straight into `public/core/busytex/`, so the
 * worker is served same-origin and version-pinned rather than proxied from a
 * third party at runtime.
 *
 * Cryptographic SHA-256 hashes are calculated on fetch/copy, validated against
 * the pinned upstream golden digests, and stored in `.teeex-manifest.json`.
 *
 * Usage:
 *   node scripts/fetch-engine.mjs                  # pdftex profile (default)
 *   node scripts/fetch-engine.mjs --profile pages  # assets <= 25MB for static Pages
 *   node scripts/fetch-engine.mjs --force          # re-download, ignore manifest
 *   node scripts/fetch-engine.mjs --verify         # check sizes & sha256 digests
 *
 * Env:
 *   TEEEX_ENGINE_BASE_URL   override the asset source origin
 */

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(ROOT, 'public', 'core', 'busytex');
const MANIFEST = join(DEST, '.teeex-manifest.json');
const PATCHES_DIR = join(ROOT, 'scripts', 'engine-patches');

/**
 * Pinned to the texlyre-busytex version in package.json.
 */
const ENGINE_VERSION = '1.4.0';
const DEFAULT_BASE_URL = 'https://texlyre.github.io/texlyre-busytex/core/busytex';

/**
 * Golden SHA-256 digests for official upstream texlyre-busytex@1.4.0 release files.
 */
const GOLDEN_UPSTREAM_DIGESTS = {
  'biber.data': '9ea1357e6180477479b5edfe17538ba655ebebc03142a195d85fb1d47899df21',
  'biber.js': 'f097b241ec1dfaff8c43b7c3e242a85c535d4a24b6252288da869d1a8b465c08',
  'biber.wasm': '6c2ddccf3b95e06b419d4aee5f88ef10ddec658ce760fabb34d7145371ff18c5',
  'busytex_biber.js': 'e1a3ff55a120e392d3a7ef27f1bff1978c7a9d5978999296e39e1cfeac01d923',
  'busytex.wasm': '8d1988fc58cd1611c3cbd6bd986c3e607e5ff44f1d94252207ff7aae4cee72e0',
  'texlive-basic.data': 'ccb35d98d77cbaf988e1481f8538709f72166196785cf6b8785eabe6c8fb2993',
  'texlive-basic.js': 'd4abc2e93a1ae33099107c6ad8a61813978cd44036a95697db2f2365a393c283',
  // Unpatched release upstream hashes for files that receive local patches:
  'busytex.js': 'c505d883028d95bcffa692f994aa9e2c97b89022c63d8519a43c58bd715a7470',
  'busytex_pipeline.js': '509475fdf6996e45bea5deaa2f5ca9dd1ce25d44b2208ab03b95a63123b2c6f6',
  'busytex_worker.js': '04c77465d87885628663420838b288a6f870915995988ec7c4c320014e41b74d',
};

/**
 * Derived from BusyTexRunner.initializeWorker() / getEngineAssetNames() /
 * getBiberAssetPaths() in texlyre-busytex.
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
    'biber.js',
    'biber.wasm',
    'biber.data',
  ],
  pages: [
    'busytex_worker.js',
    'busytex_pipeline.js',
    'busytex_biber.js',
    'busytex.js',
    'texlive-basic.js',
    'biber.js',
    'biber.wasm',
  ],
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const isCloudflare = Boolean(
  process.env.CF_PAGES === '1' ||
  process.env.CF_PAGES ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.CF_PAGES_BRANCH ||
  process.env.CLOUDFLARE_PAGES
);
const defaultProfile = isCloudflare ? 'pages' : 'pdftex';
const profileName = option('profile', defaultProfile);
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

async function computeSha256(filePath) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {
    return null;
  }
}

const CONCURRENCY = 4;

class Semaphore {
  #queue = [];
  #running = 0;
  #concurrency;

  constructor(concurrency) {
    this.#concurrency = concurrency;
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ fn, resolve, reject });
      this.#drain();
    });
  }

  #drain() {
    while (this.#running < this.#concurrency && this.#queue.length > 0) {
      const { fn, resolve, reject } = this.#queue.shift();
      this.#running++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          this.#running--;
          this.#drain();
        });
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getLocalFileInfo(filePath) {
  try {
    const s = await stat(filePath);
    return s.isFile() && s.size > 0 ? s : null;
  } catch {
    return null;
  }
}

/** True when every file in the profile matches both byte size and sha256. */
async function isProvisioned(manifest) {
  if (!manifest) return false;
  if (manifest.engineVersion !== ENGINE_VERSION) return false;

  for (const name of files) {
    const recorded = manifest.files?.[name];
    if (!recorded || !recorded.sha256) return false;
    try {
      const filePath = join(DEST, name);
      const stats = await stat(filePath);
      if (stats.size !== recorded.bytes) return false;
      const actualDigest = await computeSha256(filePath);
      if (actualDigest !== recorded.sha256) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Downloads or copies an asset to disk via a temp file so an interrupted run never leaves
 * a truncated .wasm or .data behind. Validates against golden upstream digests.
 */
async function download(name, localInfo) {
  const localSource = join(LOCAL_RELEASE, name);
  const target = join(DEST, name);
  const temp = `${target}.partial`;

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

      const digest = await computeSha256(temp);
      const expectedDigest = GOLDEN_UPSTREAM_DIGESTS[name];
      if (expectedDigest && digest !== expectedDigest) {
        await rm(temp, { force: true });
        throw new Error(
          `Checksum mismatch copying ${name}: expected=${expectedDigest}, actual=${digest}`
        );
      }

      await rename(temp, target);
      return { bytes: copied.size, sha256: digest, source: 'local' };
    }

    // Remote download fallback with retry
    const url = `${configuredBaseUrl.replace(/\/+$/, '')}/${name}`;
    let res;
    let lastError;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        res = await fetch(url);
        if (res.ok && res.body) break;
        lastError = new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
      } catch (err) {
        lastError = err;
      }
      if (attempt < maxRetries) {
        await sleep(300 * attempt);
      }
    }

    if (!res || !res.ok || !res.body) {
      throw lastError || new Error(`Failed to fetch ${url}`);
    }

    const contentEncoding = res.headers.get('content-encoding');
    const rawContentLength = res.headers.get('content-length');
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

    const digest = await computeSha256(temp);
    const expectedDigest = GOLDEN_UPSTREAM_DIGESTS[name];
    if (expectedDigest && digest !== expectedDigest) {
      await rm(temp, { force: true });
      throw new Error(
        `Checksum mismatch downloading ${name}: expected=${expectedDigest}, actual=${digest}`
      );
    }

    await rename(temp, target);
    return { bytes: downloaded.size, sha256: digest, source: 'remote' };
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

async function applyEnginePatches() {
  const patchFiles = ['busytex_pipeline.js', 'busytex_worker.js', 'busytex.js'];
  const applied = {};
  for (const patchName of patchFiles) {
    const patchPath = join(PATCHES_DIR, patchName);
    const patchStat = await getLocalFileInfo(patchPath);
    if (patchStat) {
      const destPath = join(DEST, patchName);
      await pipeline(
        createReadStream(patchPath),
        createWriteStream(destPath)
      );
      const digest = await computeSha256(destPath);
      applied[patchName] = { size: patchStat.size, sha256: digest };
    }
  }
  return applied;
}

async function main() {
  const hasLocalRelease = (await getLocalFileInfo(join(LOCAL_RELEASE, 'busytex_worker.js'))) !== null;
  const baseUrl = hasLocalRelease ? 'local-release:texlyre-busytex@1.4.0' : configuredBaseUrl;

  console.log('\n  Teeex TeX engine assets');
  console.log(`  profile  ${profileName} (${files.length} files)`);
  console.log(`  source   ${hasLocalRelease ? 'local official release assets' : configuredBaseUrl}`);
  console.log('  dest     public/core/busytex\n');

  if (verifyOnly) {
    const existing = await readManifest();

    if (!existing || !(await isProvisioned(existing))) {
      fail(
        'The asset manifest is missing, corrupt, or stale.\n' +
        '         Run: node scripts/fetch-engine.mjs'
      );
    }

    console.log(`  Verified ${files.length} local assets with SHA-256 integrity.\n`);
    return;
  }

  await mkdir(DEST, { recursive: true });

  // Clean up any unreferenced 205MB assets that may be lingering on disk
  const bloatFiles = ['texlive-recommended.data', 'texlive-recommended.js', 'busytex.js.pre-diagnostic-restore'];
  for (const b of bloatFiles) {
    await rm(join(DEST, b), { force: true }).catch(() => {});
  }

  // When building with the 'pages' profile, clean up files >25MB
  if (profileName === 'pages') {
    const heavyFiles = [
      'busytex.wasm',
      'texlive-basic.data',
      'biber.data',
    ];
    for (const heavy of heavyFiles) {
      await rm(join(DEST, heavy), { force: true }).catch(() => {});
    }
  }

  const sem = new Semaphore(CONCURRENCY);
  const results = new Array(files.length);

  await Promise.all(
    files.map((name, index) =>
      sem.run(async () => {
        const localSourceInfo = await getLocalFileInfo(join(LOCAL_RELEASE, name));

        let info;
        try {
          info = await stat(join(DEST, name));
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }

        const needsFetch =
          force ||
          !info ||
          !info.isFile() ||
          info.size === 0 ||
          (localSourceInfo && info.size !== localSourceInfo.size);

        let sha256Digest = null;
        if (needsFetch) {
          const downloadResult = await download(name, localSourceInfo);
          info = { isFile: () => true, size: downloadResult.bytes };
          sha256Digest = downloadResult.sha256;
        } else {
          sha256Digest = await computeSha256(join(DEST, name));
        }

        if (!info || !info.isFile() || info.size === 0) {
          fail(`Missing or empty engine asset: ${name}`);
        }

        results[index] = { name, size: info.size, sha256: sha256Digest };
      })
    )
  );

  const patched = await applyEnginePatches();
  for (const [name, patchInfo] of Object.entries(patched)) {
    const resIdx = results.findIndex((r) => r && r.name === name);
    if (resIdx !== -1) {
      results[resIdx].size = patchInfo.size;
      results[resIdx].sha256 = patchInfo.sha256;
    }
  }

  const record = {};
  let totalBytes = 0;

  for (const [index, { name, size, sha256 }] of results.entries()) {
    const position = `${String(index + 1).padStart(2)}/${files.length}`;
    record[name] = {
      bytes: size,
      sha256,
    };
    totalBytes += size;
    console.log(
      `  ${position}  ${name.padEnd(24)} ${mib(size).padStart(9)}   sha256:${sha256.slice(0, 8)}...`
    );
  }

  const manifest = {
    engineVersion: ENGINE_VERSION,
    profile: profileName,
    baseUrl,
    provisionedAt: new Date().toISOString(),
    totalBytes,
    files: record,
  };

  await writeFile(
    MANIFEST,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  console.log(
    `\n  Validated ${files.length} engine assets, ${mib(totalBytes)} total with SHA-256 integrity.`
  );
}

main().catch((error) => {
  console.error('\n  FATAL: Engine provisioning failed.');
  console.error(error?.stack || error);
  process.exitCode = 1;
});
