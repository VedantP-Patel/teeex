import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  X,
  MessageSquare,
  Check,
  Eye,
  Image as ImageIcon,
  Download,
  Copy,
} from 'lucide-react';
import { openSearchPanel } from '@codemirror/search';

import type { Collaborator, Diagnostic, ReviewComment, ProjectRole, ProjectFile, TrackedChange } from '../types/latex';
import type { BibEntry } from '../services/bibtexParser';
import { extractLatexLabels } from '../services/latexParser';
import type { SyntaxTheme } from '../services/syntaxHighlighter';
import { EditorMinimap } from './EditorMinimap';
import { EditorToolbar } from './EditorToolbar';
import { useLatexExtensions } from '../hooks/useLatexExtensions';
import { useCodeMirror } from '../hooks/useCodeMirror';

interface Props {
  code: string;
  fileName: string;
  activeFileId?: string;
  openFileIds?: string[];
  onSelectFile?: (fileId: string) => void;
  onCloseTab?: (fileId: string) => void;
  onChange: (newCode: string) => void;
  diagnostics: Diagnostic[];
  peers: Collaborator[];
  onCursorChange: (line: number, col: number) => void;
  onCompileShortcut: () => void;
  targetLine: number | null;
  onClearTargetLine: () => void;
  comments: ReviewComment[];
  onAddComment: (line: number, text: string) => void;
  onResolveComment: (commentId: string) => void;
  bibEntries?: BibEntry[];
  role?: ProjectRole;
  files?: ProjectFile[];
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onForwardSync?: (line: number) => void;
  trackedChanges?: TrackedChange[];
  onAcceptTrackedChange?: (changeId: string) => void;
  onRejectTrackedChange?: (changeId: string) => void;
  onAddTrackedChange?: (change: Omit<TrackedChange, 'id' | 'status' | 'timestamp'>) => void;
  onOpenSnippets?: () => void;
  onFormatDocument?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenImageUpload?: () => void;
  onImportFiles?: (files: FileList | File[], targetFolder?: string) => void;
}

