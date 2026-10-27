import { useEffect, useMemo, useCallback, useRef } from 'react';
import type { UserProfile, Template, ProjectRole, ProjectMember } from '../types/latex';
import {
  projectStore,
  useProjectStore,
  setProjectState,
  setProjects,
  setFiles,
  setFolders,
  setProjectTitle,
} from '../stores/projectStore';
import {
  loadProjects,
  getActiveProjectId,
  createProject,
  duplicateProject,
  toggleArchiveProject,
  deleteProject,
  updateProject,
  syncProjectsWithCloudBiDirectional,
  hydrateProjectFromOffline,
} from '../services/projectsService';
import { saveProjectOffline } from '../services/offlineStorageService';
import { STARTER_TEMPLATES } from '../services/templates';
import { useAutosaveRecovery } from './useAutosaveRecovery';

interface UseProjectLifecycleOptions {
  currentUser: UserProfile | null;
  onToast: (message: string) => void;
  triggerCompile: () => void;
  providerRef?: React.MutableRefObject<any>;
}

export function useProjectLifecycle({
  currentUser,
  onToast,
  triggerCompile,
  providerRef,
}: UseProjectLifecycleOptions) {
  const projects = useProjectStore(s => s.projects);
  const activeProjectId = useProjectStore(s => s.activeProjectId);
  const files = useProjectStore(s => s.files);
  const folders = useProjectStore(s => s.folders);
  const projectTitle = useProjectStore(s => s.projectTitle);

  // Initialize projects and active project on initial load
  const isInitializedRef = useRef(false);
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initialProjects = loadProjects(currentUser?.email, currentUser?.fullName);
    const initialActiveId = getActiveProjectId(initialProjects);
    const active = initialProjects.find(p => p.id === initialActiveId) || initialProjects[0];

    const initialFiles = active?.files || STARTER_TEMPLATES[0].files;
    const initialFolders = active?.folders || ['sections', 'figures'];
    const firstFileId = initialFiles[0]?.id || 'main.tex';

    setProjectState({
      projects: initialProjects,
      activeProjectId: initialActiveId,
      files: initialFiles,
      folders: initialFolders,
      activeFileId: firstFileId,
      openFileIds: [firstFileId],
      projectTitle: active?.title || 'Untitled Project',
    });

    if (active?.files.some(f => (f as any)._persistedInIdb)) {
      hydrateProjectFromOffline(initialActiveId).then(offlineProj => {
        if (offlineProj && Array.isArray(offlineProj.files) && offlineProj.files.length > 0) {
          setProjectState({
            files: offlineProj.files,
            folders: offlineProj.folders || ['sections', 'figures'],
          });
        }
      }).catch(() => {});
    }
  }, [currentUser]);

  const activeProject = useMemo(() => {
    return projects.find(p => p.id === activeProjectId) || projects[0];
  }, [projects, activeProjectId]);

  // Synchronous flush of current project state
  const flushCurrentProjectSave = useCallback(() => {
    const s = projectStore.getState();
    const pid = s.activeProjectId;
    if (!pid) return;

    const updatedProjects = updateProject(pid, {
      files: s.files,
      folders: s.folders,
      title: s.projectTitle,
    });
    setProjects(updatedProjects);

    const currProj = s.projects.find(p => p.id === pid) || updatedProjects.find(p => p.id === pid);
    if (currProj) {
      saveProjectOffline({
        ...currProj,
        files: s.files,
        folders: s.folders,
        title: s.projectTitle,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }, []);

  // Flush on beforeunload and visibility change
  useEffect(() => {
    const handleBeforeUnload = () => flushCurrentProjectSave();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushCurrentProjectSave();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushCurrentProjectSave]);

  // Debounced auto-save during typing
  useEffect(() => {
    const timer = setTimeout(() => {
      flushCurrentProjectSave();
    }, 800);
    return () => clearTimeout(timer);
  }, [files, folders, projectTitle, activeProjectId, flushCurrentProjectSave]);

  // Autosave crash recovery
  const {
    hasRecoverableCrash,
    recoveredDraftInfo,
    restoreRecoveredDraft,
    discardRecoveredDraft,
    markDirty,
  } = useAutosaveRecovery({
    activeProject,
    files,
    folders,
    projectTitle,
    onApplyRecoveredDraft: (draft) => {
      if (draft.files) setFiles(draft.files);
      if (draft.folders) setFolders(draft.folders);
      if (draft.title) setProjectTitle(draft.title);
      if (providerRef?.current && draft.files) {
        draft.files.forEach(f => {
          const yText = providerRef.current.getText(f.id);
          if (yText.toString() !== f.content) {
            providerRef.current.getDoc().transact(() => {
              yText.delete(0, yText.length);
              yText.insert(0, f.content);
            }, 'local-editor');
          }
        });
      }
      onToast('Restored uncommitted session from crash recovery.');
    },
  });

  // Bi-directional cloud sync on mount
  useEffect(() => {
    let isMounted = true;
    if (currentUser?.email) {
      syncProjectsWithCloudBiDirectional(currentUser.email, currentUser.fullName)
        .then(res => {
          if (!isMounted) return;
          if (res.success && res.projects && res.projects.length > 0) {
            setProjects(res.projects);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Project switching & CRUD
  const handleSelectProject = useCallback((projId: string) => {
    if (projId === projectStore.getState().activeProjectId) return;
    flushCurrentProjectSave();

    const currProjects = projectStore.getState().projects;
    const proj = currProjects.find(p => p.id === projId) || loadProjects().find(p => p.id === projId);
    if (!proj) return;

    const firstId = proj.files[0]?.id || 'main.tex';
    setProjectState({
      activeProjectId: projId,
      files: proj.files,
      folders: proj.folders || ['sections', 'figures'],
      activeFileId: firstId,
      openFileIds: [firstId],
      projectTitle: proj.title,
    });

    if (proj.files.some(f => (f as any)._persistedInIdb)) {
      hydrateProjectFromOffline(projId).then(offlineProj => {
        if (offlineProj && Array.isArray(offlineProj.files) && offlineProj.files.length > 0) {
          setProjectState({
            files: offlineProj.files,
            folders: offlineProj.folders || ['sections', 'figures'],
          });
          setTimeout(() => triggerCompile(), 60);
        }
      }).catch(() => {});
    } else {
      setTimeout(() => triggerCompile(), 60);
    }
  }, [flushCurrentProjectSave, triggerCompile]);

  const handleCreateProject = useCallback((title: string, templateId?: string) => {
    flushCurrentProjectSave();

    const newProj = createProject(
      title,
      currentUser?.email || 'you@teeex.local',
      currentUser?.fullName || 'You',
      templateId
    );
    const updated = loadProjects(currentUser?.email, currentUser?.fullName);
    setProjects(updated);
    const proj = updated.find(p => p.id === newProj.id);
    if (proj) {
      const firstId = proj.files[0]?.id || 'main.tex';
      setProjectState({
        activeProjectId: proj.id,
        files: proj.files,
        folders: proj.folders || ['sections', 'figures'],
        activeFileId: firstId,
        openFileIds: [firstId],
        projectTitle: proj.title,
      });
      setTimeout(() => triggerCompile(), 60);
      onToast(`Created and opened project "${title}"`);
    }
  }, [currentUser, flushCurrentProjectSave, triggerCompile, onToast]);

  const handleDuplicateProject = useCallback((projId: string) => {
    flushCurrentProjectSave();

    const cloned = duplicateProject(projId);
    if (cloned) {
      const updated = loadProjects(currentUser?.email, currentUser?.fullName);
      setProjects(updated);
      const firstId = cloned.files[0]?.id || 'main.tex';
      setProjectState({
        activeProjectId: cloned.id,
        files: cloned.files,
        folders: cloned.folders || ['sections', 'figures'],
        activeFileId: firstId,
        openFileIds: [firstId],
        projectTitle: cloned.title,
      });
      setTimeout(() => triggerCompile(), 60);
      onToast(`Duplicated project "${cloned.title}"`);
    }
  }, [currentUser, flushCurrentProjectSave, triggerCompile, onToast]);

  const handleToggleArchiveProject = useCallback((projId: string) => {
    const updated = toggleArchiveProject(projId);
    setProjects(updated);
  }, []);

  const handleDeleteProject = useCallback((projId: string) => {
    const s = projectStore.getState();
    const updated = deleteProject(projId);
    setProjects(updated);
    if (s.activeProjectId === projId && updated.length > 0) {
      const next = updated[0];
      const firstId = next.files[0]?.id || 'main.tex';
      setProjectState({
        activeProjectId: next.id,
        files: next.files,
        folders: next.folders || ['sections', 'figures'],
        activeFileId: firstId,
        openFileIds: [firstId],
        projectTitle: next.title,
      });
      setTimeout(() => triggerCompile(), 60);
    }
    onToast('Project deleted.');
  }, [triggerCompile, onToast]);

  const handleSelectTemplate = useCallback((template: Template) => {
    const firstId = template.files[0]?.id || 'main.tex';
    setProjectState({
      files: template.files,
      activeFileId: firstId,
      openFileIds: [firstId],
      projectTitle: template.name,
    });
    setTimeout(() => triggerCompile(), 50);
  }, [triggerCompile]);

  // Project members
  const handleInviteMember = useCallback((email: string, role: ProjectRole) => {
    const s = projectStore.getState();
    const currProj = s.projects.find(p => p.id === s.activeProjectId);
    const newMember: ProjectMember = {
      id: `usr-${Date.now().toString(36)}`,
      email,
      name: email.split('@')[0].replace(/[._]/g, ' '),
      avatar: email.substring(0, 2).toUpperCase(),
      avatarColor: role === 'owner' ? '#38bdf8' : role === 'editor' ? '#10b981' : '#f59e0b',
      role,
      joinedAt: new Date().toISOString().split('T')[0],
    };
    const members = [...(currProj?.members || []), newMember];
    const updated = updateProject(s.activeProjectId, { members });
    setProjects(updated);
  }, []);

  const handleUpdateMemberRole = useCallback((memberId: string, newRole: ProjectRole) => {
    const s = projectStore.getState();
    const currProj = s.projects.find(p => p.id === s.activeProjectId);
    const members = (currProj?.members || []).map(m =>
      m.id === memberId ? { ...m, role: newRole } : m
    );
    const updated = updateProject(s.activeProjectId, { members });
    setProjects(updated);
  }, []);

  const handleRemoveMember = useCallback((memberId: string) => {
    const s = projectStore.getState();
    const currProj = s.projects.find(p => p.id === s.activeProjectId);
    const members = (currProj?.members || []).filter(m => m.id !== memberId);
    const updated = updateProject(s.activeProjectId, { members });
    setProjects(updated);
  }, []);

  return {
    projects,
    activeProjectId,
    activeProject,
    flushCurrentProjectSave,
    hasRecoverableCrash,
    recoveredDraftInfo,
    restoreRecoveredDraft,
    discardRecoveredDraft,
    markDirty,
    handleSelectProject,
    handleCreateProject,
    handleDuplicateProject,
    handleToggleArchiveProject,
    handleDeleteProject,
    handleSelectTemplate,
    handleInviteMember,
    handleUpdateMemberRole,
    handleRemoveMember,
    setProjects,
  };
}
