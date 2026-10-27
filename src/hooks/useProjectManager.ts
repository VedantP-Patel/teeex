import { useEffect, useMemo, useCallback, useRef } from 'react';
import type { ProjectFile, UserProfile, Template, SuggestedFix, ProjectRole, ProjectMember } from '../types/latex';
import type { Checkpoint } from '../services/checkpointsService';
import { createCheckpoint } from '../services/checkpointsService';
import {
  projectStore,
  useProjectStore,
  setProjectState,
  setProjects,
  setFiles,
  setFolders,
  setActiveFileId,
  setOpenFileIds,
  setProjectTitle,
  setPaperFormat,
  setIsTwoColumn,
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
} from '../services/projectsService';
import { saveProjectOffline } from '../services/offlineStorageService';
import { STARTER_TEMPLATES } from '../services/templates';
import { applyDocumentClass, formatResolutionNotice, setTwoColumn, type PaperFormatId } from '../services/paperFormats';
import { formatLatexCode } from '../services/latexFormatter';
import { encryptText, decryptText } from '../services/encryptionService';
import { logAuditAction } from '../services/auditService';
import { useAutosaveRecovery } from './useAutosaveRecovery';

interface UseProjectManagerOptions {
  currentUser: UserProfile | null;
  onToast: (message: string) => void;
  triggerCompile: () => void;
  providerRef?: React.MutableRefObject<any>;
}

