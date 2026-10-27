import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Checkpoint } from '../services/checkpointsService';
import {
  loadProjectCheckpoints,
  createCheckpoint,
  createCommit,
  deleteCheckpoint,
  fetchProjectCheckpointsFromCloud,
  pushCommitsToCloud,
  getWorkingTreeStatus,
  getActiveBranch,
  setActiveBranch,
  getProjectBranches,
  createBranch,
  deleteBranch,
  hydrateCheckpointsFromOffline,
  createAutoSaveCheckpointIfNeeded,
} from '../services/checkpointsService';
import { isSupabaseConnected } from '../services/supabaseClient';
import { projectStore, useProjectStore } from '../stores/projectStore';
import type { UserProfile, ProjectFile } from '../types/latex';

interface UseProjectCheckpointsOptions {
  activeProjectId: string;
  currentUser: UserProfile | null;
  authorName: string;
  onToast?: (message: string) => void;
  setFiles?: (files: ProjectFile[] | ((prev: ProjectFile[]) => ProjectFile[])) => void;
}

export function useProjectCheckpoints({
  activeProjectId,
  currentUser,
  authorName,
  onToast,
  setFiles,
}: UseProjectCheckpointsOptions) {
  // Listen to files only for working tree diff calculation
  const files = useProjectStore(s => s.files);

  // Checkpoints list
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(() => {
    return loadProjectCheckpoints(activeProjectId, undefined, currentUser?.fullName || authorName || 'You');
  });

  // Load checkpoints on project switch or user profile change — strictly decoupled from keystroke updates
  useEffect(() => {
    const localCps = loadProjectCheckpoints(activeProjectId, undefined, currentUser?.fullName || authorName || 'You');
    setCheckpoints(localCps);

    hydrateCheckpointsFromOffline(activeProjectId)
      .then(offlineCps => {
        if (offlineCps && offlineCps.length > localCps.length) {
          setCheckpoints(offlineCps);
        }
      })
      .catch(() => {});

    if (isSupabaseConnected()) {
      fetchProjectCheckpointsFromCloud(activeProjectId)
        .then(res => {
          if (res.success && res.checkpoints && res.checkpoints.length > 0) {
            setCheckpoints(res.checkpoints);
          }
        })
        .catch(() => {});
    }
  }, [activeProjectId, currentUser?.fullName, authorName]);

  // Periodic Autosave Checkpoints (every 5 minutes during active session) — reads latest files on-demand
  useEffect(() => {
    const interval = setInterval(() => {
      if (!activeProjectId) return;
      const currentFiles = projectStore.getState().files;
      if (!currentFiles || currentFiles.length === 0) return;
      const newCp = createAutoSaveCheckpointIfNeeded(
        activeProjectId,
        currentFiles,
        currentUser?.fullName || authorName || 'You'
      );
      if (newCp) {
        setCheckpoints(prev => [newCp, ...prev.filter(c => c.id !== newCp.id)]);
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [activeProjectId, currentUser?.fullName, authorName]);

  // Working tree status for git staging/diff
  const workingTreeStatus = useMemo(() => {
    const head = checkpoints[0] || null;
    return getWorkingTreeStatus(files, head);
  }, [files, checkpoints]);

  // Git branches
  const [activeBranch, setActiveBranchState] = useState<string>(() => {
    return getActiveBranch(activeProjectId) || 'main';
  });
  const [projectBranches, setProjectBranches] = useState<string[]>(() => {
    return getProjectBranches(activeProjectId);
  });

  useEffect(() => {
    queueMicrotask(() => {
      setActiveBranchState(getActiveBranch(activeProjectId));
      setProjectBranches(getProjectBranches(activeProjectId));
    });
  }, [activeProjectId]);

  const handleSwitchBranch = useCallback((branchName: string, checkoutHead = false) => {
    setActiveBranch(activeProjectId, branchName);
    setActiveBranchState(branchName);
    if (onToast) onToast(`Switched to branch "${branchName}"`);

    if (checkoutHead && setFiles) {
      const cps = loadProjectCheckpoints(activeProjectId);
      const branchHead = cps.find(c => (c.branch || 'main') === branchName) || cps[0];
      if (branchHead && branchHead.files.length > 0) {
        setFiles(branchHead.files);
        if (onToast) onToast(`Checked out branch "${branchName}" (${branchHead.shortSha})`);
      }
    }
  }, [activeProjectId, onToast, setFiles]);

  const handleCreateBranch = useCallback((branchName: string) => {
    const res = createBranch(activeProjectId, branchName);
    if (res.success) {
      const updated = getProjectBranches(activeProjectId);
      setProjectBranches(updated);
      setActiveBranchState(branchName.trim().replace(/\s+/g, '-').toLowerCase());
      if (onToast) onToast(`Created and switched to branch "${branchName}"`);
    } else {
      if (onToast) onToast(`Failed to create branch: ${res.error || 'Error'}`);
    }
  }, [activeProjectId, onToast]);

  const handleDeleteBranch = useCallback((branchName: string) => {
    const res = deleteBranch(activeProjectId, branchName);
    if (res.success) {
      setProjectBranches(getProjectBranches(activeProjectId));
      if (onToast) onToast(`Deleted branch "${branchName}"`);
    } else {
      if (onToast) onToast(`Failed to delete branch: ${res.error || 'Error'}`);
    }
  }, [activeProjectId, onToast]);

  const handleCreateCommit = useCallback((message: string, description?: string) => {
    const currentBranch = getActiveBranch(activeProjectId) || 'main';
    const currentFiles = projectStore.getState().files;
    const newCommit = createCommit(
      activeProjectId,
      message,
      currentUser?.fullName || authorName || 'You',
      currentFiles,
      description,
      currentBranch,
      currentUser?.email || ''
    );
    setCheckpoints(prev => [newCommit, ...prev.filter(c => c.id !== newCommit.id)]);
    if (onToast) onToast(`Committed: ${message} (${newCommit.shortSha})`);
  }, [activeProjectId, currentUser?.fullName, currentUser?.email, authorName, onToast]);

  const handlePushCommits = useCallback(async () => {
    if (!isSupabaseConnected()) {
      if (onToast) onToast('Supabase Cloud is not connected — commits saved locally');
      return;
    }
    try {
      const res = await pushCommitsToCloud(activeProjectId);
      if (res.success) {
        setCheckpoints(loadProjectCheckpoints(activeProjectId));
        if (onToast) onToast(`Pushed ${res.pushedCount} commit${res.pushedCount === 1 ? '' : 's'} to Cloud`);
      } else {
        if (onToast) onToast(`Push failed: ${res.error || 'Network error'}`);
      }
    } catch (err: any) {
      if (onToast) onToast(`Push failed: ${err?.message || 'Error'}`);
    }
  }, [activeProjectId, onToast]);

  const handlePullCommits = useCallback(async () => {
    if (!isSupabaseConnected()) {
      if (onToast) onToast('Supabase Cloud is not connected');
      return;
    }
    try {
      const res = await fetchProjectCheckpointsFromCloud(activeProjectId);
      if (res.success && res.checkpoints) {
        setCheckpoints(res.checkpoints);
        if (onToast) onToast(`Pulled ${res.checkpoints.length} versions from Cloud`);
      } else {
        if (onToast) onToast(`Pull failed: ${res.error || 'Network error'}`);
      }
    } catch (err: any) {
      if (onToast) onToast(`Pull failed: ${err?.message || 'Error'}`);
    }
  }, [activeProjectId, onToast]);

  const handleCreateCheckpoint = useCallback((name: string) => {
    const currentFiles = projectStore.getState().files;
    const newCp = createCheckpoint(
      activeProjectId,
      name,
      currentUser?.fullName || authorName || 'You',
      currentFiles,
      false
    );
    setCheckpoints(prev => [newCp, ...prev.filter(c => c.id !== newCp.id)]);
    if (onToast) onToast(`Snapshot "${name}" saved to history`);
  }, [activeProjectId, currentUser?.fullName, authorName, onToast]);

  const handleDeleteCheckpoint = useCallback((cpId: string) => {
    deleteCheckpoint(activeProjectId, cpId)
      .then(updated => {
        setCheckpoints(updated);
        if (onToast) onToast('Checkpoint deleted');
      })
      .catch(() => {});
  }, [activeProjectId, onToast]);

  const handleSyncCheckpointsCloud = useCallback(() => {
    if (!isSupabaseConnected()) {
      if (onToast) onToast('Supabase is not connected');
      return;
    }
    fetchProjectCheckpointsFromCloud(activeProjectId)
      .then(res => {
        if (res.success && res.checkpoints) {
          setCheckpoints(res.checkpoints);
          if (onToast) onToast(`Checkpoints synchronized (${res.checkpoints.length} versions)`);
        } else {
          if (onToast) onToast('Cloud sync completed');
        }
      })
      .catch(err => {
        if (onToast) onToast('Cloud sync error: ' + (err?.message || 'Unknown'));
      });
  }, [activeProjectId, onToast]);

  return {
    checkpoints,
    setCheckpoints,
    activeBranch,
    projectBranches,
    workingTreeStatus,
    handleSwitchBranch,
    handleCreateBranch,
    handleDeleteBranch,
    handleCreateCommit,
    handlePushCommits,
    handlePullCommits,
    handleCreateCheckpoint,
    handleDeleteCheckpoint,
    handleSyncCheckpointsCloud,
  };
}
