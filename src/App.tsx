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
import { AICopilotModal } from './components/modals/AICopilotModal';
import { ImageUploadModal } from './components/modals/ImageUploadModal';
import { SupabaseModal } from './components/modals/SupabaseModal';

import type {
  ProjectFile,
  CompileState,
  Collaborator,
  SuggestedFix,
  Template,
  ReviewComment
} from './types/latex';
import { STARTER_TEMPLATES } from './services/templates';
import {
  diagnoseLatex,
  parseLatexDocument,
  renderLatexToHtml
} from './services/latexParser';
import {
  CollaborationHub,
  DEFAULT_PEERS
} from './services/collaboration';
import { isSupabaseConnected } from './services/supabaseClient';

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

  // Project & Files State
  const [files, setFiles] = useState<ProjectFile[]>(() => {
    return STARTER_TEMPLATES[0].files;
  });
  const [activeFileId, setActiveFileId] = useState<string>('main.tex');
  const [projectTitle, setProjectTitle] = useState('Neural Quantum State Tomography');

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

  // Cloud & Supabase State
  const [isCloudConnected, setIsCloudConnected] = useState(() => isSupabaseConnected());

  // Room & Collaboration State
  const [roomId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'quantum-project-alpha';
  });

  const [hub] = useState<CollaborationHub>(() => new CollaborationHub(roomId));
  const [selfUser, setSelfUser] = useState<Collaborator>(hub.selfUser);
  const [peers, setPeers] = useState<Collaborator[]>(DEFAULT_PEERS);

  // Active File reference
  const activeFile = useMemo(() => {
    return files.find(f => f.id === activeFileId) || files[0];
  }, [files, activeFileId]);

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
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isImageUploadOpen, setIsImageUploadOpen] = useState(false);
  const [isSupabaseOpen, setIsSupabaseOpen] = useState(false);

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

  // Keyboard shortcut Ctrl+K / Cmd+K for AI Copilot
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCopilotOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, []);

  // Update file content & broadcast
  const handleCodeChange = (newCode: string) => {
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: newCode } : f));
    hub.broadcastFileUpdate(activeFileId, newCode);
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

  // Insert code snippet at end or position
  const handleInsertCode = (snippet: string) => {
    const newContent = activeFile.content + '\n' + snippet;
    handleCodeChange(newContent);
    triggerCompile();
  };

  // Comments Management
  const handleAddComment = (line: number, text: string) => {
    const newComment: ReviewComment = {
      id: 'comment-' + Math.random().toString(36).substring(2, 8),
      fileId: activeFileId,
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

  // File management
  const handleCreateFile = (name: string, type: 'tex' | 'bib') => {
    const newFile: ProjectFile = {
      id: name,
      name,
      type,
      content: type === 'bib' ? `% Bibliography File\n` : `\\section{New Section}\nContent goes here...\n`,
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(name);
  };

  const handleAddImageFile = (imageFile: ProjectFile) => {
    setFiles(prev => [...prev, imageFile]);
  };

  const handleDeleteFile = (fileId: string) => {
    if (files.length <= 1) return;
    setFiles(prev => prev.filter(f => f.id !== fileId));
    if (activeFileId === fileId) {
      setActiveFileId(files[0].id);
    }
  };

  // Template Selection
  const handleSelectTemplate = (template: Template) => {
    setFiles(template.files);
    setActiveFileId(template.files[0].id);
    setProjectTitle(template.name);
    setTimeout(() => triggerCompile(), 50);
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
        onTitleChange={setProjectTitle}
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
        onOpenCopilot={() => setIsCopilotOpen(true)}
        onOpenImageUpload={() => setIsImageUploadOpen(true)}
        onOpenSupabase={() => setIsSupabaseOpen(true)}
        isCloudConnected={isCloudConnected}
        onExportPdf={() => window.print()}
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
      <AICopilotModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        onInsertCode={handleInsertCode}
        diagnostics={diagnostics}
      />

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

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        roomId={roomId}
        peers={peers}
        selfUser={selfUser}
      />

      <TemplateModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        onSelectTemplate={handleSelectTemplate}
      />
    </div>
  );
}
export default App;
