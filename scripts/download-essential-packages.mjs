import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGES_DIR = path.resolve(__dirname, '../public/packages');
export const HASHES_PATH = path.resolve(__dirname, 'essential-package-hashes.json');

export const PACKAGE_HASHES = fs.existsSync(HASHES_PATH)
  ? JSON.parse(fs.readFileSync(HASHES_PATH, 'utf8'))
  : {};

export const ESSENTIAL_PACKAGES = [
  'booktabs.sty',
  'setspace.sty',
  'enumitem.sty',
  'titlesec.sty',
  'float.sty',
  'caption.sty',
  'caption3.sty',
  'ragged2e.sty',
  'microtype.sty',
  'microtype-pdftex.def',
  'everysel.sty',
  'fancyhdr.sty',
  'tabularx.sty',
  'longtable.sty',
  'array.sty',
  'bm.sty',
  'hypcap.sty',
  'tfrupee.sty',
  'xcolor.sty',
  'colortbl.sty',
  'multicol.sty',
  'multirow.sty',
  'subcaption.sty',
  'listings.sty',
  'algorithm.sty',
  'algorithmic.sty',
  'algpseudocode.sty',
  'wrapfig.sty',
  'lipsum.sty',
  'lipsum.ltd',
  'totpages.sty',
  'environ.sty',
  'ACM-Reference-Format.bst',
  'program.sty',
  'breakurl.sty',
];

export const UPSTREAM_BASE = 'https://texlive2026.texlyre.org/26';
export const SPECIAL_SOURCES = {
  'sn-jnl.cls': 'https://raw.githubusercontent.com/godkingjay/springer-nature-latex-template/master/sn-jnl.cls',
  'sn-basic.bst': 'https://raw.githubusercontent.com/godkingjay/springer-nature-latex-template/master/sn-basic.bst',
};

export const MAX_PACKAGE_SIZE = 8 * 1024 * 1024; // 8 MiB
export const MIN_PACKAGE_SIZE = 30; // 30 bytes

const TEX_STYLE_MARKERS = [
  '\\ProvidesPackage',
  '\\ProvidesClass',
  '\\ProvidesFile',
  '\\NeedsTeXFormat',
  '\\def',
  '\\let',
  '\\newcommand',
  '\\DeclareOption',
  '\\catcode',
  '\\makeatletter',
  '\\RequirePackage',
  '\\newcount',
  '\\newdimen',
  '\\newskip',
  '\\newbox',
  '\\newif',
  '\\ProcessOptions',
  '\\AtBeginDocument',
  '\\begingroup',
  '\\endgroup',
  '%',
];

const BST_MARKERS = [
  'ENTRY',
  'FUNCTION',
  'READ',
  'EXECUTE',
  'ITERATE',
  'SORT',
  'STRINGS',
  'INTEGERS',
  'MACRO',
];

/**
 * Reads a Fetch Response with strict streaming limits.
 * Avoids response.arrayBuffer() on untrusted bodies by:
 * 1. Rejecting advertised Content-Length > maxBytes immediately.
 * 2. Streaming chunks via reader and cancelling immediately if accumulated bytes > maxBytes.
 */
export async function readResponseLimited(response, maxBytes = MAX_PACKAGE_SIZE) {
  const advertised = response.headers?.get?.('content-length');
  if (advertised !== null && advertised !== undefined) {
    const len = parseInt(advertised, 10);
    if (!Number.isNaN(len) && len > maxBytes) {
      throw new Error(`Response Content-Length ${len} exceeds limit of ${maxBytes} bytes`);
    }
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    if (typeof response.arrayBuffer === 'function') {
      const buf = await response.arrayBuffer();
      if (buf.byteLength > maxBytes) {
        throw new Error(`Response body exceeded limit of ${maxBytes} bytes`);
      }
      return Buffer.from(buf);
    }
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          throw new Error(`Response body exceeded limit of ${maxBytes} bytes while streaming`);
        }
        chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  return Buffer.concat(chunks);
}

/**
 * Validates package payload against size bounds, HTML/error strings, NUL bytes,
 * and structural TeX/BibTeX markers.
 */
