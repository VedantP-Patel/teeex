import { useMemo, useCallback } from 'react';
import type { ProjectFile, SuggestedFix, UserProfile, Project } from '../types/latex';
import type { Checkpoint } from '../services/checkpointsService';
import { createCheckpoint } from '../services/checkpointsService';
import {
  projectStore,
  useProjectStore,
  setProjectState,
  setFiles,
  setFolders,
  setActiveFileId,
  setOpenFileIds,
  setProjectTitle,
  setPaperFormat,
  setIsTwoColumn,
  setProjects,
} from '../stores/projectStore';
import { updateProject } from '../services/projectsService';
import { STARTER_TEMPLATES } from '../services/templates';
import { applyDocumentClass, formatResolutionNotice, setTwoColumn, type PaperFormatId } from '../services/paperFormats';
import { formatLatexCode } from '../services/latexFormatter';
import { encryptText, decryptText } from '../services/encryptionService';
import { logAuditAction } from '../services/auditService';
import { texEngine } from '../services/latexCompiler';

interface UseFileOperationsOptions {
  currentUser: UserProfile | null;
  activeProject?: Project;
  onToast: (message: string) => void;
  triggerCompile: () => void;
  markDirty: (files: ProjectFile[]) => void;
  providerRef?: React.MutableRefObject<any>;
}

