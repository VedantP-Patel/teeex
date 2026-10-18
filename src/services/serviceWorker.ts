/**
 * Teeex — Service Worker & Persistent Cache Manager.
 *
 * Coordinates Service Worker registration, persistent storage requests
 * (`navigator.storage.persist()`), and engine binary CacheStorage inspection.
 */

export interface EngineCacheStatus {
  isSupported: boolean;
  isRegistered: boolean;
  isEngineCached: boolean;
  hasWasm: boolean;
  hasData: boolean;
  persistedStorage: boolean;
  cachedBytes: number;
}

const ENGINE_CACHE_NAME = 'teeex-engine-v1.4.0';

/**
 * Registers the root service worker (/sw.js) and requests persistent storage.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  // Only bypass in local development if specifically disabled
  if (import.meta.env.DEV && import.meta.env.VITE_DISABLE_SW === 'true') {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    // Force service worker update check on registration
    try {
      await registration.update();
    } catch {}

    // Invalidate stale cached engine JS scripts in CacheStorage
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(ENGINE_CACHE_NAME);
        const pipelineResp = await cache.match('/core/busytex/busytex_pipeline.js');
        if (pipelineResp) {
          const text = await pipelineResp.clone().text();
          if (!text.includes('supported_drivers =')) {
            await cache.delete('/core/busytex/busytex_pipeline.js');
          }
        }
      } catch {}
    }

    // Request persistent storage to protect against browser eviction under disk pressure
    await requestPersistentStorage();

    return registration;
  } catch (err) {
    console.warn('[ServiceWorker] Registration notice:', err);
    return null;
  }
}

/**
 * Requests browser permission for persistent storage so CacheStorage and IndexedDB
 * are never purged during temporary storage cleanups.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.storage || !navigator.storage.persist) {
    return false;
  }

  try {
    const isPersisted = await navigator.storage.persisted();
    if (isPersisted) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * Queries both CacheStorage and IndexedDB to verify whether the 120MB TeX engine
 * binaries (busytex.wasm & texlive-basic.data) are fully cached on local disk.
 */
export async function checkEngineCacheStatus(): Promise<EngineCacheStatus> {
  const fallback: EngineCacheStatus = {
    isSupported: false,
    isRegistered: false,
    isEngineCached: false,
    hasWasm: false,
    hasData: false,
    persistedStorage: false,
    cachedBytes: 0,
  };

  if (typeof window === 'undefined' || !('caches' in window)) {
    return fallback;
  }

  try {
    const isRegistered = Boolean(navigator.serviceWorker?.controller);
    const persistedStorage = navigator.storage?.persisted ? await navigator.storage.persisted() : false;

    let cachedBytes = 0;
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      cachedBytes = est.usage || 0;
    }

    const cache = await caches.open(ENGINE_CACHE_NAME);
    const wasmMatch = await cache.match('/core/busytex/busytex.wasm');
    const dataMatch = await cache.match('/core/busytex/texlive-basic.data');

    // Also check Emscripten's built-in IndexedDB package cache (EM_PRELOAD_CACHE)
    const idbDataCached = await checkEmscriptenIdbCache();

    const hasWasm = Boolean(wasmMatch);
    const hasData = Boolean(dataMatch || idbDataCached);
    const isEngineCached = hasWasm && hasData;

    return {
      isSupported: true,
      isRegistered,
      isEngineCached,
      hasWasm,
      hasData,
      persistedStorage,
      cachedBytes,
    };
  } catch (err) {
    console.warn('[ServiceWorker] Cache inspection notice:', err);
    return { ...fallback, isSupported: true };
  }
}

/**
 * Inspects Emscripten's EM_PRELOAD_CACHE IndexedDB database where texlive-basic.data
 * is partitioned and cached by the Emscripten runtime.
 */
async function checkEmscriptenIdbCache(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.indexedDB) return false;

  return new Promise<boolean>((resolve) => {
    try {
      const req = indexedDB.open('EM_PRELOAD_CACHE', 1);
      req.onerror = () => resolve(false);
      req.onupgradeneeded = () => {
        // Database didn't exist yet
        req.transaction?.abort();
        resolve(false);
      };
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        try {
          if (!db.objectStoreNames.contains('METADATA')) {
            db.close();
            return resolve(false);
          }
          const tx = db.transaction('METADATA', 'readonly');
          const store = tx.objectStore('METADATA');
          const getReq = store.get('metadata/texlive-basic.data');
          getReq.onsuccess = () => {
            db.close();
            resolve(Boolean(getReq.result));
          };
          getReq.onerror = () => {
            db.close();
            resolve(false);
          };
        } catch {
          db.close();
          resolve(false);
        }
      };
    } catch {
      resolve(false);
    }
  });
}

/**
 * Subscribes to broadcast notifications emitted by sw.js when engine assets
 * or packages are streamed and saved into CacheStorage.
 */
export function onServiceWorkerBroadcast(callback: (msg: { type: string; url?: string }) => void): () => void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return () => {};
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel('teeex_sw_channel');
    const handler = (event: MessageEvent) => {
      if (event.data) callback(event.data);
    };
    channel.addEventListener('message', handler);
    return () => {
      channel?.removeEventListener('message', handler);
      channel?.close();
    };
  } catch {
    return () => {};
  }
}
