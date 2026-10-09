import { useState, useEffect, useMemo, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { PreviewPane } from './components/PreviewPane';
import { DiagnosticsDock } from './components/DiagnosticsDock';
import { SymbolPaletteModal } from './components/modals/SymbolPaletteModal';
import { TableBuilderModal } from './components/modals/TableBuilderModal';
import { ShareModal } from './components/modals/ShareModal';
import { TemplateModal } from './components/modals/TemplateModal';
import { ImageUploadModal } from './components/modals/ImageUploadModal';
import { SupabaseModal } from './components/modals/SupabaseModal';
import { VersionHistoryModal, type Checkpoint } from './components/modals/VersionHistoryModal';
import { WordCountModal } from './components/modals/WordCountModal';
import { AuthModal } from './components/modals/AuthModal';
import { ProjectsDashboardModal } from './components/modals/ProjectsDashboardModal';

import type {
  ProjectFile,
  CompileState,
  Collaborator,
  SuggestedFix,
  Template,
  ReviewComment,
  Project,
  ProjectRole,
  UserProfile,
  ProjectMember
} from './types/latex';
import {
  diagnoseLatex,
  parseLatexDocument,
  renderLatexToHtml
} from './services/latexParser';
import { parseBibtex } from './services/bibtexParser';
import { STARTER_TEMPLATES } from './services/templates';
import { exportProjectAsZip } from './services/zipExporter';
import {
  CollaborationHub,
  DEFAULT_PEERS
} from './services/collaboration';
import { isSupabaseConnected } from './services/supabaseClient';
import { getStoredSession, signOutUser } from './services/authService';
import {
  loadProjects,
  getActiveProjectId,
  setActiveProjectId,
  createProject,
  duplicateProject,
  toggleArchiveProject,
  deleteProject,
  updateProject
} from './services/projectsService';

export function App() {
  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('teeex_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('teeex_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Auth & Session State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    return getStoredSession().user;
  });
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Multi-Project State
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [activeProjectId, setActiveProjectIdState] = useState<string>(() => {
    return getActiveProjectId(loadProjects());
  });
  const [isProjectsHubOpen, setIsProjectsHubOpen] = useState(false);

  const activeProject = useMemo(() => {
    return projects.find(p => p.id === activeProjectId) || projects[0];
  }, [projects, activeProjectId]);

  // Project & Files State (Bound to active project)
  const [files, setFiles] = useState<ProjectFile[]>(() => activeProject?.files || STARTER_TEMPLATES[0].files);
  const [activeFileId, setActiveFileId] = useState<string>(() => activeProject?.files?.[0]?.id || 'main.tex');
  const [projectTitle, setProjectTitle] = useState<string>(() => activeProject?.title || 'Neural Quantum State Tomography');

  // Active Role Resolution (URL query parameter ?role=viewer overrides, or activeProject.role)
  const currentRole = useMemo<ProjectRole>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRole = params.get('role') as ProjectRole | null;
    if (urlRole === 'viewer' || urlRole === 'editor' || urlRole === 'owner') {
      return urlRole;
    }
    return activeProject?.role || 'owner';
  }, [activeProject]);

  // Checkpoints State (Time Machine)
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([
    {
      id: 'checkpoint-init',
      name: 'Initial IEEE Draft',
      timestamp: 'Today, 00:15',
      author: currentUser?.fullName || 'Dr. Elena Rostova',
      files: activeProject.files,
    }
  ]);

  // Review Comments State (Google Docs style)
  const [comments, setComments] = useState<ReviewComment[]>([
    {
      id: 'comment-1',
      fileId: 'main.tex',
      line: 14,
      authorName: 'Dr. Elena Rostova',
      authorAvatar: 'ER',
      authorColor: '#10b981',
      text: 'Should we cite the 2026 PhysRev quantum benchmark paper here?',
      createdAt: '10 mins ago',
      resolved: false,
    }
  ]);

  // Cloud & Supabase State (automatically detected from Vercel)
  const [isCloudConnected, setIsCloudConnected] = useState(() => isSupabaseConnected());

  // Room & Collaboration State
  const [roomId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'quantum-project-alpha';
  });

  const [hub] = useState<CollaborationHub>(() => new CollaborationHub(roomId));
  const [selfUser, setSelfUser] = useState<Collaborator>(() => {
    const initial = hub.selfUser;
    if (currentUser) {
      return {
        ...initial,
        name: currentUser.fullName,
        avatar: currentUser.fullName.substring(0, 2).toUpperCase(),
        color: currentUser.avatarColor || '#38bdf8',
      };
    }
    return initial;
  });
  const [peers, setPeers] = useState<Collaborator[]>(DEFAULT_PEERS);

  // Active File reference
  const activeFile = useMemo(() => {
    return files.find(f => f.id === activeFileId) || files[0];
  }, [files, activeFileId]);

  // Extract structured BibTeX entries for live citation autocomplete
  const bibEntries = useMemo(() => {
    const bibFile = files.find(f => f.name.endsWith('.bib'));
    return bibFile ? parseBibtex(bibFile.content) : [];
  }, [files]);

  // Target line for SyncTeX jumps
  const [targetLine, setTargetLine] = useState<number | null>(null);

  // Compilation State
  const [compileState, setCompileState] = useState<CompileState>({
    status: 'success',
    durationMs: 14,
    timestamp: new Date().toLocaleTimeString(),
    errorCount: 0,
    warningCount: 0,
    rawLogs: ['Output written on main.pdf (1 page, 38402 bytes).'],
  });

  // Modal States
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isTableBuilderOpen, setIsTableBuilderOpen] = useState(false);
  const [isSymbolsOpen, setIsSymbolsOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isImageUploadOpen, setIsImageUploadOpen] = useState(false);
  const [isSupabaseOpen, setIsSupabaseOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isWordCountOpen, setIsWordCountOpen] = useState(false);

  // Split Pane Resizing
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  // Diagnostics & Parsed Document computation
  const diagnostics = useMemo(() => {
    if (!activeFile.name.endsWith('.tex')) return [];
    return diagnoseLatex(activeFile.content);
  }, [activeFile.content, activeFile.name]);

  const parsedDoc = useMemo(() => {
    return parseLatexDocument(activeFile.content);
  }, [activeFile.content]);

  // Live Rendered HTML with Figure resolution
  const renderedHtml = useMemo(() => {
    return renderLatexToHtml(activeFile.content, files);
  }, [activeFile.content, files]);

  // Document Stats
  const wordCount = useMemo(() => {
    const textOnly = activeFile.content.replace(/\\(.*?)\{.*?\}/g, '').replace(/%.*/g, '');
    const words = textOnly.trim().split(/\s+/).filter(w => w.length > 0);
    return words.length;
  }, [activeFile.content]);

  const equationCount = useMemo(() => {
    return parsedDoc.mathBlocks.length;
  }, [parsedDoc.mathBlocks]);

  // Run Compilation
  const triggerCompile = useCallback(() => {
    const t0 = performance.now();
    setCompileState(prev => ({ ...prev, status: 'compiling' }));

    setTimeout(() => {
      const errCount = diagnostics.filter(d => d.severity === 'error').length;
      const warnCount = diagnostics.filter(d => d.severity === 'warning').length;
      const duration = Math.round(performance.now() - t0);

      const logs: string[] = [
        `This is pdfTeX, Version 3.141592653-2.6-1.40.24 (TeX Live 2026)`,
        `entering extended mode`,
        `(${activeFile.name} LaTeX2e <2026-06-01>`,
      ];

      if (errCount > 0) {
        logs.push(`! ${errCount} syntax error(s) detected during parse pass.`);
      } else {
        logs.push(`Output written on ${activeFile.name.replace('.tex', '')}.pdf (1 page, ${Math.floor(wordCount * 12 + 18000)} bytes).`);
        logs.push(`SyncTeX database written to ${activeFile.name.replace('.tex', '')}.synctex.gz`);
      }

      setCompileState({
        status: errCount > 0 ? 'error' : 'success',
        durationMs: Math.max(8, duration),
        timestamp: new Date().toLocaleTimeString(),
        errorCount: errCount,
        warningCount: warnCount,
        rawLogs: logs,
      });
    }, 120);
  }, [diagnostics, activeFile.name, wordCount]);

  // Real-time Collaboration sync listener
  useEffect(() => {
    const unsubscribe = hub.onMessage(msg => {
      if (msg.type === 'FILE_UPDATE' && msg.fileId && msg.content !== undefined) {
        setFiles(prev => prev.map(f => f.id === msg.fileId ? { ...f, content: msg.content! } : f));
      } else if (msg.type === 'CURSOR_MOVE') {
        setPeers(prev => {
          const existing = prev.find(p => p.id === msg.senderId);
          if (existing) {
            return prev.map(p => p.id === msg.senderId ? {
              ...p,
              cursorLine: msg.cursorLine || p.cursorLine,
              cursorCol: msg.cursorCol || p.cursorCol,
              activeFile: msg.fileId || p.activeFile,
            } : p);
          } else {
            return [...prev, {
              id: msg.senderId,
              name: msg.senderName,
              color: msg.senderColor,
              avatar: msg.senderName.substring(0, 2).toUpperCase(),
              cursorLine: msg.cursorLine || 1,
              cursorCol: msg.cursorCol || 1,
              activeFile: msg.fileId || 'main.tex',
              status: 'active',
            }];
          }
        });
      }
    });

    return () => unsubscribe();
  }, [hub]);

  // Update file content & broadcast & sync project
  const handleCodeChange = (newCode: string) => {
    const updated = files.map(f => f.id === activeFileId ? { ...f, content: newCode } : f);
    setFiles(updated);
    hub.broadcastFileUpdate(activeFileId, newCode);
    const updatedProjects = updateProject(activeProjectId, { files: updated });
    setProjects(updatedProjects);
  };

  // Cursor change & broadcast
  const handleCursorChange = (line: number, col: number) => {
    setSelfUser(prev => ({ ...prev, cursorLine: line, cursorCol: col }));
    hub.broadcastCursor(activeFileId, line, col);
  };

  // Apply Quick Fix action
  const handleApplyFix = (fix: SuggestedFix) => {
    const lines = activeFile.content.split('\n');
    lines[fix.startLine - 1] = fix.replacement;
    const updated = lines.join('\n');
    handleCodeChange(updated);
    setTimeout(() => triggerCompile(), 50);
  };

  // Insert code snippet helper
  const handleInsertCode = (latexSnippet: string) => {
    const updated = activeFile.content + '\n' + latexSnippet + '\n';
    handleCodeChange(updated);
    setTimeout(() => triggerCompile(), 50);
  };

  // Review Comment Handlers
  const handleAddComment = (line: number, text: string) => {
    const newComment: ReviewComment = {
      id: 'comment-' + Date.now(),
      fileId: activeFile.id,
      line,
      authorName: selfUser.name,
      authorAvatar: selfUser.avatar,
      authorColor: selfUser.color,
      text,
      createdAt: 'Just now',
      resolved: false,
    };
    setComments(prev => [...prev, newComment]);
  };

  const handleResolveComment = (commentId: string) => {
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved: true } : c));
  };

  // Checkpoints Management (Time Machine)
  const handleCreateCheckpoint = (name: string) => {
    const newCp: Checkpoint = {
      id: 'cp-' + Date.now(),
      name,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      author: selfUser.name,
      files: JSON.parse(JSON.stringify(files)),
    };
    setCheckpoints(prev => [newCp, ...prev]);
  };

  const handleRestoreCheckpoint = (cp: Checkpoint) => {
    setFiles(JSON.parse(JSON.stringify(cp.files)));
    const updatedProjects = updateProject(activeProjectId, { files: cp.files });
    setProjects(updatedProjects);
    setTimeout(() => triggerCompile(), 50);
  };

  // Export full project as .zip package
  const handleExportZip = () => {
    exportProjectAsZip(projectTitle, files);
  };

  // File management
  const handleCreateFile = (name: string, type: 'tex' | 'bib') => {
    const newFile: ProjectFile = {
      id: name,
      name,
      type,
      content: type === 'bib' ? `% Bibliography File\n` : `\\section{New Section}\nContent goes here...\n`,
    };
    const updated = [...files, newFile];
    setFiles(updated);
    setActiveFileId(name);
    const updatedProjects = updateProject(activeProjectId, { files: updated });
    setProjects(updatedProjects);
  };

  const handleAddImageFile = (imageFile: ProjectFile) => {
    const updated = [...files, imageFile];
    setFiles(updated);
    const updatedProjects = updateProject(activeProjectId, { files: updated });
    setProjects(updatedProjects);
  };

  const handleDeleteFile = (fileId: string) => {
    if (files.length <= 1) return;
    const updated = files.filter(f => f.id !== fileId);
    setFiles(updated);
    if (activeFileId === fileId) {
      setActiveFileId(updated[0].id);
    }
    const updatedProjects = updateProject(activeProjectId, { files: updated });
    setProjects(updatedProjects);
  };

  // Template Selection
  const handleSelectTemplate = (template: Template) => {
    setFiles(template.files);
    setActiveFileId(template.files[0].id);
    setProjectTitle(template.name);
    const updatedProjects = updateProject(activeProjectId, {
      title: template.name,
      files: template.files
    });
    setProjects(updatedProjects);
    setTimeout(() => triggerCompile(), 50);
  };

  // Title changes
  const handleTitleChange = (newTitle: string) => {
    setProjectTitle(newTitle);
    const updatedProjects = updateProject(activeProjectId, { title: newTitle });
    setProjects(updatedProjects);
  };

  // Multi-Project Switching & Management
  const handleSelectProject = (projId: string) => {
    const proj = projects.find(p => p.id === projId);
    if (!proj) return;
    setActiveProjectId(projId);
    setActiveProjectIdState(projId);
    setFiles(proj.files);
    setActiveFileId(proj.files[0]?.id || 'main.tex');
    setProjectTitle(proj.title);
    setTimeout(() => triggerCompile(), 60);
  };

  const handleCreateProject = (title: string, templateId?: string) => {
    const newProj = createProject(
      title,
      currentUser?.email || 'elena.rostova@teeex.io',
      currentUser?.fullName || 'Dr. Elena Rostova',
      templateId
    );
    setProjects(loadProjects());
    handleSelectProject(newProj.id);
  };

  const handleDuplicateProject = (projId: string) => {
    const cloned = duplicateProject(projId);
    if (cloned) {
      setProjects(loadProjects());
      handleSelectProject(cloned.id);
    }
  };

  const handleToggleArchiveProject = (projId: string) => {
    const updated = toggleArchiveProject(projId);
    setProjects(updated);
  };

  const handleDeleteProject = (projId: string) => {
    const updated = deleteProject(projId);
    setProjects(updated);
    if (activeProjectId === projId && updated.length > 0) {
      handleSelectProject(updated[0].id);
    }
  };

  // Collaborator Invitations & Role Updates
  const handleInviteMember = (email: string, role: ProjectRole) => {
    const newMember: ProjectMember = {
      id: `usr-${Date.now().toString(36)}`,
      email,
      name: email.split('@')[0].replace(/[\._]/g, ' '),
      avatar: email.substring(0, 2).toUpperCase(),
      avatarColor: role === 'owner' ? '#38bdf8' : role === 'editor' ? '#10b981' : '#f59e0b',
      role,
      joinedAt: new Date().toISOString().split('T')[0],
    };
    const members = [...(activeProject.members || []), newMember];
    const updated = updateProject(activeProjectId, { members });
    setProjects(updated);
  };

  const handleUpdateMemberRole = (memberId: string, newRole: ProjectRole) => {
    const members = (activeProject.members || []).map(m =>
      m.id === memberId ? { ...m, role: newRole } : m
    );
    const updated = updateProject(activeProjectId, { members });
    setProjects(updated);
  };

  const handleRemoveMember = (memberId: string) => {
    const members = (activeProject.members || []).filter(m => m.id !== memberId);
    const updated = updateProject(activeProjectId, { members });
    setProjects(updated);
  };

  // Auth Handlers
  const handleAuthSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    setSelfUser(prev => ({
      ...prev,
      name: user.fullName,
      avatar: user.fullName.substring(0, 2).toUpperCase(),
      color: user.avatarColor || '#38bdf8',
    }));
  };

  const handleSignOut = async () => {
    await signOutUser();
    setCurrentUser(null);
  };

  // Draggable Split Divider Handlers
  const handleMouseDownSplit = () => {
    setIsDraggingSplit(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplit) return;
      const sidebarWidth = 220;
      const availableWidth = window.innerWidth - sidebarWidth;
      const mouseRelativeX = e.clientX - sidebarWidth;
      const newPercent = Math.min(78, Math.max(22, (mouseRelativeX / availableWidth) * 100));
      setSplitPercent(newPercent);
    };

    const handleMouseUp = () => {
      if (isDraggingSplit) setIsDraggingSplit(false);
    };

    if (isDraggingSplit) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSplit]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-app)', userSelect: isDraggingSplit ? 'none' : 'auto' }}>
      {/* Top Navigation */}
      <Navbar
        projectTitle={projectTitle}
        onTitleChange={handleTitleChange}
        compileState={compileState}
        onCompile={triggerCompile}
        peers={peers}
        selfUser={selfUser}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenShare={() => setIsShareOpen(true)}
        onOpenTableBuilder={() => setIsTableBuilderOpen(true)}
        onOpenSymbols={() => setIsSymbolsOpen(true)}
        onOpenTemplates={() => setIsTemplatesOpen(true)}
        onOpenImageUpload={() => setIsImageUploadOpen(true)}
        onOpenSupabase={() => setIsSupabaseOpen(true)}
        isCloudConnected={isCloudConnected}
        onExportPdf={() => window.print()}
        onExportZip={handleExportZip}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onOpenProjectsHub={() => setIsProjectsHubOpen(true)}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSignOut={handleSignOut}
        currentRole={currentRole}
      />

      {/* Main Workspace Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Sidebar */}
        <Sidebar
          files={files}
          activeFileId={activeFileId}
          onSelectFile={setActiveFileId}
          onCreateFile={handleCreateFile}
          onDeleteFile={handleDeleteFile}
          documentOutline={parsedDoc.sections}
          onJumpToLine={setTargetLine}
          wordCount={wordCount}
          equationCount={equationCount}
          onOpenWordCount={() => setIsWordCountOpen(true)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          role={currentRole}
        />

        {/* Center & Right Split Pane */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          {/* Left Split: Code Editor */}
          <div style={{ width: `${splitPercent}%`, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Editor
              code={activeFile.content}
              fileName={activeFile.name}
              onChange={handleCodeChange}
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
            />
          </div>

          {/* Draggable Divider */}
          <div
            onMouseDown={handleMouseDownSplit}
            style={{
              width: 5,
              cursor: 'col-resize',
              backgroundColor: isDraggingSplit ? '#38bdf8' : 'var(--border-subtle)',
              zIndex: 35,
              transition: isDraggingSplit ? 'none' : 'background 0.2s ease',
              position: 'relative',
            }}
            title="Drag to resize Editor and Preview panels"
          />

          {/* Right Split: Publication Preview Pane with SyncTeX */}
          <div style={{ width: `${100 - splitPercent}%`, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <PreviewPane
              renderedHtml={renderedHtml}
              parsedDoc={parsedDoc}
              onJumpToLine={setTargetLine}
            />
          </div>
        </div>
      </div>

      {/* Bottom Diagnostics Dock */}
      <DiagnosticsDock
        diagnostics={diagnostics}
        onApplyFix={handleApplyFix}
        onJumpToLine={setTargetLine}
        rawLogs={compileState.rawLogs}
      />

      {/* Modals */}
      <ImageUploadModal
        isOpen={isImageUploadOpen}
        onClose={() => setIsImageUploadOpen(false)}
        onAddImageFile={handleAddImageFile}
        onInsertLatex={handleInsertCode}
      />

      <SupabaseModal
        isOpen={isSupabaseOpen}
        onClose={() => {
          setIsSupabaseOpen(false);
          setIsCloudConnected(isSupabaseConnected());
        }}
        onSyncWithCloud={() => setIsCloudConnected(true)}
        projects={projects}
        onProjectsUpdated={setProjects}
      />

      <SymbolPaletteModal
        isOpen={isSymbolsOpen}
        onClose={() => setIsSymbolsOpen(false)}
        onInsert={handleInsertCode}
      />

      <TableBuilderModal
        isOpen={isTableBuilderOpen}
        onClose={() => setIsTableBuilderOpen(false)}
        onInsert={handleInsertCode}
      />

      <VersionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        checkpoints={checkpoints}
        currentFiles={files}
        onCreateCheckpoint={handleCreateCheckpoint}
        onRestoreCheckpoint={handleRestoreCheckpoint}
      />

      <WordCountModal
        isOpen={isWordCountOpen}
        onClose={() => setIsWordCountOpen(false)}
        wordCount={wordCount}
        equationCount={equationCount}
        parsedDoc={parsedDoc}
        activeCode={activeFile.content}
      />

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        roomId={roomId}
        peers={peers}
        selfUser={selfUser}
        projectMembers={activeProject?.members || []}
        onInviteMember={handleInviteMember}
        onUpdateMemberRole={handleUpdateMemberRole}
        onRemoveMember={handleRemoveMember}
        currentRole={currentRole}
      />

      <TemplateModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        onSelectTemplate={handleSelectTemplate}
      />

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={currentUser}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Multi-Project Hub Dashboard */}
      <ProjectsDashboardModal
        isOpen={isProjectsHubOpen}
        onClose={() => setIsProjectsHubOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onDuplicateProject={handleDuplicateProject}
        onToggleArchiveProject={handleToggleArchiveProject}
        onDeleteProject={handleDeleteProject}
        currentUser={currentUser}
      />
    </div>
  );
}

export default App;