export const Editor: React.FC<Props> = ({
  code,
  fileName,
  activeFileId,
  openFileIds = [],
  onSelectFile,
  onCloseTab,
  onChange,
  diagnostics,
  peers,
  onCursorChange,
  onCompileShortcut,
  targetLine,
  onClearTargetLine,
  comments,
  onAddComment,
  onResolveComment,
  bibEntries = [],
  role = 'owner',
  files = [],
  isSidebarOpen = true,
  onToggleSidebar,
  onForwardSync,
  trackedChanges = [],
  onAcceptTrackedChange,
  onRejectTrackedChange,
  onOpenSnippets,
  onFormatDocument,
  onOpenImageUpload,
}) => {
  const [suggestionMode, setSuggestionMode] = useState(false);
  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(false);
  const [activeChangeId, setActiveChangeId] = useState<string | null>(null);
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [currentCursorLine, setCurrentCursorLine] = useState(1);
  const [imageCopied, setImageCopied] = useState(false);
  const [isFindOpen, setIsFindOpen] = useState(false);

  const [syntaxTheme, setSyntaxTheme] = useState<SyntaxTheme>(() => {
    const saved = localStorage.getItem('teeex_syntax_theme') as SyntaxTheme;
    if (saved && ['vscode', 'antigravity', 'monokai', 'dracula', 'normal'].includes(saved)) {
      return saved;
    }
    return 'vscode';
  });

  const [isLightMode, setIsLightMode] = useState<boolean>(() => {
    return document.documentElement.getAttribute('data-theme') === 'light';
  });

  const [autoSyncPreview, setAutoSyncPreview] = useState<boolean>(() => {
    return localStorage.getItem('teeex_auto_sync_preview') === 'true';
  });

  const [isMinimapOpen, setIsMinimapOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('teeex_editor_minimap');
    return saved !== null ? saved === 'true' : true;
  });

  const [viewportScrollTop, setViewportScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  // Debounced code for Minimap & Labels extraction so typing stays 0ms lag
  const [debouncedCode, setDebouncedCode] = useState(code);
  const [labelKeys, setLabelKeys] = useState<string[]>(() =>
    extractLatexLabels(files).map((l) => l.key)
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCode(code);
      setLabelKeys(extractLatexLabels(files).map((l) => l.key));
    }, 450);
    return () => clearTimeout(timer);
  }, [code, files]);

  // Sync theme attribute changes
  useEffect(() => {
    const checkTheme = () => {
      setIsLightMode(document.documentElement.getAttribute('data-theme') === 'light');
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const currentFile = files.find((f) => (activeFileId && f.id === activeFileId) || f.name === fileName);
  const isImageFile = currentFile?.type === 'image' || /\.(png|jpe?g|gif|svg|webp|ico)$/i.test(fileName);

  const extensions = useLatexExtensions({
    theme: syntaxTheme,
    isLight: isLightMode,
    bibEntries,
    labels: labelKeys,
    readOnly: role === 'viewer',
    onCompileShortcut,
    onForwardSync,
  });

  const handleInternalCursorChange = useCallback(
    (line: number, col: number) => {
      setCurrentCursorLine((prev) => (prev !== line ? line : prev));
      onCursorChange(line, col);
    },
    [onCursorChange]
  );

  const { containerRef, viewRef, insertText, wrapSelection, jumpToLine } = useCodeMirror({
    code,
    onChange,
    onCursorChange: handleInternalCursorChange,
    extensions,
    theme: syntaxTheme,
    isLight: isLightMode,
    readOnly: role === 'viewer',
    peers,
    diagnostics,
    targetLine,
    onClearTargetLine,
  });

  // Track scroll with requestAnimationFrame throttling when Minimap is open
  useEffect(() => {
    if (!isMinimapOpen) return;
    const view = viewRef.current;
    if (!view) return;

    const scrollEl = view.scrollDOM;
    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setViewportScrollTop(scrollEl.scrollTop);
        setViewportHeight(scrollEl.clientHeight);
      });
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      scrollEl.removeEventListener('scroll', handleScroll);
    };
  }, [viewRef, isMinimapOpen]);

  // Forward SyncTeX: Debounced tracking when cursor line changes
  const lastAutoSyncedLineRef = useRef<number>(1);
  useEffect(() => {
    if (!autoSyncPreview || !onForwardSync) return;
    if (currentCursorLine === lastAutoSyncedLineRef.current) return;

    const timer = setTimeout(() => {
      lastAutoSyncedLineRef.current = currentCursorLine;
      onForwardSync(currentCursorLine);
    }, 350);

    return () => clearTimeout(timer);
  }, [autoSyncPreview, currentCursorLine, onForwardSync]);

  const handleOpenFind = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      openSearchPanel(view);
      setIsFindOpen(true);
    }
  }, [viewRef]);

  const commentMap = useMemo(() => {
    const map = new Map<number, ReviewComment[]>();
    comments
      .filter((c) => !c.resolved)
      .forEach((c) => {
        const arr = map.get(c.line) || [];
        arr.push(c);
        map.set(c.line, arr);
      });
    return map;
  }, [comments]);

  const submitComment = () => {
    if (!commentDraft.trim() || activeCommentLine === null) return;
    onAddComment(activeCommentLine, commentDraft.trim());
    setCommentDraft('');
    setActiveCommentLine(null);
  };

  // Fast line count without allocating an array of every line on every keystroke
  const lineCount = useMemo(() => {
    let count = 1;
    for (let i = 0; i < debouncedCode.length; i++) {
      if (debouncedCode.charCodeAt(i) === 10) count++;
    }
    return count;
  }, [debouncedCode]);

  const activeReviewCount = useMemo(
    () =>
      comments.filter((c) => !c.resolved).length +
      trackedChanges.filter((t) => t.status === 'pending').length,
    [comments, trackedChanges]
  );

  return (
    <div style={editorContainerStyle}>
      {openFileIds && openFileIds.length > 0 && onSelectFile && (
        <div
          style={tabStripStyle}
          className="toolbar-scrollbar"
          onWheel={(e) => {
            if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
          }}
        >
          {openFileIds.map((fId) => {
            const f = files.find((file) => file.id === fId);
            if (!f) return null;
            const isActive = f.id === activeFileId;

            return (
              <div
                key={f.id}
                onClick={() => onSelectFile(f.id)}
                style={{
                  ...tabItemStyle,
                  backgroundColor: isActive ? 'var(--bg-app)' : 'var(--bg-surface-0)',
                  borderTop: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                  borderRight: '1px solid var(--border-subtle)',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{f.name}</span>
                {openFileIds.length > 1 && onCloseTab && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(f.id);
                    }}
                    className="btn-ghost"
                    style={{ padding: '1px 3px', color: 'inherit', borderRadius: 2 }}
                    title="Close tab"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {role === 'viewer' && (
        <div style={viewerNoticeStyle}>
          <Eye size={13} color="#f59e0b" style={{ flexShrink: 0 }} />
          <span>
            <strong>Viewer Mode (Read-Only):</strong> You can review LaTeX code and leave inline review comments. Editing and compilation are locked.
          </span>
        </div>
      )}

      <EditorToolbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={onToggleSidebar}
        isImageFile={isImageFile}
        fileName={fileName}
        lineCount={lineCount}
        peers={peers}
        suggestionMode={suggestionMode}
        setSuggestionMode={setSuggestionMode}
        role={role}
        currentFile={currentFile}
        imageCopied={imageCopied}
        setImageCopied={setImageCopied}
        onOpenImageUpload={onOpenImageUpload}
        onWrapSelection={wrapSelection}
        onInsertSnippet={insertText}
        onOpenSnippets={onOpenSnippets}
        onFormatDocument={onFormatDocument}
        trackedChangesCount={trackedChanges.length}
        onForwardSync={onForwardSync}
        currentCursorLine={currentCursorLine}
        autoSyncPreview={autoSyncPreview}
        setAutoSyncPreview={setAutoSyncPreview}
        syntaxTheme={syntaxTheme}
        setSyntaxTheme={setSyntaxTheme}
        onOpenFind={handleOpenFind}
        isFindOpen={isFindOpen}
        isReviewPanelOpen={isReviewPanelOpen}
        setIsReviewPanelOpen={setIsReviewPanelOpen}
        activeReviewCount={activeReviewCount}
        isMinimapOpen={isMinimapOpen}
        setIsMinimapOpen={setIsMinimapOpen}
        onAddCommentClick={() => setActiveCommentLine(currentCursorLine)}
      />

      {isImageFile ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-app)',
            padding: 32,
            overflow: 'auto',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              maxWidth: '100%',
              gap: 20,
            }}
          >
            <div
              style={{
                padding: 20,
                borderRadius: 10,
                backgroundColor: '#0f172a',
                backgroundImage:
                  'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                maxHeight: '62vh',
                maxWidth: '90vw',
                overflow: 'hidden',
              }}
            >
              {currentFile?.dataUrl || (currentFile?.content && currentFile.content.startsWith('data:')) ? (
                <img
                  src={currentFile.dataUrl || currentFile.content}
                  alt={fileName}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '58vh',
                    objectFit: 'contain',
                    borderRadius: 4,
                  }}
                />
              ) : (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <ImageIcon size={48} color="#64748b" />
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                    Preview Not Available
                  </div>
                  <div style={{ fontSize: 11, maxWidth: 300 }}>
                    {currentFile?.content || 'Binary image asset stored in project vault.'}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                backgroundColor: 'var(--bg-surface-0)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '14px 18px',
                width: '100%',
                maxWidth: 520,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <ImageIcon size={14} color="#38bdf8" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {fileName}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {currentFile?.folder ? `Folder: ${currentFile.folder}/` : 'Root Directory'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => {
                    const includePath = currentFile?.folder ? `${currentFile.folder}/${fileName.split('/').pop()}` : fileName;
                    const cleanLabel = (fileName.split('/').pop() || 'fig').replace(/\.[^/.]+$/, '');
                    const snippet = `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${includePath}}\n  \\caption{Caption}\n  \\label{fig:${cleanLabel}}\n\\end{figure}`;
                    navigator.clipboard.writeText(snippet);
                    setImageCopied(true);
                    setTimeout(() => setImageCopied(false), 2000);
                  }}
                  className="btn-primary"
                  style={{
                    flex: 1,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    backgroundColor: imageCopied ? '#16a34a' : '#0284c7',
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <Copy size={13} />
                  <span>{imageCopied ? 'LaTeX Code Copied!' : 'Copy \\includegraphics Snippet'}</span>
                </button>

                {currentFile?.dataUrl && (
                  <a
                    href={currentFile.dataUrl}
                    download={fileName.split('/').pop() || 'figure.png'}
                    style={{
                      height: 32,
                      padding: '0 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      borderRadius: 6,
                      backgroundColor: 'var(--bg-surface-1)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      textDecoration: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <Download size={13} />
                    <span>Download</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={editorBodyStyle}>
          <div
            ref={containerRef}
            className="codemirror-wrapper"
            style={{
              flex: 1,
              height: '100%',
              overflow: 'hidden',
              position: 'relative',
            }}
          />

          {activeCommentLine !== null && (
            <div
              style={{
                position: 'absolute',
                top: Math.max(10, (activeCommentLine - 1) * 23),
                right: 20,
                zIndex: 30,
                backgroundColor: 'var(--bg-surface-1)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
                padding: 10,
                width: 260,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>
                  Comment on Line {activeCommentLine}
                </span>
                <button onClick={() => setActiveCommentLine(null)} className="btn-ghost" style={{ padding: 2 }}>
                  <X size={12} />
                </button>
              </div>

              {(commentMap.get(activeCommentLine) || []).map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: '6px 8px',
                    backgroundColor: 'var(--bg-surface-0)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 4,
                    marginBottom: 6,
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, color: c.authorColor }}>{c.authorName}</span>
                    <button
                      onClick={() => onResolveComment(c.id)}
                      className="btn-ghost"
                      style={{ padding: '1px 4px', fontSize: 10, color: 'var(--text-muted)' }}
                      title="Mark as resolved"
                    >
                      <Check size={11} color="#10b981" /> Resolve
                    </button>
                  </div>
                  <div style={{ color: 'var(--text-primary)' }}>{c.text}</div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  type="text"
                  placeholder="Leave comment..."
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                  style={{ flex: 1, padding: '4px 8px', fontSize: 11 }}
                  autoFocus
                />
                <button onClick={submitComment} className="btn-primary" style={{ padding: '4px 8px', fontSize: 11 }}>
                  Post
                </button>
              </div>
            </div>
          )}

          {isReviewPanelOpen && (
            <div
              style={{
                position: 'absolute',
                top: 8,
                right: 12,
                bottom: 8,
                width: 310,
                zIndex: 38,
                backgroundColor: 'var(--bg-surface-1)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: 'var(--bg-surface-0)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={13} color="#38bdf8" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Review &amp; Suggestions
                  </span>
                </div>
                <button onClick={() => setIsReviewPanelOpen(false)} className="btn-ghost" style={{ padding: 2 }}>
                  <X size={13} />
                </button>
              </div>

              <div style={{ flex: 1, padding: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                    Tracked Suggestions ({trackedChanges.filter((t) => t.status === 'pending').length})
                  </div>

                  {trackedChanges.filter((t) => t.status === 'pending').length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 8px' }}>
                      No pending suggestions.
                    </div>
                  ) : (
                    trackedChanges
                      .filter((t) => t.status === 'pending')
                      .map((t) => (
                        <div
                          key={t.id}
                          onClick={() => {
                            setActiveChangeId(t.id);
                            jumpToLine(t.line);
                          }}
                          style={{
                            padding: 8,
                            backgroundColor: activeChangeId === t.id ? 'rgba(56, 189, 248, 0.08)' : 'var(--bg-surface-0)',
                            border: `1px solid ${activeChangeId === t.id ? '#38bdf8' : 'var(--border-subtle)'}`,
                            borderRadius: 'var(--radius-sm)',
                            marginBottom: 6,
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: t.authorColor }} />
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.authorName}</span>
                            </div>
                            <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Line {t.line}</span>
                          </div>

                          <div
                            style={{
                              padding: '4px 6px',
                              borderRadius: 3,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10.5,
                              backgroundColor: t.type === 'insertion' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                              color: t.type === 'insertion' ? '#10b981' : '#f43f5e',
                              border: `1px solid ${t.type === 'insertion' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
                              marginBottom: 6,
                              textDecoration: t.type === 'deletion' ? 'line-through' : 'none',
                            }}
                          >
                            {t.type === 'insertion' ? `+ ${t.text}` : `- ${t.text}`}
                          </div>

                          {role !== 'viewer' && (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => onRejectTrackedChange?.(t.id)}
                                className="btn-ghost"
                                style={{ fontSize: 10.5, padding: '3px 8px', color: '#f43f5e', display: 'flex', alignItems: 'center', gap: 3 }}
                                title="Reject suggestion"
                              >
                                <X size={11} /> Reject
                              </button>
                              <button
                                onClick={() => onAcceptTrackedChange?.(t.id)}
                                className="btn-primary"
                                style={{ fontSize: 10.5, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 3 }}
                                title="Accept suggestion"
                              >
                                <Check size={11} /> Accept
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                  )}
                </div>

                <div style={{ marginTop: 6, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                    Review Comments ({comments.filter((c) => !c.resolved).length})
                  </div>

                  {comments.filter((c) => !c.resolved).length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 8px' }}>
                      No active comments.
                    </div>
                  ) : (
                    comments
                      .filter((c) => !c.resolved)
                      .map((c) => (
                        <div
                          key={c.id}
                          style={{
                            padding: 8,
                            backgroundColor: 'var(--bg-surface-0)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            marginBottom: 6,
                            fontSize: 11,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: '50%',
                                  backgroundColor: c.authorColor,
                                  color: '#fff',
                                  fontSize: 8.5,
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {c.authorAvatar}
                              </div>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.authorName}</span>
                            </div>
                            <span style={{ fontSize: 9.5, color: '#f59e0b' }}>Line {c.line}</span>
                          </div>

                          <div style={{ color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.4 }}>
                            {c.text}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => onResolveComment(c.id)}
                              className="btn-secondary"
                              style={{ fontSize: 10, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }}
                              title="Resolve comment"
                            >
                              <Check size={10} /> Resolve
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}

          {isMinimapOpen && (
            <EditorMinimap
              code={debouncedCode}
              theme={syntaxTheme}
              isLightMode={isLightMode}
              scrollTop={viewportScrollTop}
              viewportHeight={viewportHeight}
              totalContentHeight={Math.max(viewportHeight, lineCount * 22 + 40)}
              onScrollTo={(target) => {
                if (viewRef.current) {
                  viewRef.current.scrollDOM.scrollTop = target;
                }
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

const editorContainerStyle: React.CSSProperties = {
  flex: 1,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'var(--bg-app)',
  overflow: 'hidden',
};

const editorBodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
  position: 'relative',
};

const viewerNoticeStyle: React.CSSProperties = {
  backgroundColor: 'rgba(245, 158, 11, 0.1)',
  borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
  padding: '6px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11.5,
  color: '#f59e0b',
  flexShrink: 0,
};

const tabStripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  backgroundColor: 'var(--bg-surface-0)',
  borderBottom: '1px solid var(--border-subtle)',
  overflowX: 'auto',
  flexShrink: 0,
};

const tabItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  cursor: 'pointer',
  userSelect: 'none',
  fontSize: 11,
  transition: 'all 0.15s ease',
};