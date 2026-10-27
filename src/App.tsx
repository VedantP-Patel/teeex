import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { UploadCloud, Loader2, AlertCircle } from 'lucide-react';
import { AuthPortal } from './components/AuthPortal';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { PreviewPane } from './components/PreviewPane';
import { DiagnosticsDock } from './components/DiagnosticsDock';

import { ModalContainer } from './components/modals/ModalContainer';
import { openModal, closeModal, useModalStore } from './stores/modalStore';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useGlobalKeyboardShortcuts } from './hooks/useGlobalKeyboardShortcuts';
import { useResizableSplit } from './hooks/useResizableSplit';
import { useFileHandling } from './hooks/useFileHandling';

import { requestDurableStorage } from './services/offlineStorageService';
import { downloadPdf } from './services/pdfExporter';
import { texEngine } from './services/latexCompiler';

import type {
  Diagnostic,
  UserProfile,
} from './types/latex';
import { useLatexParser } from './hooks/useLatexParser';
import { exportProjectAsZip } from './services/zipExporter';
import { useDeskPet } from './hooks/useDeskPet';
import { DeskPet } from './components/DeskPet';
import { isSupabaseConnected } from './services/supabaseClient';
import { getStoredSession, signOutUser, verifyActiveSupabaseSession } from './services/authService';
import {
  loadProjects,
  getActiveProjectId,
  syncProjectsWithCloudBiDirectional,
} from './services/projectsService';
import { useTheme } from './hooks/useTheme';
import { useProjectManager } from './hooks/useProjectManager';
import { useCollaboration } from './hooks/useCollaboration';
import { useCompilerIntegration } from './hooks/useCompilerIntegration';
import { useProjectCheckpoints } from './hooks/useProjectCheckpoints';

