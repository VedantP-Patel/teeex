/**
 * Teeex — Pre-bundled academic templates and font metric assets with IndexedDB persistence.
 */

import { TEXLIVE_BASIC_PACKAGES } from './texliveBasicFiles';

export interface BundledPackageDef {
  name: string;
  format: number; // 26 = TeX/LaTeX class/style/source, 51 = TFM font metric
}

export const BUNDLED_PACKAGES: BundledPackageDef[] = [
  { name: 'IEEEtran.cls', format: 26 },
  { name: 'cite.sty', format: 26 },
  { name: 'acmart.cls', format: 26 },
  { name: 'ot1ptm.fd', format: 26 },
  { name: 'omlptm.fd', format: 26 },
  { name: 'omsptm.fd', format: 26 },
  { name: 't1ptm.fd', format: 26 },
  { name: 'ptmr7t.tfm', format: 51 },
  { name: 'ptmb7t.tfm', format: 51 },
  { name: 'ptmri7t.tfm', format: 51 },
  { name: 'ptmro7t.tfm', format: 51 },
  { name: 'ptmrc7t.tfm', format: 51 },
  { name: 'phvr7t.tfm', format: 51 },
  { name: 'pcrr7t.tfm', format: 51 },
  { name: 'msam10.tfm', format: 51 },
  { name: 'msbm10.tfm', format: 51 },
  { name: 'msam7.tfm', format: 51 },
  { name: 'msbm7.tfm', format: 51 },
  { name: 'msam5.tfm', format: 51 },
  { name: 'tfrupee.sty', format: 26 },
  { name: 'tfrupee.tfm', format: 51 },
  { name: 'booktabs.sty', format: 26 },
  { name: 'setspace.sty', format: 26 },
  { name: 'enumitem.sty', format: 26 },
  { name: 'titlesec.sty', format: 26 },
  { name: 'float.sty', format: 26 },
  { name: 'caption.sty', format: 26 },
  { name: 'caption3.sty', format: 26 },
  { name: 'ragged2e.sty', format: 26 },
  { name: 'microtype.sty', format: 26 },
  { name: 'microtype-pdftex.def', format: 26 },
  { name: 'everysel.sty', format: 26 },
  { name: 'fancyhdr.sty', format: 26 },
  { name: 'tabularx.sty', format: 26 },
  { name: 'longtable.sty', format: 26 },
  { name: 'array.sty', format: 26 },
  { name: 'bm.sty', format: 26 },
  { name: 'hypcap.sty', format: 26 },
  { name: 'xcolor.sty', format: 26 },
  { name: 'colortbl.sty', format: 26 },
  { name: 'multicol.sty', format: 26 },
  { name: 'multirow.sty', format: 26 },
  { name: 'subcaption.sty', format: 26 },
  { name: 'listings.sty', format: 26 },
  { name: 'algorithm.sty', format: 26 },
  { name: 'algorithmic.sty', format: 26 },
  { name: 'algpseudocode.sty', format: 26 },
  { name: 'wrapfig.sty', format: 26 },
  { name: 'lipsum.sty', format: 26 },
  { name: 'lipsum.ltd', format: 26 },
  { name: 'totpages.sty', format: 26 },
  { name: 'environ.sty', format: 26 },
  { name: 'ACM-Reference-Format.bst', format: 26 },
  { name: 'program.sty', format: 26 },
  { name: 'breakurl.sty', format: 26 },
  { name: 'sn-jnl.cls', format: 26 },
  { name: 'sn-basic.bst', format: 26 },
];

export const BUNDLED_PACKAGE_NAMES = new Set(BUNDLED_PACKAGES.map((p) => p.name));

export interface LoadedPackage {
  name: string;
  format: number;
  content: Uint8Array;
  contents?: Uint8Array;
}

const DB_NAME = 'teeex_packages_db';
const DB_VERSION = 1;
const STORE_PACKAGES = 'packages';
const STORE_MISSES = 'misses';

export const MAX_PACKAGE_SIZE = 8 * 1024 * 1024; // 8 MiB
export const RESOLVE_CONCURRENCY = 8;

