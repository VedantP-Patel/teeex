import type { Project } from '../types/latex';
import type { Checkpoint } from './checkpointsService';

const DB_NAME = 'teeex_offline_db';
const DB_VERSION = 2;
const STORE_NAME = 'projects_cache';
const CHECKPOINTS_STORE = 'checkpoints_cache';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CHECKPOINTS_STORE)) {
        db.createObjectStore(CHECKPOINTS_STORE, { keyPath: 'projectId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProjectOffline(project: Project): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ ...project, _offlineSavedAt: Date.now() });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Offline project storage failed:', err);
  }
}

export async function loadProjectOffline(projectId: string): Promise<Project | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(projectId);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveCheckpointsOffline(projectId: string, checkpoints: Checkpoint[]): Promise<void> {
  if (!projectId) return;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHECKPOINTS_STORE, 'readwrite');
      const store = tx.objectStore(CHECKPOINTS_STORE);
      const req = store.put({
        projectId,
        checkpoints,
        savedAt: Date.now(),
      });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Offline checkpoints storage failed:', err);
  }
}

export async function loadCheckpointsOffline(projectId: string): Promise<Checkpoint[] | null> {
  if (!projectId) return null;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHECKPOINTS_STORE, 'readonly');
      const store = tx.objectStore(CHECKPOINTS_STORE);
      const req = store.get(projectId);

      req.onsuccess = () => {
        const result = req.result;
        if (result && Array.isArray(result.checkpoints)) {
          resolve(result.checkpoints);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/**
 * Requests durable (persistent) storage so the browser will not evict
 * offline projects, compiled PDFs, and checkpoints under disk pressure.
 */
export async function requestDurableStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Proactively checks local storage quota health.
 */
export async function getStorageEstimate(): Promise<{ usageMB: number; quotaMB: number; percentUsed: number }> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 1;
      const usageMB = Math.round((usage / (1024 * 1024)) * 100) / 100;
      const quotaMB = Math.round((quota / (1024 * 1024)) * 100) / 100;
      const percentUsed = Math.min(100, Math.round((usage / quota) * 10000) / 100);
      return { usageMB, quotaMB, percentUsed };
    } catch {
      return { usageMB: 0, quotaMB: 0, percentUsed: 0 };
    }
  }
  return { usageMB: 0, quotaMB: 0, percentUsed: 0 };
}