export function App() {
  // Theme hook
  const { theme, toggleTheme } = useTheme();

  // Auth & Session State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    return getStoredSession().user;
  });
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(() => {
    return isSupabaseConnected() && getStoredSession().user !== null;
  });

  // Toast notification state
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Active Cloud / Supabase session verification
  useEffect(() => {
    let isMounted = true;
    if (isSupabaseConnected()) {
      verifyActiveSupabaseSession()
        .then(verifiedUser => {
          if (!isMounted) return;
          if (verifiedUser) {
            setCurrentUser(verifiedUser);
          }
          setIsAuthChecking(false);
        })
        .catch(() => {
          if (!isMounted) return;
          setIsAuthChecking(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  // Request durable storage
  useEffect(() => {
    requestDurableStorage().catch(() => {});
  }, []);

  // Forward compile trigger ref to break circular dependency
  const compileTriggerRef = useRef<() => void>(() => {});

  // Project manager hook (composed of useProjectLifecycle & useFileOperations)
  const projectManager = useProjectManager({
    currentUser,
    onToast: (msg) => setToast(msg),
    triggerCompile: () => compileTriggerRef.current(),
  });

  const {
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
    setFiles,
    setProjects,
  } = projectManager;

  // Editor jump target line
  const [targetLine, setTargetLine] = useState<number | null>(null);

  // Collaboration hook — with stable onSelectFile and onJumpToLine injected
  const collaboration = useCollaboration({
    activeProjectId,
    activeProject,
    currentUser,
    activeFileId,
    onSelectFile: handleSelectFile,
    onJumpToLine: setTargetLine,
    onToast: (msg) => setToast(msg),
  });

  const {
    roomId,
    currentRole,
    selfUser,
    setSelfUser,
    peers,
    provider,
    comments,
    trackedChanges,
    activeCursorLine,
    handleCursorChange,
    handleAddComment,
    handleResolveComment,
    handleFollowPeer,
    handleAddTrackedChange,
    handleAcceptTrackedChange,
    handleRejectTrackedChange,
    isCloudConnected,
  } = collaboration;

  // Checkpoints & Git version control hook — decoupled from keystroke updates
  const checkpointsManager = useProjectCheckpoints({
    activeProjectId,
    currentUser,
    authorName: selfUser.name,
    onToast: (msg) => setToast(msg),
    setFiles,
  });

  const {
    checkpoints,
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
  } = checkpointsManager;

  // Live parser for syntax tree, outline, and live diagnostics (debounced 220ms)
  const liveCompileResult = useLatexParser({
    content: activeFile.content,
    files,
    activeFileName: activeFile.name,
    debounceMs: 220,
  });

  const parsedDoc = liveCompileResult.parsedDoc;
  const labels = liveCompileResult.labels;

  // Compiler integration hook
  const compiler = useCompilerIntegration({
    files,
    projectId: activeProjectId,
    activeFileName: activeFile.name,
    liveDurationMs: liveCompileResult.durationMs,
    onJumpToFileLine: (fileId, line) => {
      handleSelectFile(fileId);
      setTargetLine(line);
    },
    onToast: (msg) => setToast(msg),
  });

  const {
    selectedEngine,
    setSelectedEngine,
    compileMode,
    setCompileMode,
    compileState,
    texEngineView,
    triggerCompile,
    syncTexIndex,
    forwardTarget,
    setForwardTargetLine,
    handleInverseSync,
    engineErrorSummary,
    bibEntries,
  } = compiler;

  useEffect(() => {
    compileTriggerRef.current = triggerCompile;
  }, [triggerCompile]);

  // Combined diagnostics
  const diagnostics = useMemo(() => {
    const parserDiags = liveCompileResult.diagnostics;
    const outcome = texEngineView.outcome;
    if (!outcome || outcome.diagnostics.length === 0) return parserDiags;

    const engineDiags: Diagnostic[] = outcome.diagnostics.map(item => ({
      id: item.id,
      line: item.line ?? 1,
      column: 1,
      severity: item.severity,
      message: item.hint ? `${item.message} — ${item.hint}` : item.message,
      rule: item.code,
      rawLog: item.context ?? item.raw,
      suggestedFix: item.suggestedFix
        ? {
            title: item.suggestedFix.title,
            description: item.suggestedFix.description,
            replacement: item.suggestedFix.replacement,
            startLine: item.suggestedFix.startLine,
            endLine: item.suggestedFix.endLine,
          }
        : undefined,
    }));

    return [...engineDiags, ...parserDiags];
  }, [liveCompileResult.diagnostics, texEngineView.outcome]);

  // Network status hook
  const { isOffline } = useNetworkStatus({
    onStatusChange: offline => {
      setToast(
        offline
          ? 'Working offline — local compilation & IndexedDB persistence active'
          : 'Back online — cloud sync restored'
      );
    },
  });

  // Auto-recompile & cloud reconciliation when transitioning back online
  const prevOfflineRef = useRef(isOffline);
  useEffect(() => {
    if (prevOfflineRef.current && !isOffline) {
      texEngine.clearRegisteredMisses();
      triggerCompile();
      if (currentUser?.email) {
        syncProjectsWithCloudBiDirectional(currentUser.email, currentUser.fullName)
          .then(res => {
            if (res.success && res.projects && res.projects.length > 0) {
              setProjects(res.projects);
            }
          })
          .catch(() => {});
      }
    }
    prevOfflineRef.current = isOffline;
  }, [isOffline, triggerCompile, currentUser, setProjects]);

  // Desktop file drop / open handler
  useFileHandling(
    useCallback(
      (file) => {
        void handleImportFiles([new File([file.content], file.name, { type: file.name.endsWith('.bib') ? 'text/plain' : 'application/x-tex' })]);
        setToast(`Opened file "${file.name}" via desktop handler`);
      },
      [handleImportFiles]
    )
  );

  // Layout split resizer
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const {
    splitPercent,
    isDraggingSplit,
    handlePointerDownSplit,
    handlePointerMoveSplit,
    handlePointerUpSplit,
    handleKeyDownSplit,
    cyclePresetSplit,
  } = useResizableSplit({ defaultPercent: 50, minPercent: 20, maxPercent: 80 });

  // Desk Pet Companion State & Anonymized Typing Pulse
  const [isTypingActive, setIsTypingActive] = useState(false);
  const typingPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTyping = useCallback(() => {
    setIsTypingActive(true);
    if (typingPulseTimerRef.current) clearTimeout(typingPulseTimerRef.current);
    typingPulseTimerRef.current = setTimeout(() => {
      setIsTypingActive(false);
    }, 450);
  }, []);

  const deskPet = useDeskPet({
    compileStatus: compileState.status,
    lastCompiledAt: texEngineView.lastCompiledAt,
    errorCount: compileState.errorCount,
    warningCount: compileState.warningCount,
    isTypingActive,
  });

  // Debounced Word Count
  const [wordCount, setWordCount] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const textOnly = activeFile.content.replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, ' ').replace(/%.*/g, ' ');
      const words = textOnly.trim().split(/\s+/).filter(w => w.length > 0);
      setWordCount(words.length);
    }, 300);
    return () => clearTimeout(timer);
  }, [activeFile.content]);

  const equationCount = parsedDoc.mathBlocks.length;

  // Export handlers
  const handleExportPdf = useCallback(() => {
    const bytes = texEngineView.pdf;
    if (!bytes) {
      setToast(
        texEngineView.isCompiling
          ? 'Still typesetting — the PDF will be ready in a moment.'
          : 'No successful build to export yet. Fix the errors in the diagnostics panel, then recompile.'
      );
      return;
    }
    try {
      downloadPdf(bytes, projectTitle || parsedDoc.title || 'document');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'The PDF could not be exported.');
    }
  }, [texEngineView.pdf, texEngineView.isCompiling, projectTitle, parsedDoc.title]);

  const handleExportZip = useCallback(() => {
    exportProjectAsZip(projectTitle, files);
  }, [projectTitle, files]);

  // Auth & Session
  const handleAuthSuccess = useCallback((user: UserProfile) => {
    setCurrentUser(user);
    closeModal();
    setSelfUser(prev => ({
      ...prev,
      name: user.fullName,
      avatar: user.fullName.substring(0, 2).toUpperCase(),
      color: user.avatarColor || '#38bdf8',
    }));

    if (isSupabaseConnected()) {
      syncProjectsWithCloudBiDirectional(user.email, user.fullName)
        .then(res => {
          if (res.success && res.projects.length > 0) {
            setProjects(res.projects);
            const nextActiveId = getActiveProjectId(res.projects);
            handleSelectProject(nextActiveId);
          }
        })
        .catch(() => {});
    } else {
      const loadedProjects = loadProjects(user.email, user.fullName);
      setProjects(loadedProjects);
      const nextActiveId = getActiveProjectId(loadedProjects);
      handleSelectProject(nextActiveId);
    }
  }, [handleSelectProject, setProjects, setSelfUser]);

  const handleSignOut = useCallback(async () => {
    flushCurrentProjectSave();
    await signOutUser();
    setCurrentUser(null);
    closeModal();
    const guestProjects = loadProjects();
    setProjects(guestProjects);
    if (guestProjects[0]) {
      handleSelectProject(guestProjects[0].id);
    }
  }, [flushCurrentProjectSave, handleSelectProject, setProjects]);

  // Unified modal active check
  const isAnyModalOpen = useModalStore(s => s.activeModal !== null);

  // Global Keyboard Shortcuts
  useGlobalKeyboardShortcuts({
    onOpenCommandPalette: () => {
      openModal('commandPalette', { initialMode: 'all' });
    },
    onQuickOpenFile: () => {
      openModal('commandPalette', { initialMode: 'files' });
    },
    onSaveProject: () => {
      flushCurrentProjectSave();
      handleCreateCheckpoint('Manual snapshot');
      setToast('Project checkpoint saved');
    },
    onCompileDocument: () => triggerCompile(),
    onToggleSidebar: () => setIsSidebarOpen(prev => !prev),
    onFormatDocument: handleFormatDocument,
    onForwardSync: () => {
      if (activeCursorLine) setForwardTargetLine({ line: activeCursorLine, nonce: Date.now() });
    },
    onDismissModal: closeModal,
    isModalOpen: isAnyModalOpen,
  });

  // Ctrl+Shift+G for Source Control
  useEffect(() => {
    const handleGitShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        openModal('versionHistory');
      }
    };
    window.addEventListener('keydown', handleGitShortcut);
    return () => window.removeEventListener('keydown', handleGitShortcut);
  }, []);

  // Drag & drop file overlay
  const [isDragOverApp, setIsDragOverApp] = useState(false);
  const dragCounterRef = useRef(0);

  const handleAppDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      dragCounterRef.current += 1;
      setIsDragOverApp(true);
    }
  };

  const handleAppDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOverApp(false);
    }
  };

  const handleAppDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleAppDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOverApp(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleImportFiles(e.dataTransfer.files);
    }
  };

  if (isAuthChecking) {
    return (
      <div
        style={{
          minHeight: '100vh',
          width: '100vw',
          backgroundColor: 'var(--bg-app)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-4)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--brand-surface)',
            border: '1px solid var(--border-focus)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-glow)',
          }}
        >
          <Loader2 size={24} color="var(--brand-primary)" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, letterSpacing: '-0.01em' }}>Teeex</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
            Restoring your session…
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthPortal onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <>
      <div
        id="root-workspace"
        onDragEnter={handleAppDragEnter}
        onDragLeave={handleAppDragLeave}
        onDragOver={handleAppDragOver}
        onDrop={handleAppDrop}
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-app)',
          userSelect: isDraggingSplit ? 'none' : 'auto',
          position: 'relative',
        }}
      >
        {isDragOverApp && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.78)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              pointerEvents: 'none',
              border: '3px dashed #38bdf8',
              margin: 8,
              borderRadius: 'var(--radius-lg)',
              animation: 'fadeIn 0.15s ease forwards',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                padding: '30px 45px',
                backgroundColor: 'var(--bg-surface-0)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 16,
                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                <UploadCloud size={32} color="#38bdf8" />
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                  Drop files to import into project
                </h3>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, maxWidth: 360 }}>
                  Automatically imports LaTeX documents (.tex), bibliographies (.bib), and figures (.png, .jpg, .svg, .pdf) directly into your workspace.
                </p>
              </div>
            </div>
          </div>
        )}

        <Navbar
          projectTitle={projectTitle}
          onTitleChange={handleTitleChange}
          compileState={compileState}
          onCompile={triggerCompile}
          compileMode={compileMode}
          onToggleCompileMode={setCompileMode}
          selectedEngine={selectedEngine}
          onSelectEngine={setSelectedEngine}
          peers={peers}
          selfUser={selfUser}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenCommandPalette={() => openModal('commandPalette', { initialMode: 'all' })}
          onOpenShare={() => openModal('share')}
          onOpenTableBuilder={() => openModal('tableBuilder')}
          onOpenSymbols={() => openModal('symbolPalette', { initialTab: 'symbols' })}
          onOpenTemplates={() => openModal('template')}
          onOpenImageUpload={() => openModal('imageUpload')}
          isCloudConnected={isCloudConnected}
          onExportPdf={handleExportPdf}
          onExportZip={handleExportZip}
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={handleSelectProject}
          onOpenProjectsHub={() => openModal('projectsHub')}
          currentUser={currentUser}
          onOpenAuth={() => openModal('auth')}
          onSignOut={handleSignOut}
          currentRole={currentRole}
          isEncrypted={!!activeProject?.isEncrypted}
          isOffline={isOffline}
          isDeskPetEnabled={deskPet.isEnabled}
          onToggleDeskPet={deskPet.toggleEnabled}
          engineStatus={texEngineView.status}
        />

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div
            style={{
              width: isSidebarOpen ? 236 : 0,
              transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
            }}
          >
            <Sidebar
              files={files}
              folders={folders}
              activeFileId={activeFileId}
              onSelectFile={handleSelectFile}
              onCreateFile={handleCreateFile}
              onDeleteFile={handleDeleteFile}
              onCreateFolder={handleCreateFolder}
              onDeleteFolder={handleDeleteFolder}
              documentOutline={parsedDoc.sections}
              parsedDoc={parsedDoc}
              activeCursorLine={activeCursorLine}
              onJumpToLine={setTargetLine}
              wordCount={wordCount}
              equationCount={equationCount}
              onOpenWordCount={() => openModal('wordCount')}
              onOpenHistory={() => openModal('versionHistory')}
              role={currentRole}
              onCollapse={() => setIsSidebarOpen(false)}
              onImportFiles={handleImportFiles}
              onOpenImageUpload={() => openModal('imageUpload')}
              peers={peers}
            />
          </div>

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
            <div
              id="workspace-editor-pane"
              style={{ width: `${splitPercent}%`, height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <Editor
                code={activeFile.content}
                fileName={activeFile.name}
                activeFileId={activeFileId}
                openFileIds={openFileIds}
                onSelectFile={handleSelectFile}
                onCloseTab={handleCloseTab}
                onChange={(code) => handleCodeChange(code, pulseTyping)}
                diagnostics={diagnostics}
                peers={peers}
                onCursorChange={handleCursorChange}
                onCompileShortcut={triggerCompile}
                targetLine={targetLine}
                onClearTargetLine={() => setTargetLine(null)}
                comments={comments}
                onAddComment={handleAddComment}
                onResolveComment={handleResolveComment}
                bibEntries={bibEntries}
                role={currentRole}
                files={files}
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
                onForwardSync={(line) => setForwardTargetLine({ line, nonce: Date.now() })}
                trackedChanges={trackedChanges}
                onAcceptTrackedChange={handleAcceptTrackedChange}
                onRejectTrackedChange={handleRejectTrackedChange}
                onAddTrackedChange={handleAddTrackedChange}
                onOpenSnippets={() => openModal('symbolPalette', { initialTab: 'snippets' })}
                onFormatDocument={handleFormatDocument}
                onOpenCommandPalette={() => openModal('commandPalette', { initialMode: 'all' })}
                onOpenImageUpload={() => openModal('imageUpload')}
                onImportFiles={handleImportFiles}
                ytext={provider ? provider.getText(activeFileId) : null}
                awareness={provider ? provider.awareness : null}
                undoManager={provider ? provider.getUndoManager(activeFileId) : null}
                onFollowPeer={handleFollowPeer}
              />
            </div>

            <div
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-valuenow={Math.round(splitPercent)}
              aria-valuemin={20}
              aria-valuemax={80}
              aria-controls="workspace-editor-pane workspace-preview-pane"
              aria-label="Resize Editor and Preview panels"
              className={`panel-resizer ${isDraggingSplit ? 'is-dragging' : ''}`}
              onPointerDown={handlePointerDownSplit}
              onPointerMove={(e) => handlePointerMoveSplit(e, isSidebarOpen ? 236 : 0)}
              onPointerUp={handlePointerUpSplit}
              onKeyDown={handleKeyDownSplit}
              onDoubleClick={cyclePresetSplit}
              title="Drag or use Left/Right arrows to resize panels • Double-click to cycle presets"
            />

            <div
              id="workspace-preview-pane"
              style={{
                width: `${100 - splitPercent}%`,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'var(--bg-app)',
              }}
            >
              <PreviewPane
                parsedDoc={parsedDoc}
                labels={labels}
                documentTitle={projectTitle || parsedDoc.title || 'document'}
                pdf={texEngineView.pdf}
                status={texEngineView.status}
                isCompiling={texEngineView.isCompiling}
                isDebouncing={texEngineView.isDebouncing}
                durationMs={texEngineView.durationMs}
                isStale={texEngineView.isStale}
                rerunRequired={Boolean(texEngineView.outcome?.rerunRequired)}
                errorSummary={engineErrorSummary}
                onCompile={triggerCompile}
                syncTexIndex={syncTexIndex}
                forwardTarget={forwardTarget}
                onInverseSync={handleInverseSync}
                onJumpToLine={setTargetLine}
              />
            </div>
          </div>
        </div>

        <DiagnosticsDock
          diagnostics={diagnostics}
          onApplyFix={handleApplyFix}
          onJumpToLine={setTargetLine}
          rawLogs={compileState.rawLogs}
        />

        {(deskPet.isEnabled || deskPet.isExiting) && (
          <DeskPet
            {...deskPet}
            dockCollapsed={diagnostics.length === 0}
            onToggleEnabled={deskPet.toggleEnabled}
            onInsertFormula={(formula) => {
              handleInsertCode(`$${formula}$`);
              setToast(`Inserted $${formula}$ from TeXCat dream!`);
            }}
          />
        )}

        {toast && (
          <div className="app-toast" role="status" aria-live="polite">
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {hasRecoverableCrash && recoveredDraftInfo && (
          <aside
            className="crash-recovery-banner"
            role="alert"
            style={{
              position: 'fixed',
              bottom: 40,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 16px',
              backgroundColor: 'var(--bg-surface-2, #1e293b)',
              border: '1px solid var(--accent-cyan, #38bdf8)',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: 13,
            }}
          >
            <AlertCircle size={16} color="#38bdf8" />
            <span>
              Uncommitted changes ({recoveredDraftInfo.fileCount} files) from{' '}
              {new Date(recoveredDraftInfo.timestamp).toLocaleTimeString()} recovered.
            </span>
            <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
              <button
                type="button"
                onClick={restoreRecoveredDraft}
                className="btn-primary"
                style={{
                  fontSize: 12,
                  padding: '4px 12px',
                  backgroundColor: '#0284c7',
                  color: '#fff',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Restore Draft
              </button>
              <button
                type="button"
                onClick={discardRecoveredDraft}
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-subtle, #334155)',
                  color: 'var(--text-secondary, #94a3b8)',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Discard
              </button>
            </div>
          </aside>
        )}
      </div>

      <ModalContainer
        activeProject={activeProject}
        activeProjectId={activeProjectId}
        projectTitle={projectTitle}
        files={files}
        activeFile={activeFile}
        checkpoints={checkpoints}
        workingTreeStatus={workingTreeStatus}
        handleCreateCommit={handleCreateCommit}
        handlePushCommits={handlePushCommits}
        handlePullCommits={handlePullCommits}
        activeBranch={activeBranch}
        branches={projectBranches}
        onSwitchBranch={handleSwitchBranch}
        onCreateBranch={handleCreateBranch}
        onDeleteBranch={handleDeleteBranch}
        isCloudConnected={isCloudConnected}
        parsedDoc={parsedDoc}
        wordCount={wordCount}
        equationCount={equationCount}
        roomId={roomId}
        peers={peers}
        selfUser={selfUser}
        currentUser={currentUser}
        currentRole={currentRole}
        projects={projects}
        isTwoColumn={isTwoColumn}
        paperFormat={paperFormat}
        theme={theme}
        selectedEngine={selectedEngine}
        onSelectEngine={setSelectedEngine}
        handleAddImageFile={handleAddImageFile}
        handleInsertCode={handleInsertCode}
        handleAddPreambleMacro={handleAddPreambleMacro}
        handleCreateCheckpoint={handleCreateCheckpoint}
        handleRestoreCheckpoint={handleRestoreCheckpoint}
        handleRestoreSingleFile={handleRestoreSingleFile}
        handleDeleteCheckpoint={handleDeleteCheckpoint}
        handleSyncCheckpointsCloud={handleSyncCheckpointsCloud}
        handleInviteMember={handleInviteMember}
        handleUpdateMemberRole={handleUpdateMemberRole}
        handleRemoveMember={handleRemoveMember}
        handleSelectTemplate={handleSelectTemplate}
        handleAuthSuccess={handleAuthSuccess}
        handleSelectProject={handleSelectProject}
        handleCreateProject={handleCreateProject}
        handleDuplicateProject={handleDuplicateProject}
        handleToggleArchiveProject={handleToggleArchiveProject}
        handleDeleteProject={handleDeleteProject}
        handleToggleEncryption={handleToggleEncryption}
        handleSelectFile={handleSelectFile}
        triggerCompile={triggerCompile}
        handleFormatDocument={handleFormatDocument}
        handleToggleTwoColumn={handleToggleTwoColumn}
        handleSelectFormat={handleSelectFormat}
        toggleTheme={toggleTheme}
        handleExportPdf={handleExportPdf}
        handleExportZip={handleExportZip}
        setTargetLine={setTargetLine}
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
        onSaveProject={() => {
          flushCurrentProjectSave();
          handleCreateCheckpoint('Manual snapshot');
          setToast('Project checkpoint saved');
        }}
        onForwardSync={() => {
          if (activeCursorLine) setForwardTargetLine({ line: activeCursorLine, nonce: Date.now() });
        }}
        isDeskPetEnabled={deskPet.isEnabled}
        onToggleDeskPet={deskPet.toggleEnabled}
      />
    </>
  );
}

export default App;