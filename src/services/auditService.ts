/**
 * Teeex Studio — Project Security & Activity Audit Log Service
 * Hybrid local cache + IndexedDB durable outbox + Supabase append-only cloud sync.
 */

import type { AuditLogEntry } from '../types/latex';
import { getSupabaseClient, isSupabaseConnected } from './supabaseClient';

const AUDIT_STORAGE_PREFIX = 'teeex_audit_';
const OUTBOX_DB_NAME = 'teeex_audit_outbox_db';
const OUTBOX_STORE = 'outbox';
const MAX_LOCAL_ENTRIES = 150;
const BATCH_SIZE = 50;

const memoryCache = new Map<string, AuditLogEntry[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

function openOutboxDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(OUTBOX_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function enqueueOutbox(entry: AuditLogEntry): Promise<void> {
  const db = await openOutboxDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction([OUTBOX_STORE], 'readwrite', { durability: 'relaxed' });
      tx.objectStore(OUTBOX_STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function drainOutboxBatch(limit: number): Promise<AuditLogEntry[]> {
  const db = await openOutboxDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([OUTBOX_STORE], 'readonly');
      const req = tx.objectStore(OUTBOX_STORE).getAll(undefined, limit);
      req.onsuccess = () => resolve((req.result as AuditLogEntry[]) || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function deleteOutboxIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openOutboxDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction([OUTBOX_STORE], 'readwrite', { durability: 'relaxed' });
      const store = tx.objectStore(OUTBOX_STORE);
      for (const id of ids) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function flushAuditOutbox(): Promise<void> {
  const sb = isSupabaseConnected() ? getSupabaseClient() : null;
  if (isFlushing || !sb) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  isFlushing = true;
  try {
    const batch = await drainOutboxBatch(BATCH_SIZE);
    if (batch.length === 0) return;

    const rows = batch.map((e) => ({
      id: e.id,
      project_id: e.projectId,
      action: e.action,
      detail: e.detail,
      user_name: e.userName,
      user_role: e.userRole,
      category: e.category,
      created_at: e.timestamp,
    }));

    const { error } = await sb
      .from('project_audit_logs')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

    if (!error) {
      await deleteOutboxIds(batch.map((b) => b.id));
      if (batch.length === BATCH_SIZE) {
        scheduleFlush(250);
      }
    }
  } catch {
    // Keep entries safely in IndexedDB outbox for next retry
  } finally {
    isFlushing = false;
  }
}

function scheduleFlush(delayMs = 4000): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAuditOutbox();
  }, delayMs);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushAuditOutbox();
    }
  });
}

function persistLocalMirror(projectId: string, entries: AuditLogEntry[]): void {
  try {
    localStorage.setItem(
      `${AUDIT_STORAGE_PREFIX}${projectId}`,
      JSON.stringify(entries.slice(0, MAX_LOCAL_ENTRIES))
    );
  } catch {
    // Ignore localStorage quota errors; IndexedDB outbox + Supabase hold authoritative history
  }
}

export function getAuditLogs(projectId: string): AuditLogEntry[] {
  const cached = memoryCache.get(projectId);
  if (cached) return cached;

  try {
    const raw = localStorage.getItem(`${AUDIT_STORAGE_PREFIX}${projectId}`);
    const parsed: AuditLogEntry[] = raw ? JSON.parse(raw) : [];
    memoryCache.set(projectId, parsed);
    return parsed;
  } catch {
    return [];
  }
}

export function logAuditAction(
  projectId: string,
  action: string,
  detail: string,
  userName: string,
  userRole: string,
  category: AuditLogEntry['category'] = 'document'
): void {
  const newEntry: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    action,
    detail,
    timestamp: new Date().toISOString(),
    userName,
    userRole,
    category,
  };

  const current = getAuditLogs(projectId);
  const updated = [newEntry, ...current].slice(0, MAX_LOCAL_ENTRIES);
  memoryCache.set(projectId, updated);
  persistLocalMirror(projectId, updated);

  void enqueueOutbox(newEntry).then(() => scheduleFlush());
}

/**
 * Hydrates audit logs from Supabase and merges any pending local outbox records.
 */
export async function syncAuditLogsFromCloud(projectId: string): Promise<AuditLogEntry[]> {
  await flushAuditOutbox();
  const local = getAuditLogs(projectId);

  const sb = isSupabaseConnected() ? getSupabaseClient() : null;
  if (!sb) return local;

  try {
    const { data, error } = await sb
      .from('project_audit_logs')
      .select('id, project_id, action, detail, user_name, user_role, category, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(MAX_LOCAL_ENTRIES);

    if (error || !data) return local;

    const mergedMap = new Map<string, AuditLogEntry>();
    for (const row of data) {
      mergedMap.set(row.id, {
        id: row.id,
        projectId: row.project_id,
        action: row.action,
        detail: row.detail,
        timestamp: row.created_at,
        userName: row.user_name,
        userRole: row.user_role,
        category: (row.category as AuditLogEntry['category']) || 'document',
      });
    }
    for (const item of local) {
      if (!mergedMap.has(item.id)) {
        mergedMap.set(item.id, item);
      }
    }

    const merged = Array.from(mergedMap.values())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, MAX_LOCAL_ENTRIES);

    memoryCache.set(projectId, merged);
    persistLocalMirror(projectId, merged);
    return merged;
  } catch {
    return local;
  }
}