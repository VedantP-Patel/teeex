/**
 * Teeex — Autosave & Crash Recovery Engine.
 * Dual-write architecture:
 *  1. Periodic asynchronous persistence to IndexedDB project storage.
 *  2. Synchronous emergency mirror to localStorage draft key on every change
 *     and on beforeunload / visibilitychange.
 * Detects crashes and uncommitted drafts on startup, offering an authoritative
 * 1-click restore banner.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, ProjectFile } from '../types/latex';
import { saveProjectOffline } from '../services/offlineStorageService';
import { updateProject } from '../services/projectsService';

export interface RecoveredDraftInfo {
  timestamp: number;
  fileCount: number;
  files: ProjectFile[];
  folders?: string[];
  title?: string;
}

export interface UseAutosaveRecoveryOptions {
  activeProject: Project;
  files: ProjectFile[];
  folders: string[];
  projectTitle: string;
  onApplyRecoveredDraft?: (draft: RecoveredDraftInfo) => void;
  debounceMs?: number;
}

export interface AutosaveRecoveryResult {
  isDirty: boolean;
  lastSaved: Date | null;
  hasRecoverableCrash: boolean;
  recoveredDraftInfo: RecoveredDraftInfo | null;
  restoreRecoveredDraft: () => void;
  discardRecoveredDraft: () => void;
  saveNow: () => Promise<void>;
  markDirty: (immediateFiles?: ProjectFile[]) => void;
}

export const EMERGENCY_DRAFT_PREFIX = 'teeex_emergency_draft_';

export function getEmergencyDraftKey(projectId: string): string {
  return `${EMERGENCY_DRAFT_PREFIX}${projectId}`;
}

export function readEmergencyDraft(projectId: string): RecoveredDraftInfo | null {
  try {
    const raw = localStorage.getItem(getEmergencyDraftKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.files) && typeof parsed.timestamp === 'number') {
      return parsed as RecoveredDraftInfo;
    }
  } catch (e) {
    console.warn('[AutosaveRecovery] Failed reading emergency draft:', e);
  }
  return null;
}

export function clearEmergencyDraft(projectId: string): void {
  try {
    localStorage.removeItem(getEmergencyDraftKey(projectId));
  } catch (e) {
    console.warn('[AutosaveRecovery] Failed clearing emergency draft:', e);
  }
}

export function writeEmergencyDraft(
  projectId: string,
  files: ProjectFile[],
  folders: string[],
  title: string
): void {
  try {
    const draft: RecoveredDraftInfo = {
      timestamp: Date.now(),
      fileCount: files.length,
      files,
      folders,
      title,
    };
    localStorage.setItem(getEmergencyDraftKey(projectId), JSON.stringify(draft));
  } catch (e) {
    console.warn('[AutosaveRecovery] Failed writing emergency draft:', e);
  }
}

export function useAutosaveRecovery({
  activeProject,
  files,
  folders,
  projectTitle,
  onApplyRecoveredDraft,
  debounceMs = 1500,
}: UseAutosaveRecoveryOptions): AutosaveRecoveryResult {
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(() => {
    if (activeProject?.updatedAt) {
      const d = new Date(activeProject.updatedAt);
      if (Number.isFinite(d.getTime())) return d;
    }
    return new Date();
  });
  const [hasRecoverableCrash, setHasRecoverableCrash] = useState(false);
  const [recoveredDraftInfo, setRecoveredDraftInfo] = useState<RecoveredDraftInfo | null>(null);

  const activeProjectId = activeProject?.id || 'default';
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest references for synchronous unload flushing
  const stateRef = useRef({
    projectId: activeProjectId,
    files,
    folders,
    projectTitle,
    isDirty,
  });

  useEffect(() => {
    stateRef.current = {
      projectId: activeProjectId,
      files,
      folders,
      projectTitle,
      isDirty,
    };
  }, [activeProjectId, files, folders, projectTitle, isDirty]);

  // Check for crash recovery draft when active project changes or mounts
  useEffect(() => {
    if (!activeProjectId) return;
    const draft = readEmergencyDraft(activeProjectId);
    if (draft) {
      const rawTime = activeProject?.updatedAt ? new Date(activeProject.updatedAt).getTime() : 0;
      const projUpdatedAt = Number.isFinite(rawTime) ? rawTime : 0;
      // If emergency draft is newer by at least 1.5 seconds, present recovery banner
      if (draft.timestamp > projUpdatedAt + 1500) {
        setHasRecoverableCrash(true);
        setRecoveredDraftInfo(draft);
      } else {
        // Obsolete draft from previously cleanly saved session
        clearEmergencyDraft(activeProjectId);
      }
    } else {
      setHasRecoverableCrash(false);
      setRecoveredDraftInfo(null);
    }
  }, [activeProjectId, activeProject?.updatedAt]);

  const saveNow = useCallback(async () => {
    const current = stateRef.current;
    if (!current.projectId) return;

    try {
      // 1. IndexedDB persistence
      await saveProjectOffline({
        ...activeProject,
        files: current.files,
        folders: current.folders,
        title: current.projectTitle,
        updatedAt: new Date().toISOString(),
      });

      // 2. In-memory project service update
      updateProject(current.projectId, {
        files: current.files,
        folders: current.folders,
        title: current.projectTitle,
      });

      // 3. Mark clean and clear emergency draft
      setIsDirty(false);
      setLastSaved(new Date());
      clearEmergencyDraft(current.projectId);
    } catch (err) {
      console.error('[AutosaveRecovery] Periodic save failed:', err);
    }
  }, [activeProject]);

  const markDirty = useCallback((immediateFiles?: ProjectFile[]) => {
    setIsDirty(true);
    const current = stateRef.current;
    const targetFiles = immediateFiles || current.files;
    stateRef.current = {
      ...current,
      files: targetFiles,
      isDirty: true,
    };
    writeEmergencyDraft(current.projectId, targetFiles, current.folders, current.projectTitle);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveNow();
    }, debounceMs);
  }, [debounceMs, saveNow]);

  // Listen to beforeunload and visibilitychange to synchronously write emergency draft
  useEffect(() => {
    const handleUnloadOrHide = () => {
      const current = stateRef.current;
      if (current.isDirty && current.projectId) {
        writeEmergencyDraft(current.projectId, current.files, current.folders, current.projectTitle);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleUnloadOrHide();
      }
    };

    window.addEventListener('beforeunload', handleUnloadOrHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleUnloadOrHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const restoreRecoveredDraft = useCallback(() => {
    if (!recoveredDraftInfo) return;
    if (onApplyRecoveredDraft) {
      onApplyRecoveredDraft(recoveredDraftInfo);
    }
    setHasRecoverableCrash(false);
    setRecoveredDraftInfo(null);
    clearEmergencyDraft(activeProjectId);
  }, [recoveredDraftInfo, onApplyRecoveredDraft, activeProjectId]);

  const discardRecoveredDraft = useCallback(() => {
    setHasRecoverableCrash(false);
    setRecoveredDraftInfo(null);
    clearEmergencyDraft(activeProjectId);
  }, [activeProjectId]);

  return {
    isDirty,
    lastSaved,
    hasRecoverableCrash,
    recoveredDraftInfo,
    restoreRecoveredDraft,
    discardRecoveredDraft,
    saveNow,
    markDirty,
  };
}
