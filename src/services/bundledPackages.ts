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
];

const BUNDLED_PACKAGE_NAMES = new Set(BUNDLED_PACKAGES.map((p) => p.name));

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

const packageMemoryCache = new Map<string, Uint8Array>();
const failedFetchCache = new Set<string>();
let loadPromise: Promise<LoadedPackage[]> | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;

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
        resolve(
          rows.map((r) => {
            const bytes = r.content instanceof Uint8Array ? r.content : new Uint8Array(r.content);
            return {
              name: r.name,
              format: r.format,
              content: bytes,
              contents: bytes,
            };
          }),
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
      // Non-fatal
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

    const stored = await getAllFromIndexedDb();
    for (const item of stored) {
      resultsMap.set(item.name, item);
      packageMemoryCache.set(item.name, item.content);
    }

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
                contents: buf,
              };
              resultsMap.set(pkg.name, loaded);
              packageMemoryCache.set(pkg.name, buf);
              saveToIndexedDb(loaded);
            }
          } catch {
            // Ignore
          }
        }),
      );
    }

    return Array.from(resultsMap.values());
  })();

  return loadPromise;
}

export function getCachedPackageContent(name: string): Uint8Array | undefined {
  return packageMemoryCache.get(name);
}

export async function preloadDocumentPackages(
  texContent: string,
  remoteEndpointUrl?: string,
): Promise<LoadedPackage[]> {
  if (!texContent || typeof texContent !== 'string') return [];

  const targetFiles: Array<{ name: string; format: number }> = [];

  // Match \documentclass[...]{class_name}
  const classMatches = texContent.matchAll(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/g);
  for (const match of classMatches) {
    const raw = match[1]?.trim();
    if (raw) {
      const clsName = raw.endsWith('.cls') ? raw : `${raw}.cls`;
      targetFiles.push({ name: clsName, format: 26 });
    }
  }

  // Match \usepackage[...]{pkg1, pkg2, ...} and \RequirePackage[...]{pkg1, pkg2, ...}
  const pkgMatches = texContent.matchAll(/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]+)\}/g);
  for (const match of pkgMatches) {
    const raw = match[1]?.trim();
    if (raw) {
      const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
      for (const n of names) {
        const styName = n.endsWith('.sty') ? n : `${n}.sty`;
        targetFiles.push({ name: styName, format: 26 });
      }
    }
  }

  // Filter out packages already in texlive-basic.data or known 404 misses
  const uniqueTargets = new Map<string, { name: string; format: number }>();
  for (const tf of targetFiles) {
    if (TEXLIVE_BASIC_PACKAGES.has(tf.name.toLowerCase())) continue;
    if (failedFetchCache.has(tf.name)) continue;
    if (!uniqueTargets.has(tf.name)) {
      uniqueTargets.set(tf.name, tf);
    }
  }

  const targets = Array.from(uniqueTargets.values());
  if (targets.length === 0) return [];

  const resolvedPackages: LoadedPackage[] = [];
  const neededFiles: Array<{ name: string; format: number }> = [];

  for (const target of targets) {
    const memBuf = packageMemoryCache.get(target.name);
    if (memBuf) {
      resolvedPackages.push({
        name: target.name,
        format: target.format,
        content: memBuf,
        contents: memBuf,
      });
    } else {
      neededFiles.push(target);
    }
  }

  if (neededFiles.length === 0) return resolvedPackages;

  const db = await openPackagesDb();
  if (db) {
    try {
      const tx = db.transaction(STORE_PACKAGES, 'readonly');
      const store = tx.objectStore(STORE_PACKAGES);
      await Promise.all(
        neededFiles.map((target) => {
          return new Promise<void>((resolve) => {
            const req = store.get(`${target.format}/${target.name}`);
            req.onsuccess = () => {
              if (req.result && req.result.content) {
                const buf =
                  req.result.content instanceof Uint8Array
                    ? req.result.content
                    : new Uint8Array(req.result.content);
                packageMemoryCache.set(target.name, buf);
                resolvedPackages.push({
                  name: target.name,
                  format: target.format,
                  content: buf,
                  contents: buf,
                });
              }
              resolve();
            };
            req.onerror = () => resolve();
          });
        }),
      );
    } catch {
      // Ignore IDB errors
    }
  }

  const toFetch = neededFiles.filter(
    (target) => !packageMemoryCache.has(target.name) && !failedFetchCache.has(target.name)
  );
  if (toFetch.length === 0) return resolvedPackages;

  const endpoint =
    remoteEndpointUrl ||
    (typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/api/texlive`
      : 'https://texlive2026.texlyre.org');

  await Promise.all(
    toFetch.map(async (target) => {
      try {
        const isBundled = BUNDLED_PACKAGE_NAMES.has(target.name);
        const url = isBundled
          ? `/packages/${encodeURIComponent(target.name)}`
          : `${endpoint}/${target.format}/${encodeURIComponent(target.name)}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer());
          const loaded: LoadedPackage = {
            name: target.name,
            format: target.format,
            content: buf,
            contents: buf,
          };
          packageMemoryCache.set(target.name, buf);
          saveToIndexedDb(loaded);
          resolvedPackages.push(loaded);
        } else if (res.status === 404) {
          failedFetchCache.add(target.name);
        }
      } catch {
        failedFetchCache.add(target.name);
      }
    }),
  );

  return resolvedPackages;
}