/**
 * Sniffs response headers and binary payload to reject HTML error pages (e.g. 404 SPA fallbacks)
 * from poisoning TeX package storage in IndexedDB and memory cache.
 */
export function isHtmlResponse(buf: Uint8Array, contentType?: string | null): boolean {
  if (contentType && contentType.toLowerCase().includes('text/html')) {
    return true;
  }
  if (buf.length >= 5) {
    const head = String.fromCharCode(...buf.subarray(0, Math.min(buf.length, 64))).toLowerCase();
    if (head.includes('<!doctype') || head.includes('<html') || head.includes('<head')) {
      return true;
    }
  }
  return false;
}

/**
 * Reads a Fetch Response with strict streaming limits.
 * Avoids response.arrayBuffer() on untrusted bodies by:
 * 1. Rejecting advertised Content-Length > maxBytes immediately.
 * 2. Streaming chunks via reader and cancelling immediately if accumulated bytes > maxBytes.
 */
export async function readResponseLimited(
  res: Response,
  maxBytes = MAX_PACKAGE_SIZE,
): Promise<Uint8Array> {
  const advertised = res.headers?.get?.('content-length');
  if (advertised !== null && advertised !== undefined) {
    const len = parseInt(advertised, 10);
    if (!Number.isNaN(len) && len > maxBytes) {
      throw new Error(`Package Content-Length ${len} exceeds limit of ${maxBytes} bytes`);
    }
  }

  if (!res.body || typeof res.body.getReader !== 'function') {
    if (typeof res.arrayBuffer === 'function') {
      const buf = await res.arrayBuffer();
      if (buf.byteLength > maxBytes) {
        throw new Error(`Package response body exceeded limit of ${maxBytes} bytes`);
      }
      return new Uint8Array(buf);
    }
    throw new Error('Response body is null');
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          throw new Error(`Package response body exceeded limit of ${maxBytes} bytes while streaming`);
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * Bounds on dependency resolution. Depth 4 covers the chains real documents
 * produce (class -> package -> driver .def -> font .cfg); the file cap stops a
 * pathological preamble from issuing hundreds of requests before the first
 * pass even starts. A file missed by the prefetch is not an error — kpathsea
 * still resolves it at compile time, just more slowly.
 */
const MAX_DEPENDENCY_DEPTH = 4;
export const MAX_PRELOADED_FILES = 160;

/**
 * Long enough that a cold CDN edge is not mistaken for a missing file.
 */
const PACKAGE_FETCH_TIMEOUT_MS = 10_000;

const packageMemoryCache = new Map<string, Uint8Array>();
const failedFetchCache = new Set<string>();
const inFlightFetches = new Map<string, Promise<LoadedPackage | null>>();
let loadPromise: Promise<LoadedPackage[]> | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;

export function _resetPackageCachesForTesting(): void {
  packageMemoryCache.clear();
  failedFetchCache.clear();
  inFlightFetches.clear();
  loadPromise = null;
}

function openPackagesDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = (ev.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_PACKAGES)) {
          db.createObjectStore(STORE_PACKAGES, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_MISSES)) {
          db.createObjectStore(STORE_MISSES, { keyPath: 'key' });
        }
      };
      req.onsuccess = (ev) => resolve((ev.target as IDBOpenDBRequest).result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

async function getAllFromIndexedDb(): Promise<LoadedPackage[]> {
  const db = await openPackagesDb();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_PACKAGES, 'readonly');
      const store = tx.objectStore(STORE_PACKAGES);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result || []) as Array<{ name: string; format: number; content: Uint8Array }>;
        const valid: LoadedPackage[] = [];
        for (const r of rows) {
          const bytes = r.content instanceof Uint8Array ? r.content : new Uint8Array(r.content);
          // Skip empty, oversized (> 8 MiB), or HTML-like cache entries
          if (bytes.length === 0 || bytes.length > MAX_PACKAGE_SIZE || isHtmlResponse(bytes)) {
            continue;
          }
          valid.push({
            name: r.name,
            format: r.format,
            content: bytes,
            contents: bytes,
          });
        }
        resolve(valid);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function saveBatchToIndexedDb(pkgs: LoadedPackage[]): Promise<void> {
  if (pkgs.length === 0) return;
  const db = await openPackagesDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = (db as any).transaction(
        STORE_PACKAGES,
        'readwrite',
        { durability: 'relaxed' },
      );
      const store = tx.objectStore(STORE_PACKAGES);
      for (const pkg of pkgs) {
        store.put({
          key: `${pkg.format}/${pkg.name}`,
          name: pkg.name,
          format: pkg.format,
          content: pkg.content,
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      try {
        const tx = db.transaction(STORE_PACKAGES, 'readwrite');
        const store = tx.objectStore(STORE_PACKAGES);
        for (const pkg of pkgs) {
          store.put({
            key: `${pkg.format}/${pkg.name}`,
            name: pkg.name,
            format: pkg.format,
            content: pkg.content,
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    }
  });
}

export function saveToIndexedDb(pkg: LoadedPackage): void {
  void saveBatchToIndexedDb([pkg]);
}

export async function getCachedMisses(): Promise<string[]> {
  const db = await openPackagesDb();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MISSES, 'readonly');
      const store = tx.objectStore(STORE_MISSES);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result || []) as Array<{ key: string }>;
        resolve(rows.map((r) => r.key));
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function fetchPackageThrottled(
  items: BundledPackageDef[],
  concurrency = 16,
  onLoaded: (pkg: LoadedPackage) => void,
): Promise<LoadedPackage[]> {
  const queue = [...items];
  const loadedList: LoadedPackage[] = [];

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const pkg = queue.shift();
      if (!pkg) break;
      try {
        const res = await fetch(`/packages/${encodeURIComponent(pkg.name)}`);
        if (res.ok) {
          const buf = await readResponseLimited(res, MAX_PACKAGE_SIZE);
          const ct = res.headers?.get?.('content-type');
          if (buf.length > 0 && !isHtmlResponse(buf, ct)) {
            const loaded: LoadedPackage = {
              name: pkg.name,
              format: pkg.format,
              content: buf,
              contents: buf,
            };
            loadedList.push(loaded);
            onLoaded(loaded);
          }
        }
      } catch {
        // Network error: leave retryable
      }
    }
  });

  await Promise.all(workers);
  return loadedList;
}

