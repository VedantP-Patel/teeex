import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGES_DIR = path.resolve(__dirname, '../public/packages');

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

async function fetchWithRetry(name, url, maxRetries = 2, timeoutMs = 15000) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);

      const validation = validatePackagePayload(name, buf);
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
} = {}) {
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

      // 1. Check existing cached package
      if (fs.existsSync(dest)) {
        try {
          const existingBuf = fs.readFileSync(dest);
          const validation = validatePackagePayload(pkg, existingBuf);
          if (validation.valid) {
            const hash = computeSha256(existingBuf);
            console.log(`[skip] ${pkg} already exists (${existingBuf.length} bytes, sha256: ${hash.slice(0, 16)}...)`);
            completedCount++;
            continue;
          } else {
            console.warn(`[invalid] Existing ${pkg} failed validation (${validation.reason}), re-fetching...`);
          }
        } catch (err) {
          console.warn(`[warn] Failed reading existing ${pkg}:`, err.message);
        }
      }

      // 2. Fetch with bounded retries & atomic write
      const tempPath = path.join(packagesDir, `.${pkg}.tmp.${Date.now()}.${crypto.randomUUID().slice(0, 8)}`);
      try {
        const buf = await fetchWithRetry(pkg, url, 2, 15000);
        fs.writeFileSync(tempPath, buf);
        fs.renameSync(tempPath, dest);

        const hash = computeSha256(buf);
        console.log(`[ok] ${pkg} downloaded (${buf.length} bytes, sha256: ${hash})`);
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
