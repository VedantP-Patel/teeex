/**
 * Teeex Studio — Version History & Checkpoints Service
 * Manages per-project snapshot history, automatic checkpoint autosaves,
 * local storage caching, and Supabase cloud synchronization.
 */

import type { ProjectFile } from '../types/latex';
import { getSupabaseClient, isSupabaseConnected } from './supabaseClient';

export interface Checkpoint {
  id: string;
  projectId: string;
  name: string;
  timestamp: string;
  author: string;
  files: ProjectFile[];
  isAutoSave?: boolean;
  createdAt?: string;
}

const CHECKPOINTS_STORAGE_PREFIX = 'teeex_checkpoints_';
const MAX_CHECKPOINTS_PER_PROJECT = 35;

function getStorageKey(projectId: string): string {
  return `${CHECKPOINTS_STORAGE_PREFIX}${projectId}`;
}

/**
 * Load all checkpoints for a given project from localStorage.
 * If none exist, generates an initial baseline snapshot.
 */
export function loadProjectCheckpoints(
  projectId: string,
  currentFiles?: ProjectFile[],
  authorName = 'You'
): Checkpoint[] {
  if (!projectId) return [];

  const key = getStorageKey(projectId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((cp: any) => ({
          id: cp.id || `cp-${Date.now()}`,
          projectId: cp.projectId || projectId,
          name: cp.name || 'Checkpoint',
          timestamp: cp.timestamp || 'Just now',
          author: cp.author || 'Author',
          files: Array.isArray(cp.files) ? cp.files : [],
          isAutoSave: Boolean(cp.isAutoSave),
          createdAt: cp.createdAt || new Date().toISOString(),
        }));
      }
    }
  } catch (err) {
    console.warn(`Failed to read checkpoints for project ${projectId}:`, err);
  }

  // Create initial baseline snapshot if files are available
  if (currentFiles && currentFiles.length > 0) {
    const initialCp: Checkpoint = {
      id: `cp-init-${projectId}`,
      projectId,
      name: 'Initial Baseline',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      author: authorName,
      files: JSON.parse(JSON.stringify(currentFiles)),
      isAutoSave: false,
      createdAt: new Date().toISOString(),
    };
    saveProjectCheckpoints(projectId, [initialCp]);
    return [initialCp];
  }

  return [];
}

/**
 * Persist checkpoints for a given project to localStorage.
 */
export function saveProjectCheckpoints(projectId: string, checkpoints: Checkpoint[]): void {
  if (!projectId) return;
  const key = getStorageKey(projectId);
  try {
    localStorage.setItem(key, JSON.stringify(checkpoints));
  } catch (err) {
    console.warn(`Failed to persist checkpoints for project ${projectId}:`, err);
  }
}

/**
 * Create a new checkpoint (manual snapshot or automatic autosave),
 * persist locally, prune excess auto-saves, and push to Supabase cloud.
 */
export function createCheckpoint(
  projectId: string,
  name: string,
  author: string,
  files: ProjectFile[],
  isAutoSave = false
): Checkpoint {
  const now = new Date();
  const newCp: Checkpoint = {
    id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectId,
    name,
    timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    author: author || 'Author',
    files: JSON.parse(JSON.stringify(files)),
    isAutoSave,
    createdAt: now.toISOString(),
  };

  const current = loadProjectCheckpoints(projectId);
  let updated = [newCp, ...current];

  // Prune if exceeds max limit (prefer removing oldest auto-saves first)
  if (updated.length > MAX_CHECKPOINTS_PER_PROJECT) {
    const manualCps = updated.filter(c => !c.isAutoSave);
    const autoCps = updated.filter(c => c.isAutoSave);
    
    // Keep newest auto-saves
    const trimmedAuto = autoCps.slice(0, Math.max(10, MAX_CHECKPOINTS_PER_PROJECT - manualCps.length));
    updated = [...manualCps, ...trimmedAuto].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }

  saveProjectCheckpoints(projectId, updated);

  // Background push to Supabase Cloud
  if (isSupabaseConnected()) {
    pushCheckpointToCloud(projectId, newCp).catch(err => {
      console.warn('Background checkpoint cloud push error:', err);
    });
  }

  return newCp;
}

/**
 * Remove a checkpoint from local storage and Supabase cloud.
 */
export async function deleteCheckpoint(projectId: string, checkpointId: string): Promise<Checkpoint[]> {
  const current = loadProjectCheckpoints(projectId);
  const updated = current.filter(cp => cp.id !== checkpointId);
  saveProjectCheckpoints(projectId, updated);

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('checkpoints').delete().eq('id', checkpointId);
    } catch (err) {
      console.warn('Failed to delete checkpoint from cloud:', err);
    }
  }

  return updated;
}

/**
 * Push a single checkpoint to the Supabase checkpoints table.
 */
export async function pushCheckpointToCloud(
  projectId: string,
  checkpoint: Checkpoint
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, error: 'Supabase client not connected' };

  try {
    const row = {
      id: checkpoint.id,
      project_id: projectId,
      name: checkpoint.name,
      timestamp: checkpoint.timestamp,
      author: checkpoint.author,
      files: checkpoint.files,
      created_at: checkpoint.createdAt || new Date().toISOString(),
    };

    const { error } = await supabase.from('checkpoints').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('Checkpoint push to cloud error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { success: false, error: e?.message || 'Cloud checkpoint sync failed' };
  }
}

/**
 * Fetch remote checkpoints from Supabase and merge with local checkpoints.
 */
export async function fetchProjectCheckpointsFromCloud(
  projectId: string
): Promise<{ success: boolean; checkpoints: Checkpoint[]; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase || !projectId) {
    return { success: false, checkpoints: loadProjectCheckpoints(projectId), error: 'Not connected' };
  }

  try {
    const { data, error } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, checkpoints: loadProjectCheckpoints(projectId), error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: true, checkpoints: loadProjectCheckpoints(projectId) };
    }

    const cloudCheckpoints: Checkpoint[] = data.map((r: any) => ({
      id: r.id,
      projectId: r.project_id || projectId,
      name: r.name,
      timestamp: r.timestamp,
      author: r.author,
      files: Array.isArray(r.files) ? r.files : [],
      isAutoSave: r.name.toLowerCase().startsWith('auto-save'),
      createdAt: r.created_at,
    }));

    // Merge cloud and local checkpoints without duplicates
    const local = loadProjectCheckpoints(projectId);
    const map = new Map<string, Checkpoint>();
    
    // Cloud takes baseline, local supplements
    for (const cp of cloudCheckpoints) {
      map.set(cp.id, cp);
    }
    for (const cp of local) {
      if (!map.has(cp.id)) {
        map.set(cp.id, cp);
        // Push any local-only checkpoints to cloud in background
        pushCheckpointToCloud(projectId, cp).catch(() => {});
      }
    }

    const merged = Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    saveProjectCheckpoints(projectId, merged);
    return { success: true, checkpoints: merged };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { success: false, checkpoints: loadProjectCheckpoints(projectId), error: e?.message || 'Fetch failed' };
  }
}

/**
 * Helper to determine if files have changed significantly enough to warrant an autosave snapshot.
 */
export function haveFilesChanged(oldFiles: ProjectFile[], newFiles: ProjectFile[]): boolean {
  if (oldFiles.length !== newFiles.length) return true;
  for (const n of newFiles) {
    const matched = oldFiles.find(o => o.id === n.id || o.name === n.name);
    if (!matched) return true;
    if (matched.content !== n.content) return true;
  }
  return false;
}