export async function getBundledPackages(): Promise<LoadedPackage[]> {
  if (packageMemoryCache.size >= BUNDLED_PACKAGES.length && loadPromise) {
    return loadPromise;
  }

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const resultsMap = new Map<string, LoadedPackage>();

    const stored = await getAllFromIndexedDb();
    for (const item of stored) {
      resultsMap.set(item.name, item);
      packageMemoryCache.set(item.name, item.content);
    }

    const missingCore = BUNDLED_PACKAGES.filter((p) => !resultsMap.has(p.name));
    if (missingCore.length > 0) {
      const newlyFetched = await fetchPackageThrottled(missingCore, 16, (loaded) => {
        resultsMap.set(loaded.name, loaded);
        packageMemoryCache.set(loaded.name, loaded.content);
      });
      if (newlyFetched.length > 0) {
        void saveBatchToIndexedDb(newlyFetched);
      }
    }

    return Array.from(resultsMap.values());
  })();

  return loadPromise;
}

export function getCachedPackageContent(name: string): Uint8Array | undefined {
  return packageMemoryCache.get(name);
}

/**
 * Extracts the files a TeX source references, so a package's own dependencies
 * can be fetched before the engine asks for them.
 */
function extractRequirements(text: string): Array<{ name: string; format: number }> {
  const out: Array<{ name: string; format: number }> = [];

  const add = (raw: string | undefined, defaultExt: string) => {
    if (!raw) return;
    for (const piece of raw.split(',')) {
      const name = piece.trim();
      if (!name || name.length > 64) continue;
      // Anything with a control sequence or brace is a macro, not a filename.
      if (/[\\{}$#%\s]/.test(name)) continue;
      out.push({
        name: /\.[a-z0-9]+$/i.test(name) ? name : `${name}${defaultExt}`,
        format: 26,
      });
    }
  };

  for (const m of text.matchAll(
    /\\(?:usepackage|RequirePackage(?:WithOptions)?)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g,
  )) {
    add(m[1], '.sty');
  }

  for (const m of text.matchAll(
    /\\(?:documentclass|LoadClass(?:WithOptions)?)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g,
  )) {
    add(m[1], '.cls');
  }

  for (const m of text.matchAll(
    /\\(?:input|InputIfFileExists|file_input:n|file_input:N)\s*\{([^}]+)\}/g,
  )) {
    add(m[1], '.tex');
  }

  for (const m of text.matchAll(/\\bibliographystyle\s*\{([^}]+)\}/g)) {
    const style = m[1]?.trim();
    if (style && !style.includes('\\')) {
      out.push({
        name: style.endsWith('.bst') ? style : `${style}.bst`,
        format: 26,
      });
    }
  }

  if (text.includes('IEEEtran') || text.includes('times') || text.includes('newtx') || text.includes('acmart')) {
    const timesMetrics = [
      'ot1ptm.fd', 't1ptm.fd', 'omlptm.fd', 'omsptm.fd',
      'ptmr7t.tfm', 'ptmb7t.tfm', 'ptmri7t.tfm', 'ptmro7t.tfm', 'ptmrc7t.tfm',
      'phvr7t.tfm', 'pcrr7t.tfm',
    ];
    for (const name of timesMetrics) {
      out.push({ name, format: name.endsWith('.tfm') ? 51 : 26 });
    }
  }

  if (text.includes('amssymb') || text.includes('amsfonts')) {
    const amsMetrics = [
      'msam10.tfm', 'msbm10.tfm', 'msam7.tfm', 'msbm7.tfm', 'msam5.tfm', 'msbm5.tfm',
    ];
    for (const name of amsMetrics) {
      out.push({ name, format: 51 });
    }
  }

  if (text.includes('sn-jnl') || text.includes('sn-basic')) {
    out.push({ name: 'sn-jnl.cls', format: 26 });
    out.push({ name: 'sn-basic.bst', format: 26 });
  }

  return out;
}

