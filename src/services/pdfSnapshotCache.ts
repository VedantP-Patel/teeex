/**
 * Teeex — Persistent PDF Snapshot Cache.
 *
 * Stores the most recently compiled PDF in IndexedDB per project.
 * When a user opens Teeex or refreshes the page, the cached PDF is restored in
 * < 50ms, eliminating the 20-second blank screen while the TeX engine warms up.
 */

const DB_NAME = 'teeex_artifacts_db';
const DB_VERSION = 1;
const STORE_PDF = 'pdf_snapshots';

export interface StoredPdfSnapshot {
  projectId: string;
  pdf: Uint8Array;
  synctex?: Uint8Array | null;
  timestamp: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openArtifactsDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = (ev.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_PDF)) {
          db.createObjectStore(STORE_PDF, { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains('aux_artifacts')) {
          db.createObjectStore('aux_artifacts', { keyPath: 'projectId' });
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

/**
 * Persists the compiled PDF and optional SyncTeX bytes to IndexedDB under the project ID.
 * Uses relaxed durability for non-blocking asynchronous disk writes.
 */
export async function saveCompiledPdfSnapshot(
  projectId: string,
  pdfBytes: Uint8Array,
  synctexBytes?: Uint8Array | null,
): Promise<void> {
  if (!projectId || !pdfBytes || pdfBytes.byteLength === 0) return;

  const db = await openArtifactsDb();
  if (!db) return;

  return new Promise((resolve) => {
    const record: StoredPdfSnapshot = {
      projectId,
      pdf: pdfBytes,
      synctex: synctexBytes && synctexBytes.byteLength > 0 ? synctexBytes : null,
      timestamp: Date.now(),
    };

    try {
      const tx = (db as any).transaction(
        STORE_PDF,
        'readwrite',
        { durability: 'relaxed' },
      );
      const store = tx.objectStore(STORE_PDF);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      try {
        const tx = db.transaction(STORE_PDF, 'readwrite');
        const store = tx.objectStore(STORE_PDF);
        store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    }
  });
}

/**
 * Loads the latest compiled PDF bytes from IndexedDB.
 * Returns null if no snapshot exists or if storage is unavailable.
 */
export async function loadCompiledPdfSnapshot(
  projectId: string,
): Promise<Uint8Array | null> {
  const snapshot = await loadCompiledSnapshot(projectId);
  return snapshot ? snapshot.pdf : null;
}

/**
 * Loads the complete compiled snapshot (PDF and SyncTeX bytes) from IndexedDB.
 * Returns null if no snapshot exists or if storage is unavailable.
 */
export async function loadCompiledSnapshot(
  projectId: string,
): Promise<{ pdf: Uint8Array; synctex: Uint8Array | null } | null> {
  if (!projectId) return null;

  const db = await openArtifactsDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_PDF, 'readonly');
      const store = tx.objectStore(STORE_PDF);
      const req = store.get(projectId);

      req.onsuccess = () => {
        const res = req.result as StoredPdfSnapshot | undefined;
        if (res && res.pdf && res.pdf.byteLength > 0) {
          const pdf = res.pdf instanceof Uint8Array ? res.pdf : new Uint8Array(res.pdf);
          const synctex =
            res.synctex && res.synctex.byteLength > 0
              ? res.synctex instanceof Uint8Array
                ? res.synctex
                : new Uint8Array(res.synctex)
              : null;
          resolve({ pdf, synctex });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