export function useProjectManager({
  currentUser,
  onToast,
  triggerCompile,
  providerRef,
}: UseProjectManagerOptions) {
  // Read state from reactive projectStore
  const projects = useProjectStore(s => s.projects);
  const activeProjectId = useProjectStore(s => s.activeProjectId);
  const files = useProjectStore(s => s.files);
  const folders = useProjectStore(s => s.folders);
  const activeFileId = useProjectStore(s => s.activeFileId);
  const openFileIds = useProjectStore(s => s.openFileIds);
  const projectTitle = useProjectStore(s => s.projectTitle);
  const paperFormat = useProjectStore(s => s.paperFormat);
  const isTwoColumn = useProjectStore(s => s.isTwoColumn);

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
  }, [currentUser]);

  const activeProject = useMemo(() => {
    return projects.find(p => p.id === activeProjectId) || projects[0];
  }, [projects, activeProjectId]);

  const activeFile = useMemo(() => {
    return files.find(f => f.id === activeFileId) || files[0] || STARTER_TEMPLATES[0].files[0];
  }, [files, activeFileId]);

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

  // Autosave recovery
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

  // Project switching
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

    setTimeout(() => triggerCompile(), 60);
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

  // Tab & File selection
  const handleSelectFile = useCallback((fileId: string) => {
    setActiveFileId(fileId);
  }, []);

  const handleCloseTab = useCallback((fileId: string) => {
    const s = projectStore.getState();
    const nextOpen = s.openFileIds.filter(id => id !== fileId);
    if (nextOpen.length === 0) {
      const fallback = s.files[0]?.id || fileId;
      setProjectState({
        activeFileId: fallback,
        openFileIds: [fallback],
      });
      return;
    }
    if (s.activeFileId === fileId) {
      const idx = s.openFileIds.indexOf(fileId);
      const nextActive = nextOpen[Math.max(0, idx - 1)] || nextOpen[0];
      setProjectState({
        activeFileId: nextActive,
        openFileIds: nextOpen,
      });
    } else {
      setOpenFileIds(nextOpen);
    }
  }, []);

  const handleCreateFile = useCallback((name: string, type: 'tex' | 'bib', targetFolder?: string) => {
    let fullName = name.trim();
    let folder = targetFolder;

    if (targetFolder && !fullName.startsWith(targetFolder + '/')) {
      fullName = `${targetFolder}/${fullName}`;
    } else if (fullName.includes('/')) {
      const parts = fullName.split('/');
      folder = parts.slice(0, -1).join('/');
    }

    const newFile: ProjectFile = {
      id: fullName,
      name: fullName,
      type,
      folder,
      content: type === 'bib' ? `% Bibliography File\n` : `\\section{New Section}\nContent goes here...\n`,
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(fullName);
  }, []);

  const handleCreateFolder = useCallback((folderName: string) => {
    const clean = folderName.trim().replace(/^\/+|\/+$/g, '');
    if (!clean) return;
    setFolders(prev => (prev.includes(clean) ? prev : [...prev, clean]));
  }, []);

  const handleDeleteFolder = useCallback((folderName: string) => {
    setFolders(prev => prev.filter(f => f !== folderName));
    setFiles(prev => {
      const updatedFiles = prev.filter(f => {
        const fFolder = f.folder || (f.name.includes('/') ? f.name.split('/')[0] : null);
        return fFolder !== folderName;
      });
      const s = projectStore.getState();
      if (!updatedFiles.some(f => f.id === s.activeFileId)) {
        const fallback = updatedFiles[0]?.id || 'main.tex';
        setActiveFileId(fallback);
      }
      return updatedFiles;
    });
  }, []);

  const handleDeleteFile = useCallback((fileId: string) => {
    setFiles(prev => {
      if (prev.length <= 1) return prev;
      const updated = prev.filter(f => f.id !== fileId);
      const s = projectStore.getState();
      const nextOpen = s.openFileIds.filter(id => id !== fileId);
      const finalOpen = nextOpen.length > 0 ? nextOpen : [updated[0]?.id || 'main.tex'];

      let nextActive = s.activeFileId;
      if (s.activeFileId === fileId) {
        nextActive = updated[0].id;
      }

      setProjectState({
        files: updated,
        openFileIds: finalOpen,
        activeFileId: nextActive,
      });
      return updated;
    });
  }, []);

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

  const handleTitleChange = useCallback((newTitle: string) => {
    setProjectTitle(newTitle);
  }, []);

  const handleFormatDocument = useCallback(() => {
    const s = projectStore.getState();
    const currentFile = s.files.find(f => f.id === s.activeFileId);
    if (!currentFile || !currentFile.name.endsWith('.tex')) return;
    const formatted = formatLatexCode(currentFile.content);
    if (formatted !== currentFile.content) {
      setFiles(prev => prev.map(f => (f.id === currentFile.id ? { ...f, content: formatted } : f)));
    }
  }, []);

  const handleSelectFormat = useCallback((format: PaperFormatId) => {
    setPaperFormat(format);
    setFiles(currFiles => {
      const entry =
        currFiles.find(f => f.name.endsWith('.tex') && f.isEntry) ??
        currFiles.find(f => f.name === 'main.tex') ??
        currFiles.find(f => /\\documentclass/.test(f.content));
      if (!entry) {
        onToast('No document with a \\documentclass to switch. Add one first.');
        return currFiles;
      }

      const updated = applyDocumentClass(entry.content, format);
      if (updated === entry.content) return currFiles;
      return currFiles.map(f => (f.id === entry.id ? { ...f, content: updated } : f));
    });

    const notice = formatResolutionNotice(format);
    if (notice) onToast(notice);
    setTimeout(() => triggerCompile(), 50);
  }, [triggerCompile, onToast]);

  const handleToggleTwoColumn = useCallback(() => {
    const s = projectStore.getState();
    const next = !s.isTwoColumn;
    setIsTwoColumn(next);

    setFiles(currFiles => {
      const entry =
        currFiles.find(f => f.name.endsWith('.tex') && f.isEntry) ??
        currFiles.find(f => f.name === 'main.tex') ??
        currFiles.find(f => /\\documentclass/.test(f.content));
      if (!entry) return currFiles;

      const updated = setTwoColumn(entry.content, next);
      if (updated === entry.content) return currFiles;
      return currFiles.map(f => (f.id === entry.id ? { ...f, content: updated } : f));
    });
    setTimeout(() => triggerCompile(), 50);
  }, [triggerCompile]);

  const handleAddPreambleMacro = useCallback((macroDef: string) => {
    setFiles(prev => {
      const mainFile = prev.find(f => f.name.endsWith('.tex') && f.isEntry) || prev.find(f => f.name.endsWith('.tex')) || prev[0];
      if (!mainFile) return prev;
      let content = mainFile.content;
      if (content.includes(macroDef.trim())) {
        return prev;
      }
      const beginDocIdx = content.indexOf('\\begin{document}');
      if (beginDocIdx !== -1) {
        content = content.slice(0, beginDocIdx) + macroDef.trim() + '\n\n' + content.slice(beginDocIdx);
      } else {
        content = macroDef.trim() + '\n\n' + content;
      }
      return prev.map(f => (f.id === mainFile.id ? { ...f, content } : f));
    });
    setTimeout(() => triggerCompile(), 50);
  }, [triggerCompile]);

  // Code change
  const handleCodeChange = useCallback((newCode: string, onPulseTyping?: () => void) => {
    if (onPulseTyping) onPulseTyping();
    const s = projectStore.getState();
    const currentId = s.activeFileId;
    const updatedFiles = s.files.map(f => (f.id === currentId ? { ...f, content: newCode } : f));
    setFiles(updatedFiles);

    if (providerRef?.current) {
      const yText = providerRef.current.getText(currentId);
      if (yText.toString() !== newCode) {
        providerRef.current.getDoc().transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, newCode);
        }, 'local-editor');
      }
    }
    markDirty(updatedFiles);
  }, [markDirty, providerRef]);

  // Suggested fix
  const handleApplyFix = useCallback((fix: SuggestedFix) => {
    const s = projectStore.getState();
    const currentFile = s.files.find(f => f.id === s.activeFileId) || s.files[0];
    if (!currentFile) return;
    const lines = currentFile.content.split('\n');
    const startIdx = Math.max(0, fix.startLine - 1);
    const deleteCount = Math.max(1, (fix.endLine ?? fix.startLine) - fix.startLine + 1);

    if (fix.startLine === 1 && (fix.endLine === 1 || !fix.endLine) && fix.replacement.startsWith('\\usepackage')) {
      const docClassIdx = lines.findIndex(l => /\\documentclass/.test(l));
      if (docClassIdx >= 0) {
        lines.splice(docClassIdx + 1, 0, fix.replacement);
      } else {
        lines.unshift(fix.replacement);
      }
    } else {
      lines.splice(startIdx, deleteCount, fix.replacement);
    }

    handleCodeChange(lines.join('\n'));
    setTimeout(() => triggerCompile(), 50);
  }, [handleCodeChange, triggerCompile]);

  // Insert code snippet
  const handleInsertCode = useCallback((latexSnippet: string) => {
    const s = projectStore.getState();
    const currentFile = s.files.find(f => f.id === s.activeFileId) || s.files[0];
    if (!currentFile) return;
    const updated = currentFile.content + '\n' + latexSnippet + '\n';
    handleCodeChange(updated);
    setTimeout(() => triggerCompile(), 50);
  }, [handleCodeChange, triggerCompile]);

  // Add image file
  const handleAddImageFile = useCallback((imageFile: ProjectFile) => {
    const s = projectStore.getState();
    const targetFolder = s.folders.includes('figures') ? 'figures' : undefined;
    const resolvedName = targetFolder && !imageFile.name.startsWith('figures/')
      ? `figures/${imageFile.name}`
      : imageFile.name;

    const fileToSave: ProjectFile = {
      ...imageFile,
      id: resolvedName,
      name: resolvedName,
      folder: targetFolder,
    };

    setFiles(prev => [...prev, fileToSave]);
  }, []);

  // Import files / drag & drop
  const handleImportFiles = useCallback(async (fileList: FileList | File[], targetFolder?: string) => {
    const rawFiles = Array.from(fileList);
    if (rawFiles.length === 0) return;

    const s = projectStore.getState();
    const newFiles: ProjectFile[] = [];
    const addedFolders = new Set(s.folders);

    for (const file of rawFiles) {
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|svg|webp|pdf)$/i.test(file.name);
      const isBib = file.name.endsWith('.bib');
      const isSty = file.name.endsWith('.sty') || file.name.endsWith('.cls');
      const safeName = file.name.replace(/\s+/g, '_');

      if (isImage) {
        const destFolder = targetFolder || 'figures';
        addedFolders.add(destFolder);
        const resolvedName = destFolder && !safeName.startsWith(destFolder + '/')
          ? `${destFolder}/${safeName}`
          : safeName;

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newFiles.push({
          id: resolvedName,
          name: resolvedName,
          type: 'image',
          folder: destFolder,
          content: `[Binary Image Data: ${Math.round(file.size / 1024)} KB]`,
          dataUrl,
        });
      } else {
        const textContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsText(file);
        });

        const destFolder = targetFolder || (safeName.includes('/') ? safeName.split('/')[0] : undefined);
        if (destFolder) addedFolders.add(destFolder);
        const resolvedName = destFolder && !safeName.startsWith(destFolder + '/')
          ? `${destFolder}/${safeName}`
          : safeName;

        newFiles.push({
          id: resolvedName,
          name: resolvedName,
          type: isBib ? 'bib' : isSty ? 'sty' : 'tex',
          folder: destFolder,
          content: textContent,
        });
      }
    }

    setFiles(prev => {
      const mergedFiles = [...prev];
      newFiles.forEach(nf => {
        const existingIdx = mergedFiles.findIndex(f => f.id === nf.id || f.name === nf.name);
        if (existingIdx >= 0) {
          mergedFiles[existingIdx] = nf;
        } else {
          mergedFiles.push(nf);
        }
      });
      return mergedFiles;
    });

    setFolders(Array.from(addedFolders));

    const firstTextFile = newFiles.find(f => f.type === 'tex' || f.type === 'bib');
    const targetOpen = firstTextFile || newFiles[0];
    if (targetOpen) {
      setActiveFileId(targetOpen.id);
    }

    setTimeout(() => triggerCompile(), 100);
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

  // Encryption
  const handleToggleEncryption = useCallback(async (enabled: boolean, passphrase: string, salt: string) => {
    const s = projectStore.getState();
    const pid = s.activeProjectId;
    if (enabled) {
      const encryptedFiles = await Promise.all(
        s.files.map(async f => ({
          ...f,
          content: await encryptText(f.content, passphrase, salt),
        }))
      );
      setFiles(encryptedFiles);
      const updated = updateProject(pid, {
        files: encryptedFiles,
        isEncrypted: true,
        encryptionSalt: salt,
      });
      setProjects(updated);
      logAuditAction(
        pid,
        'ENCRYPTION_ENABLED',
        'Enabled client-side AES-256-GCM vault encryption',
        currentUser?.fullName || 'Current User',
        activeProject?.role || 'owner',
        'security'
      );
    } else {
      try {
        const decryptedFiles = await Promise.all(
          s.files.map(async f => ({
            ...f,
            content: await decryptText(f.content, passphrase, salt),
          }))
        );
        setFiles(decryptedFiles);
        const updated = updateProject(pid, {
          files: decryptedFiles,
          isEncrypted: false,
          encryptionSalt: undefined,
        });
        setProjects(updated);
        logAuditAction(
          pid,
          'ENCRYPTION_DISABLED',
          'Decrypted document vault back to plaintext',
          currentUser?.fullName || 'Current User',
          activeProject?.role || 'owner',
          'security'
        );
      } catch (err: any) {
        alert('Decryption failed: ' + (err.message || 'Incorrect passphrase'));
        return;
      }
    }
  }, [currentUser, activeProject?.role]);

  // Checkpoints restore
  const handleRestoreCheckpoint = useCallback((cp: Checkpoint) => {
    const s = projectStore.getState();
    createCheckpoint(
      s.activeProjectId,
      `Pre-restore Backup (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
      currentUser?.fullName || 'You',
      s.files,
      true
    );

    const cloned = structuredClone ? structuredClone(cp.files) : JSON.parse(JSON.stringify(cp.files));
    setFiles(cloned);
    updateProject(s.activeProjectId, { files: cloned });
    setTimeout(() => triggerCompile(), 50);
    onToast(`Restored to "${cp.name}"`);
  }, [currentUser?.fullName, triggerCompile, onToast]);

  const handleRestoreSingleFile = useCallback((file: ProjectFile) => {
    const s = projectStore.getState();
    const updated = s.files.map(f => (f.id === file.id || f.name === file.name ? { ...file } : f));
    setFiles(updated);
    updateProject(s.activeProjectId, { files: updated });
    setTimeout(() => triggerCompile(), 50);
    onToast(`Restored ${file.name}`);
  }, [triggerCompile, onToast]);

  return {
    projects,
    activeProjectId,
    activeProject,
    activeFile,
    files,
    folders,
    activeFileId,
    openFileIds,
    projectTitle,
    paperFormat,
    isTwoColumn,
    hasRecoverableCrash,
    recoveredDraftInfo,
    restoreRecoveredDraft,
    discardRecoveredDraft,
    flushCurrentProjectSave,
    handleSelectProject,
    handleCreateProject,
    handleDuplicateProject,
    handleToggleArchiveProject,
    handleDeleteProject,
    handleSelectFile,
    handleCloseTab,
    handleCreateFile,
    handleCreateFolder,
    handleDeleteFolder,
    handleDeleteFile,
    handleSelectTemplate,
    handleTitleChange,
    handleSelectFormat,
    handleToggleTwoColumn,
    handleFormatDocument,
    handleAddPreambleMacro,
    handleCodeChange,
    handleApplyFix,
    handleInsertCode,
    handleAddImageFile,
    handleImportFiles,
    handleInviteMember,
    handleUpdateMemberRole,
    handleRemoveMember,
    handleToggleEncryption,
    handleRestoreCheckpoint,
    handleRestoreSingleFile,
    markDirty,
    setProjects,
    setFiles,
    setFolders,
    setActiveFileId,
    setOpenFileIds,
    setProjectTitle,
  };
}