export function useFileOperations({
  currentUser,
  activeProject,
  onToast,
  triggerCompile,
  markDirty,
  providerRef,
}: UseFileOperationsOptions) {
  const files = useProjectStore(s => s.files);
  const folders = useProjectStore(s => s.folders);
  const activeFileId = useProjectStore(s => s.activeFileId);
  const openFileIds = useProjectStore(s => s.openFileIds);
  const projectTitle = useProjectStore(s => s.projectTitle);
  const paperFormat = useProjectStore(s => s.paperFormat);
  const isTwoColumn = useProjectStore(s => s.isTwoColumn);

  const activeFile = useMemo(() => {
    return files.find(f => f.id === activeFileId) || files[0] || STARTER_TEMPLATES[0].files[0];
  }, [files, activeFileId]);

  const syncFilesToYjs = useCallback((updatedFiles: ProjectFile[]) => {
    const provider = providerRef?.current;
    if (!provider) return;
    const doc = provider.getDoc();
    doc.transact(() => {
      for (const f of updatedFiles) {
        if (f.type === 'image') continue;
        const yText = provider.getText(f.id);
        if (yText.toString() !== f.content) {
          yText.delete(0, yText.length);
          yText.insert(0, f.content);
        }
      }
    }, 'local-editor');
  }, [providerRef]);

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

  const handleTitleChange = useCallback((newTitle: string) => {
    setProjectTitle(newTitle);
  }, []);

  const handleFormatDocument = useCallback(() => {
    const s = projectStore.getState();
    const currentFile = s.files.find(f => f.id === s.activeFileId);
    if (!currentFile || !currentFile.name.endsWith('.tex')) return;
    const formatted = formatLatexCode(currentFile.content);
    if (formatted !== currentFile.content) {
      const next = s.files.map(f => (f.id === currentFile.id ? { ...f, content: formatted } : f));
      setFiles(next);
      syncFilesToYjs(next);
    }
  }, [syncFilesToYjs]);

  const handleSelectFormat = useCallback((format: PaperFormatId) => {
    setPaperFormat(format);
    const currFiles = projectStore.getState().files;
    const entry =
      currFiles.find(f => f.name.endsWith('.tex') && f.isEntry) ??
      currFiles.find(f => f.name === 'main.tex') ??
      currFiles.find(f => /\\documentclass/.test(f.content));
    if (!entry) {
      onToast('No document with a \\documentclass to switch. Add one first.');
    } else {
      const updated = applyDocumentClass(entry.content, format);
      if (updated !== entry.content) {
        const nextFiles = currFiles.map(f => (f.id === entry.id ? { ...f, content: updated } : f));
        setFiles(nextFiles);
        syncFilesToYjs(nextFiles);
      }
    }

    const notice = formatResolutionNotice(format);
    if (notice) onToast(notice);
    setTimeout(() => triggerCompile(), 50);
  }, [triggerCompile, onToast, syncFilesToYjs]);

  const handleToggleTwoColumn = useCallback(() => {
    const s = projectStore.getState();
    const next = !s.isTwoColumn;
    setIsTwoColumn(next);

    const currFiles = s.files;
    const entry =
      currFiles.find(f => f.name.endsWith('.tex') && f.isEntry) ??
      currFiles.find(f => f.name === 'main.tex') ??
      currFiles.find(f => /\\documentclass/.test(f.content));
    if (entry) {
      const updated = setTwoColumn(entry.content, next);
      if (updated !== entry.content) {
        const nextFiles = currFiles.map(f => (f.id === entry.id ? { ...f, content: updated } : f));
        setFiles(nextFiles);
        syncFilesToYjs(nextFiles);
      }
    }
    setTimeout(() => triggerCompile(), 50);
  }, [triggerCompile, syncFilesToYjs]);

  const handleAddPreambleMacro = useCallback((macroDef: string) => {
    const prev = projectStore.getState().files;
    const mainFile = prev.find(f => f.name.endsWith('.tex') && f.isEntry) || prev.find(f => f.name.endsWith('.tex')) || prev[0];
    if (mainFile && !mainFile.content.includes(macroDef.trim())) {
      let content = mainFile.content;
      const beginDocIdx = content.indexOf('\\begin{document}');
      if (beginDocIdx !== -1) {
        content = content.slice(0, beginDocIdx) + macroDef.trim() + '\n\n' + content.slice(beginDocIdx);
      } else {
        content = macroDef.trim() + '\n\n' + content;
      }
      const nextFiles = prev.map(f => (f.id === mainFile.id ? { ...f, content } : f));
      setFiles(nextFiles);
      syncFilesToYjs(nextFiles);
    }
    setTimeout(() => triggerCompile(), 50);
  }, [triggerCompile, syncFilesToYjs]);

  // Code mutations (yCollab already mutates Y.Text character-by-character on keystrokes;
  // programmatic mutations pass syncYjs = true so non-editor updates propagate to Yjs)
  const handleCodeChange = useCallback((newCode: string, onPulseTyping?: () => void, syncYjs = false) => {
    if (onPulseTyping) onPulseTyping();
    const s = projectStore.getState();
    const currentId = s.activeFileId;
    const updatedFiles = s.files.map(f => (f.id === currentId ? { ...f, content: newCode } : f));
    setFiles(updatedFiles);

    if (syncYjs && providerRef?.current) {
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

    handleCodeChange(lines.join('\n'), undefined, true);
    setTimeout(() => triggerCompile(), 50);
  }, [handleCodeChange, triggerCompile]);

  const handleInsertCode = useCallback((latexSnippet: string) => {
    const s = projectStore.getState();
    const currentFile = s.files.find(f => f.id === s.activeFileId) || s.files[0];
    if (!currentFile) return;
    const updated = currentFile.content + '\n' + latexSnippet + '\n';
    handleCodeChange(updated, undefined, true);
    setTimeout(() => triggerCompile(), 50);
  }, [handleCodeChange, triggerCompile]);

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

    texEngine.clearRegisteredMisses();
    setFiles(prev => [...prev, fileToSave]);
  }, []);

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

    texEngine.clearRegisteredMisses();
    setFolders(Array.from(addedFolders));

    const firstTextFile = newFiles.find(f => f.type === 'tex' || f.type === 'bib');
    const targetOpen = firstTextFile || newFiles[0];
    if (targetOpen) {
      setActiveFileId(targetOpen.id);
    }

    setTimeout(() => triggerCompile(), 100);
  }, [triggerCompile]);

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
  }, [currentUser, activeProject]);

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
    syncFilesToYjs(cloned);
    updateProject(s.activeProjectId, { files: cloned });
    setTimeout(() => triggerCompile(), 50);
    onToast(`Restored to "${cp.name}"`);
  }, [currentUser?.fullName, triggerCompile, onToast]);

  const handleRestoreSingleFile = useCallback((file: ProjectFile) => {
    const s = projectStore.getState();
    const updated = s.files.map(f => (f.id === file.id || f.name === file.name ? { ...file } : f));
    setFiles(updated);
    syncFilesToYjs(updated);
    updateProject(s.activeProjectId, { files: updated });
    setTimeout(() => triggerCompile(), 50);
    onToast(`Restored ${file.name}`);
  }, [triggerCompile, onToast]);

  return {
    files,
    folders,
    activeFileId,
    openFileIds,
    projectTitle,
    paperFormat,
    isTwoColumn,
    activeFile,
    handleSelectFile,
    handleCloseTab,
    handleCreateFile,
    handleCreateFolder,
    handleDeleteFolder,
    handleDeleteFile,
    handleTitleChange,
    handleFormatDocument,
    handleSelectFormat,
    handleToggleTwoColumn,
    handleAddPreambleMacro,
    handleCodeChange,
    handleApplyFix,
    handleInsertCode,
    handleAddImageFile,
    handleImportFiles,
    handleToggleEncryption,
    handleRestoreCheckpoint,
    handleRestoreSingleFile,
    setFiles,
    setFolders,
    setActiveFileId,
    setOpenFileIds,
    setProjectTitle,
  };
}