export function validatePackagePayload(name, buffer) {
  if (!buffer || buffer.length < MIN_PACKAGE_SIZE) {
    return {
      valid: false,
      reason: `Undersized payload (${buffer ? buffer.length : 0} bytes < ${MIN_PACKAGE_SIZE} bytes)`,
    };
  }

  if (buffer.length > MAX_PACKAGE_SIZE) {
    return {
      valid: false,
      reason: `Oversized payload (${buffer.length} bytes > ${MAX_PACKAGE_SIZE} bytes limit)`,
    };
  }

  // Reject embedded NUL bytes in text packages
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0) {
      return {
        valid: false,
        reason: 'Embedded NUL byte detected in text package',
      };
    }
  }

  const text = buffer.toString('utf8');
  const leadingSnippet = text.slice(0, 2048);

  // Check for HTML error response (even if served as binary/octet-stream)
  if (/<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<title[\s>]/i.test(leadingSnippet)) {
    return {
      valid: false,
      reason: 'HTML error response detected',
    };
  }

  // Check for explicit upstream error responses
  if (/Cannot GET|404 Not Found|502 Bad Gateway|Internal Server Error|Access Denied|NoSuchKey/i.test(leadingSnippet)) {
    return {
      valid: false,
      reason: 'Explicit upstream error text detected',
    };
  }

  const lowerName = name.toLowerCase();

  // Validate BibTeX styles (.bst)
  if (lowerName.endsWith('.bst')) {
    const hasBstMarker = BST_MARKERS.some(marker => text.includes(marker));
    if (!hasBstMarker) {
      return {
        valid: false,
        reason: 'Missing expected BibTeX style markers (ENTRY, FUNCTION, READ, etc.)',
      };
    }
    return { valid: true, reason: 'Valid BibTeX style' };
  }

  // Validate TeX styles/classes (.sty, .cls, .def)
  if (lowerName.endsWith('.sty') || lowerName.endsWith('.cls') || lowerName.endsWith('.def')) {
    const hasTexMarker = TEX_STYLE_MARKERS.some(marker => text.includes(marker));
    if (!hasTexMarker) {
      return {
        valid: false,
        reason: 'Missing expected TeX source markers (\\ProvidesPackage, \\def, %, etc.)',
      };
    }
    return { valid: true, reason: 'Valid TeX style/class' };
  }

  // LaTeX data / auxiliary (.ltd)
  if (lowerName.endsWith('.ltd')) {
    if (!text.includes('%') && !text.includes('\\')) {
      return {
        valid: false,
        reason: 'Missing expected LaTeX data markers (% or \\)',
      };
    }
    return { valid: true, reason: 'Valid LaTeX data file' };
  }

  return { valid: true, reason: 'OK' };
}

export function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validates structural package markers and compares byte count and SHA-256 digest
 * against the cryptographic integrity manifest.
 */
export function validatePackageAgainstManifest(name, buffer, manifest = PACKAGE_HASHES) {
  const structural = validatePackagePayload(name, buffer);
  if (!structural.valid) return structural;

  const expected = manifest[name];
  if (!expected) {
    return {
      valid: false,
      reason: `Package "${name}" is not registered in integrity manifest`,
    };
  }

  if (buffer.length !== expected.bytes) {
    return {
      valid: false,
      reason: `Byte count mismatch for "${name}": expected ${expected.bytes}, got ${buffer.length}`,
    };
  }

  const digest = computeSha256(buffer);
  if (digest !== expected.sha256) {
    return {
      valid: false,
      reason: `SHA-256 digest mismatch for "${name}": expected ${expected.sha256}, got ${digest}`,
    };
  }

  return { valid: true, reason: 'Passed structural and integrity manifest verification' };
}

