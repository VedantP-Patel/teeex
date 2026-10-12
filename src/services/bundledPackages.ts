/**
 * Teeex — Pre-bundled academic templates and font metric assets with IndexedDB persistence.
 *
 * Pre-seeds popular academic packages (IEEEtran, cite, acmart) and essential
 * font metrics (Times, Helvetica, AMS Math) into the WebAssembly engine's
 * in-memory kpathsea tree on initialization.
 *
 * Persists both preloaded and remotely downloaded CTAN assets in IndexedDB so
 * subsequent compiles across browser sessions incur 0ms network latency.
 */

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
  { name: 'msbm5.tfm', format: 51 },
];

export interface LoadedPackage {
  name: string;
  format: number;
  content: Uint8Array;
}

const DB_NAME = 'teeex_packages_db';
const DB_VERSION = 1;
const STORE_PACKAGES = 'packages';
const STORE_MISSES = 'misses';

const packageMemoryCache = new Map<string, Uint8Array>();
let loadPromise: Promise<LoadedPackage[]> | null = null;

function openPackagesDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
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
        resolve(
          rows.map((r) => ({
            name: r.name,
            format: r.format,
            content: r.content instanceof Uint8Array ? r.content : new Uint8Array(r.content),
          })),
        );
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function saveToIndexedDb(pkg: LoadedPackage): void {
  void (async () => {
    const db = await openPackagesDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_PACKAGES, 'readwrite');
      tx.objectStore(STORE_PACKAGES).put({
        key: `${pkg.format}/${pkg.name}`,
        name: pkg.name,
        format: pkg.format,
        content: pkg.content,
      });
    } catch {
      // Non-fatal if IndexedDB write fails
    }
  })();
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

export async function getBundledPackages(): Promise<LoadedPackage[]> {
  if (packageMemoryCache.size >= BUNDLED_PACKAGES.length && loadPromise) {
    return loadPromise;
  }

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const resultsMap = new Map<string, LoadedPackage>();

    // 1. Hydrate from IndexedDB first (0ms latency if cached from past sessions)
    const stored = await getAllFromIndexedDb();
    for (const item of stored) {
      resultsMap.set(item.name, item);
      packageMemoryCache.set(item.name, item.content);
    }

    // 2. Fetch any missing core bundled packages from static /packages/
    const missingCore = BUNDLED_PACKAGES.filter((p) => !resultsMap.has(p.name));
    if (missingCore.length > 0) {
      await Promise.all(
        missingCore.map(async (pkg) => {
          try {
            const res = await fetch(`/packages/${pkg.name}`);
            if (res.ok) {
              const buf = new Uint8Array(await res.arrayBuffer());
              const loaded: LoadedPackage = {
                name: pkg.name,
                format: pkg.format,
                content: buf,
              };
              resultsMap.set(pkg.name, loaded);
              packageMemoryCache.set(pkg.name, buf);
              saveToIndexedDb(loaded);
            }
          } catch {
            // Graceful fallback if asset cannot be fetched
          }
        }),
      );
    }

    return Array.from(resultsMap.values());
  })();

  return loadPromise;
}

/**
 * Returns package content synchronously if already pre-loaded into memory.
 */
export function getCachedPackageContent(name: string): Uint8Array | undefined {
  return packageMemoryCache.get(name);
}
