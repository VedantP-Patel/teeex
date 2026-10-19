/**
 * Teeex Studio — Version History & Git-Grade Checkpoints Service
 * Manages per-project snapshot history, commit composer, working tree tracking,
 * local storage caching, and Supabase cloud push/pull synchronization.
 */

import type { ProjectFile } from '../types/latex';
import { getSupabaseClient, isSupabaseConnected } from './supabaseClient';
import { computeLineDiff } from './diffService';

export interface CommitStats {
  additions: number;
  deletions: number;
  filesChanged: number;
}

export interface Checkpoint {
  id: string; // Commit SHA (e.g. 40-char or deterministic hash)
  shortSha: string; // 7-char short SHA (e.g. "a3f8c12")
  projectId: string;
  name: string; // Commit message title
  message?: string; // Explicit message alias
  description?: string; // Optional multiline commit notes
  timestamp: string; // Human-friendly time
  author: string;
  authorEmail?: string;
  files: ProjectFile[];
  stats?: CommitStats;
  parentId?: string | null;
  branch?: string; // default "main"
  isSyncedToCloud?: boolean;
  isAutoSave?: boolean;
  createdAt?: string;
}

export interface WorkingTreeFileStatus {
  fileId: string;
  fileName: string;
  status: 'modified' | 'added' | 'deleted';
  additions: number;
  deletions: number;
}

export interface WorkingTreeStatus {
  isClean: boolean;
  files: WorkingTreeFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface SyncStatus {
  ahead: number; // Local commits not yet pushed to cloud
  behind: number; // Remote commits not yet pulled locally
  isUpToDate: boolean;
}

const CHECKPOINTS_STORAGE_PREFIX = 'teeex_checkpoints_';
const BRANCHES_STORAGE_PREFIX = 'teeex_branches_';
const ACTIVE_BRANCH_STORAGE_PREFIX = 'teeex_active_branch_';
const MAX_CHECKPOINTS_PER_PROJECT = 50;

function getStorageKey(projectId: string): string {
  return `${CHECKPOINTS_STORAGE_PREFIX}${projectId}`;
}

function getBranchesStorageKey(projectId: string): string {
  return `${BRANCHES_STORAGE_PREFIX}${projectId}`;
}

function getActiveBranchStorageKey(projectId: string): string {
  return `${ACTIVE_BRANCH_STORAGE_PREFIX}${projectId}`;
}

/**
 * Retrieves the list of branch names for a project (defaults to ['main']).
 */
export function getProjectBranches(projectId: string): string[] {
  if (!projectId) return ['main'];
  try {
    const raw = localStorage.getItem(getBranchesStorageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return Array.from(new Set(['main', ...parsed.filter(Boolean)]));
      }
    }
  } catch (err) {
    console.warn(`Failed to read branches for project ${projectId}:`, err);
  }
  return ['main'];
}

/**
 * Returns the active branch name for a project (defaults to 'main').
 */
export function getActiveBranch(projectId: string): string {
  if (!projectId) return 'main';
  try {
    const active = localStorage.getItem(getActiveBranchStorageKey(projectId));
    if (active && typeof active === 'string') {
      return active;
    }
  } catch {
    // fallback
  }
  return 'main';
}

/**
 * Sets the active branch for a project.
 */
export function setActiveBranch(projectId: string, branchName: string): void {
  if (!projectId || !branchName) return;
  try {
    const branches = getProjectBranches(projectId);
    if (!branches.includes(branchName)) {
      branches.push(branchName);
      localStorage.setItem(getBranchesStorageKey(projectId), JSON.stringify(branches));
    }
    localStorage.setItem(getActiveBranchStorageKey(projectId), branchName);
  } catch (err) {
    console.warn(`Failed to set active branch for project ${projectId}:`, err);
  }
}

/**
 * Creates a new branch for a project.
 */