async function fetchWithRetry(name, url, maxRetries = 2, timeoutMs = 15000, manifest = PACKAGE_HASHES) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      // Read through chunk-limited streaming reader (enforcing 8 MiB bounds)
      const buf = await readResponseLimited(res, MAX_PACKAGE_SIZE);

      const validation = validatePackageAgainstManifest(name, buf, manifest);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.reason}`);
      }

      return buf;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const backoffMs = (attempt + 1) * 300;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error('Fetch failed');
}

export async function provisionPackages({
  packagesDir = PACKAGES_DIR,
  concurrency = 4,
  allowIncomplete = process.env.TEEEX_ALLOW_INCOMPLETE_PACKAGES === '1',
  manifest = PACKAGE_HASHES,
} = {}) {
  // Validate concurrency configuration (must be integer between 1 and 16)
  if (
    typeof concurrency !== 'number' ||
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 16
  ) {
    throw new Error(`Invalid concurrency "${concurrency}". Must be an integer between 1 and 16.`);
  }

  if (!fs.existsSync(packagesDir)) {
    fs.mkdirSync(packagesDir, { recursive: true });
  }

  const allTargets = [
    ...ESSENTIAL_PACKAGES.map((pkg) => ({ name: pkg, url: `${UPSTREAM_BASE}/${pkg}` })),
    ...Object.entries(SPECIAL_SOURCES).map(([pkg, url]) => ({ name: pkg, url })),
  ];

  console.log(`Provisioning ${allTargets.length} essential LaTeX packages (concurrency: ${concurrency})...`);

  const failedPackages = [];
  let completedCount = 0;
  let index = 0;

  async function worker() {
    while (index < allTargets.length) {
      const target = allTargets[index++];
      if (!target) break;

      const { name: pkg, url } = target;
      const dest = path.join(packagesDir, pkg);

      // 1. Check existing cached package against manifest
      if (fs.existsSync(dest)) {
        try {
          const existingBuf = fs.readFileSync(dest);
          const validation = validatePackageAgainstManifest(pkg, existingBuf, manifest);
          if (validation.valid) {
            const hash = computeSha256(existingBuf);
            console.log(`[skip] ${pkg} already exists and matches integrity pin (${existingBuf.length} bytes, sha256: ${hash.slice(0, 16)}...)`);
            completedCount++;
            continue;
          } else {
            console.warn(`[invalid] Existing ${pkg} failed integrity verification (${validation.reason}), re-fetching...`);
          }
        } catch (err) {
          console.warn(`[warn] Failed reading existing ${pkg}:`, err.message);
        }
      }

      // 2. Fetch with bounded retries, streaming limits & atomic rename
      const tempPath = path.join(packagesDir, `.${pkg}.tmp.${Date.now()}.${crypto.randomUUID().slice(0, 8)}`);
      try {
        const buf = await fetchWithRetry(pkg, url, 2, 15000, manifest);
        fs.writeFileSync(tempPath, buf);
        fs.renameSync(tempPath, dest);

        const hash = computeSha256(buf);
        console.log(`[ok] ${pkg} verified and saved (${buf.length} bytes, sha256: ${hash})`);
        completedCount++;
      } catch (err) {
        if (fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch {}
        }
        console.error(`[fail] ${pkg} failed:`, err.message);
        failedPackages.push({ name: pkg, error: err.message });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  if (failedPackages.length > 0) {
    if (allowIncomplete) {
      console.warn(`\n[warn] Incomplete package provisioning allowed by TEEEX_ALLOW_INCOMPLETE_PACKAGES=1.`);
      console.warn(`Failed packages (${failedPackages.length}/${allTargets.length}): ${failedPackages.map(f => f.name).join(', ')}\n`);
      return { success: true, incomplete: true, failedPackages };
    } else {
      console.error(`\n[error] Failed to provision ${failedPackages.length}/${allTargets.length} required packages:`);
      for (const f of failedPackages) {
        console.error(`  - ${f.name}: ${f.error}`);
      }
      console.error(`Set TEEEX_ALLOW_INCOMPLETE_PACKAGES=1 to allow local/offline dev with missing packages.\n`);
      throw new Error(`Essential package provisioning failed for ${failedPackages.length} packages`);
    }
  }

  console.log(`Essential packages sync completed successfully (${completedCount}/${allTargets.length} packages ready)!`);
  return { success: true, count: completedCount };
}

// Auto-run when executed directly via CLI
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  provisionPackages().catch((err) => {
    console.error('[fatal] Provisioning aborted:', err.message);
    process.exit(1);
  });
}