/**
 * Fetches a single package with in-flight deduplication.
 * Reuses the pending fetch promise if another caller is concurrently requesting the same package.
 */
async function fetchSinglePackage(
  target: { name: string; format: number },
  endpoint: string,
): Promise<LoadedPackage | null> {
  const key = `${target.format}/${target.name}`;
  const inFlight = inFlightFetches.get(key);
  if (inFlight) {
    return inFlight;
  }

  const fetchPromise = (async (): Promise<LoadedPackage | null> => {
    try {
      const isBundled = BUNDLED_PACKAGE_NAMES.has(target.name);
      const url = isBundled
        ? `/packages/${encodeURIComponent(target.name)}`
        : `${endpoint}/${target.format}/${encodeURIComponent(target.name)}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(PACKAGE_FETCH_TIMEOUT_MS) });

      if (res.ok) {
        const buf = await readResponseLimited(res, MAX_PACKAGE_SIZE);
        const ct = res.headers?.get?.('content-type');
        if (buf.length > 0 && !isHtmlResponse(buf, ct)) {
          const loaded: LoadedPackage = {
            name: target.name,
            format: target.format,
            content: buf,
            contents: buf,
          };
          packageMemoryCache.set(target.name, buf);
          return loaded;
        }
      }

      // Only a definitive 404 is remembered as missing.
      // Transient 5xx errors or network drops remain retryable.
      if (res.status === 404) {
        failedFetchCache.add(target.name);
      }
      return null;
    } catch {
      // Network error, timeout, or streaming size limit: remain retryable!
      return null;
    }
  })();

  inFlightFetches.set(key, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightFetches.delete(key);
  }
}

/** Fetches one batch of files with bounded concurrency (8 workers) and deduplication. */
async function resolveBatch(
  targets: Array<{ name: string; format: number }>,
  endpoint: string,
): Promise<LoadedPackage[]> {
  const resolved: LoadedPackage[] = [];
  const newlyFetched: LoadedPackage[] = [];

  const needed: Array<{ name: string; format: number }> = [];

  for (const target of targets) {
    const cached = packageMemoryCache.get(target.name);
    if (cached) {
      resolved.push({
        name: target.name,
        format: target.format,
        content: cached,
        contents: cached,
      });
    } else {
      needed.push(target);
    }
  }

  if (needed.length > 0) {
    let index = 0;
    const workers = Array.from(
      { length: Math.min(RESOLVE_CONCURRENCY, needed.length) },
      async () => {
        while (index < needed.length) {
          const target = needed[index++];
          if (!target) break;

          const loaded = await fetchSinglePackage(target, endpoint);
          if (loaded) {
            newlyFetched.push(loaded);
            resolved.push(loaded);
          }
        }
      },
    );

    await Promise.all(workers);
  }

  if (newlyFetched.length > 0) {
    void saveBatchToIndexedDb(newlyFetched);
  }

  return resolved;
}

export async function preloadDocumentPackages(
  texContent: string,
  remoteEndpointUrl?: string,
): Promise<LoadedPackage[]> {
  if (!texContent || typeof texContent !== 'string') return [];

  const endpoint =
    remoteEndpointUrl ||
    (typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/api/texlive`
      : 'https://texlive2026.texlyre.org');

  const resolvedByName = new Map<string, LoadedPackage>();
  const seen = new Set<string>();

  const skip = (name: string): boolean =>
    seen.has(name) ||
    TEXLIVE_BASIC_PACKAGES.has(name.toLowerCase()) ||
    failedFetchCache.has(name);

  let frontier = extractRequirements(texContent).filter((t) => {
    if (skip(t.name)) return false;
    seen.add(t.name);
    return true;
  });

  // Cap initial frontier to MAX_PRELOADED_FILES
  if (frontier.length > MAX_PRELOADED_FILES) {
    frontier = frontier.slice(0, MAX_PRELOADED_FILES);
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const db = await openPackagesDb();

  for (let depth = 0; depth < MAX_DEPENDENCY_DEPTH && frontier.length > 0; depth++) {
    const remainingBudget = MAX_PRELOADED_FILES - resolvedByName.size;
    if (remainingBudget <= 0) break;

    // Enforce budget on each depth frontier
    if (frontier.length > remainingBudget) {
      frontier = frontier.slice(0, remainingBudget);
    }

    // Check IndexedDB for the whole level before touching the network.
    if (db) {
      await Promise.all(
        frontier
          .filter((t) => !packageMemoryCache.has(t.name))
          .map(
            (target) =>
              new Promise<void>((resolve) => {
                try {
                  const req = db
                    .transaction(STORE_PACKAGES, 'readonly')
                    .objectStore(STORE_PACKAGES)
                    .get(`${target.format}/${target.name}`);
                  req.onsuccess = () => {
                    const stored = req.result?.content;
                    if (stored) {
                      const buf =
                        stored instanceof Uint8Array ? stored : new Uint8Array(stored);
                      if (buf.length > 0 && buf.length <= MAX_PACKAGE_SIZE && !isHtmlResponse(buf)) {
                        packageMemoryCache.set(target.name, buf);
                      }
                    }
                    resolve();
                  };
                  req.onerror = () => resolve();
                } catch {
                  resolve();
                }
              }),
          ),
      );
    }

    const batch = await resolveBatch(frontier, endpoint);

    const next = new Map<string, { name: string; format: number }>();
    for (const file of batch) {
      resolvedByName.set(file.name, file);

      if (resolvedByName.size >= MAX_PRELOADED_FILES) break;

      if (!/\.(sty|cls|def|cfg|tex|clo|fd)$/i.test(file.name)) continue;

      for (const req of extractRequirements(decoder.decode(file.content))) {
        if (skip(req.name) || next.has(req.name)) continue;
        seen.add(req.name);
        next.set(req.name, req);
      }
    }

    frontier = Array.from(next.values());
  }

  return Array.from(resolvedByName.values());
}