export function createBranch(
  projectId: string,
  branchName: string,
  _sourceCommitId?: string
): { success: boolean; error?: string } {
  if (!projectId) return { success: false, error: 'Invalid project ID' };
  const cleanName = branchName.trim().replace(/\s+/g, '-').toLowerCase();
  if (!cleanName) return { success: false, error: 'Branch name cannot be empty' };
  if (!/^[a-z0-9_\-\/\.]+$/.test(cleanName)) {
    return { success: false, error: 'Branch name can only contain lowercase alphanumeric, -, _, /, and .' };
  }

  const branches = getProjectBranches(projectId);
  if (branches.includes(cleanName)) {
    return { success: false, error: `Branch "${cleanName}" already exists` };
  }

  branches.push(cleanName);
  try {
    localStorage.setItem(getBranchesStorageKey(projectId), JSON.stringify(branches));
    localStorage.setItem(getActiveBranchStorageKey(projectId), cleanName);
    return { success: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { success: false, error: e?.message || 'Failed to save branch' };
  }
}

/**
 * Deletes a branch from a project.
 */
export function deleteBranch(
  projectId: string,
  branchName: string
): { success: boolean; error?: string } {
  if (!projectId || !branchName) return { success: false, error: 'Invalid arguments' };
  if (branchName === 'main') return { success: false, error: 'Cannot delete default branch "main"' };
  if (branchName === getActiveBranch(projectId)) {
    return { success: false, error: 'Cannot delete currently active branch. Switch to another branch first.' };
  }

  const branches = getProjectBranches(projectId);
  const updated = branches.filter(b => b !== branchName);
  try {
    localStorage.setItem(getBranchesStorageKey(projectId), JSON.stringify(updated));
    return { success: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { success: false, error: e?.message || 'Failed to delete branch' };
  }
}

/**
 * Generates a deterministic or pseudorandom 7-character Git-style SHA.
 */
export function generateShortSha(seed?: string): string {
  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(7, '0');
    return hex.slice(0, 7);
  }
  return Math.random().toString(16).slice(2, 9);
}

/**
 * Load all checkpoints/commits for a given project from localStorage.
 * If none exist, generates an initial baseline commit.
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
        return parsed.map((cp: any) => {
          const id = cp.id || `cp-${Date.now()}`;
          const shortSha = cp.shortSha || id.replace(/^cp-/, '').slice(0, 7) || generateShortSha(id);
          return {
            id,
            shortSha,
            projectId: cp.projectId || projectId,
            name: cp.name || cp.message || 'Commit',
            message: cp.message || cp.name || 'Commit',
            description: cp.description || '',
            timestamp: cp.timestamp || 'Just now',
            author: cp.author || 'Author',
            authorEmail: cp.authorEmail || '',
            files: Array.isArray(cp.files) ? cp.files : [],
            stats: cp.stats || { additions: 0, deletions: 0, filesChanged: 0 },
            parentId: cp.parentId ?? null,
            branch: cp.branch || 'main',
            isSyncedToCloud: cp.isSyncedToCloud ?? false,
            isAutoSave: Boolean(cp.isAutoSave),
            createdAt: cp.createdAt || new Date().toISOString(),
          };
        });
      }
    }
  } catch (err) {
    console.warn(`Failed to read checkpoints for project ${projectId}:`, err);
  }

  // Create initial baseline snapshot if files are available
  if (currentFiles && currentFiles.length > 0) {
    const now = new Date();
    const sha = generateShortSha(`init-${projectId}-${now.toISOString()}`);
    const initialCp: Checkpoint = {
      id: `commit-${sha}`,
      shortSha: sha,
      projectId,
      name: 'Initial Baseline',
      message: 'Initial Baseline',
      description: 'Initial project setup with root LaTeX documents and templates.',
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      author: authorName,
      files: JSON.parse(JSON.stringify(currentFiles)),
      stats: { additions: currentFiles.reduce((acc, f) => acc + (f.content?.split('\n').length || 0), 0), deletions: 0, filesChanged: currentFiles.length },
      parentId: null,
      branch: 'main',
      isSyncedToCloud: false,
      isAutoSave: false,
      createdAt: now.toISOString(),
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
 * Computes the delta statistics (additions, deletions, filesChanged)
 * between a previous snapshot and a new set of files.
 */
export function computeCommitStats(
  oldFiles: ProjectFile[] = [],
  newFiles: ProjectFile[] = []
): CommitStats {
  let additions = 0;
  let deletions = 0;
  let filesChanged = 0;

  const oldMap = new Map<string, string>();
  for (const f of oldFiles) {
    oldMap.set(f.name, f.content || '');
  }

  const seenNames = new Set<string>();

  for (const nf of newFiles) {
    seenNames.add(nf.name);
    const oldContent = oldMap.get(nf.name);
    if (oldContent === undefined) {
      // Newly added file
      const lines = nf.content ? nf.content.split('\n').length : 0;
      additions += lines;
      filesChanged++;
    } else if (oldContent !== nf.content) {
      // Modified file
      const diff = computeLineDiff(oldContent, nf.content);
      additions += diff.additions;
      deletions += diff.deletions;
      filesChanged++;
    }
  }

  for (const [name, oldContent] of oldMap.entries()) {
    if (!seenNames.has(name)) {
      // Deleted file
      const lines = oldContent.split('\n').length;
      deletions += lines;
      filesChanged++;
    }
  }

  return { additions, deletions, filesChanged };
}

/**
 * Creates an intentional Git-grade commit with commit message, description,
 * author, calculated line change statistics, and short SHA.
 */
export function createCommit(
  projectId: string,
  message: string,
  author: string,
  files: ProjectFile[],
  description = '',
  branch?: string,
  authorEmail = ''
): Checkpoint {
  const current = loadProjectCheckpoints(projectId);
  const headCommit = current[0] || null;
  const resolvedBranch = branch || getActiveBranch(projectId) || 'main';

  const now = new Date();
  const sha = generateShortSha(`${projectId}-${message}-${now.getTime()}`);
  const stats = computeCommitStats(headCommit ? headCommit.files : [], files);

  const newCommit: Checkpoint = {
    id: `commit-${sha}`,
    shortSha: sha,
    projectId,
    name: message,
    message,
    description,
    timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    author: author || 'Author',
    authorEmail,
    files: JSON.parse(JSON.stringify(files)),
    stats,
    parentId: headCommit ? headCommit.id : null,
    branch: resolvedBranch,
    isSyncedToCloud: false,
    isAutoSave: false,
    createdAt: now.toISOString(),
  };

  const updated = [newCommit, ...current.filter(c => c.id !== newCommit.id)];

  // Prune excess if over limit
  if (updated.length > MAX_CHECKPOINTS_PER_PROJECT) {
    updated.length = MAX_CHECKPOINTS_PER_PROJECT;
  }

  saveProjectCheckpoints(projectId, updated);

  // Background push to Supabase Cloud if connected
  if (isSupabaseConnected()) {
    pushCheckpointToCloud(projectId, newCommit).then(res => {
      if (res.success) {
        newCommit.isSyncedToCloud = true;
        saveProjectCheckpoints(projectId, updated);
      }
    }).catch(err => {
      console.warn('Background commit cloud push error:', err);
    });
  }

  return newCommit;
}

/**
 * Backward-compatible wrapper for createCheckpoint.
 */
export function createCheckpoint(
  projectId: string,
  name: string,
  author: string,
  files: ProjectFile[],
  isAutoSave = false
): Checkpoint {
  if (!isAutoSave) {
    return createCommit(projectId, name, author, files);
  }

  const now = new Date();
  const sha = generateShortSha(`auto-${projectId}-${now.getTime()}`);
  const newCp: Checkpoint = {
    id: `cp-${now.getTime()}-${sha}`,
    shortSha: sha,
    projectId,
    name,
    message: name,
    timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    author: author || 'Author',
    files: JSON.parse(JSON.stringify(files)),
    isAutoSave: true,
    createdAt: now.toISOString(),
    isSyncedToCloud: false,
  };

  const current = loadProjectCheckpoints(projectId);
  const updated = [newCp, ...current];
  saveProjectCheckpoints(projectId, updated);
  return newCp;
}

/**
 * Computes the real-time working tree status (uncommitted changes compared to latest HEAD commit).
 */
export function getWorkingTreeStatus(
  currentFiles: ProjectFile[],
  headCommit: Checkpoint | null
): WorkingTreeStatus {
  if (!headCommit) {
    const totalAdditions = currentFiles.reduce((acc, f) => acc + (f.content?.split('\n').length || 0), 0);
    return {
      isClean: false,
      files: currentFiles.map(f => ({
        fileId: f.id,
        fileName: f.name,
        status: 'added',
        additions: f.content ? f.content.split('\n').length : 0,
        deletions: 0,
      })),
      totalAdditions,
      totalDeletions: 0,
    };
  }

  const headMap = new Map<string, string>();
  for (const f of headCommit.files) {
    headMap.set(f.name, f.content || '');
  }

  const filesStatus: WorkingTreeFileStatus[] = [];
  const seenNames = new Set<string>();
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const cf of currentFiles) {
    seenNames.add(cf.name);
    const headContent = headMap.get(cf.name);
    if (headContent === undefined) {
      const adds = cf.content ? cf.content.split('\n').length : 0;
      filesStatus.push({
        fileId: cf.id,
        fileName: cf.name,
        status: 'added',
        additions: adds,
        deletions: 0,
      });
      totalAdditions += adds;
    } else if (headContent !== cf.content) {
      const diff = computeLineDiff(headContent, cf.content);
      filesStatus.push({
        fileId: cf.id,
        fileName: cf.name,
        status: 'modified',
        additions: diff.additions,
        deletions: diff.deletions,
      });
      totalAdditions += diff.additions;
      totalDeletions += diff.deletions;
    }
  }

  for (const [name, headContent] of headMap.entries()) {
    if (!seenNames.has(name)) {
      const dels = headContent.split('\n').length;
      filesStatus.push({
        fileId: `del-${name}`,
        fileName: name,
        status: 'deleted',
        additions: 0,
        deletions: dels,
      });
      totalDeletions += dels;
    }
  }

  return {
    isClean: filesStatus.length === 0,
    files: filesStatus,
    totalAdditions,
    totalDeletions,
  };
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
      name: checkpoint.name || checkpoint.message,
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
 * Push all un-synced local commits to Supabase Cloud.
 */
export async function pushCommitsToCloud(
  projectId: string
): Promise<{ success: boolean; pushedCount: number; error?: string }> {
  const local = loadProjectCheckpoints(projectId);
  const unsynced = local.filter(c => !c.isSyncedToCloud);

  if (unsynced.length === 0) {
    return { success: true, pushedCount: 0 };
  }

  let pushed = 0;
  for (const cp of unsynced) {
    const res = await pushCheckpointToCloud(projectId, cp);
    if (res.success) {
      cp.isSyncedToCloud = true;
      pushed++;
    }
  }

  saveProjectCheckpoints(projectId, local);
  return { success: true, pushedCount: pushed };
}

/**
 * Fetch remote checkpoints from Supabase and merge with local commits.
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

    const cloudCheckpoints: Checkpoint[] = data.map((r: any) => {
      const id = r.id;
      const shortSha = id.replace(/^(commit-|cp-)/, '').slice(0, 7) || generateShortSha(id);
      return {
        id,
        shortSha,
        projectId: r.project_id || projectId,
        name: r.name,
        message: r.name,
        description: r.description || '',
        timestamp: r.timestamp,
        author: r.author,
        files: Array.isArray(r.files) ? r.files : [],
        isSyncedToCloud: true,
        isAutoSave: r.name?.toLowerCase().startsWith('auto-save'),
        createdAt: r.created_at,
      };
    });

    // Merge cloud and local checkpoints without duplicates
    const local = loadProjectCheckpoints(projectId);
    const map = new Map<string, Checkpoint>();

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
 * Calculates synchronization status (how many commits ahead or behind remote cloud).
 */
export function getSyncStatus(projectId: string): SyncStatus {
  const local = loadProjectCheckpoints(projectId);
  const ahead = local.filter(c => !c.isSyncedToCloud && !c.isAutoSave).length;
  return {
    ahead,
    behind: 0,
    isUpToDate: ahead === 0,
  };
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
