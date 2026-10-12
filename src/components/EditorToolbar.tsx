import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Sigma,
  Quote,
  List,
  MessageSquarePlus,
  Check,
  MessageSquare,
  Eye,
  Code as CodeIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowRight,
  Edit3,
  Palette,
  FileText,
  ChevronDown,
  Zap,
  Search,
  Layers,
  Map as MapIcon,
  Image as ImageIcon,
  Download,
  Copy,
  Upload,
} from 'lucide-react';
import type { Collaborator, ProjectRole, ProjectFile } from '../types/latex';
import { SYNTAX_THEMES, type SyntaxTheme } from '../services/syntaxHighlighter';

export interface EditorToolbarProps {
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  isImageFile: boolean;
  editorMode: 'code' | 'visual';
  setEditorMode: (mode: 'code' | 'visual') => void;
  fileName: string;
  lineCount: number;
  peers: Collaborator[];
  suggestionMode: boolean;
  setSuggestionMode: (val: boolean) => void;
  role?: ProjectRole;
  currentFile?: ProjectFile;
  imageCopied: boolean;
  setImageCopied: (val: boolean) => void;
  onOpenImageUpload?: () => void;
  onWrapSelection: (before: string, after: string) => void;
  onInsertSnippet: (text: string, offset?: number) => void;
  onOpenSnippets?: () => void;
  onFormatDocument?: () => void;
  trackedChangesCount: number;
  onForwardSync?: (line: number) => void;
  currentCursorLine: number;
  autoSyncPreview: boolean;
  setAutoSyncPreview: (val: boolean) => void;
  syntaxTheme: SyntaxTheme;
  setSyntaxTheme: (theme: SyntaxTheme) => void;
  onOpenFind: () => void;
  isFindOpen: boolean;
  isReviewPanelOpen: boolean;
  setIsReviewPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeReviewCount: number;
  isMinimapOpen: boolean;
  setIsMinimapOpen: (val: boolean) => void;
  onAddCommentClick: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = React.memo(({
  isSidebarOpen = true,
  onToggleSidebar,
  isImageFile,
  editorMode,
  setEditorMode,
  fileName,
  lineCount,
  peers,
  suggestionMode,
  setSuggestionMode,
  role = 'owner',
  currentFile,
  imageCopied,
  setImageCopied,
  onOpenImageUpload,
  onWrapSelection,
  onInsertSnippet,
  onOpenSnippets,
  onFormatDocument,
  trackedChangesCount,
  onForwardSync,
  currentCursorLine,
  autoSyncPreview,
  setAutoSyncPreview,
  syntaxTheme,
  setSyntaxTheme,
  onOpenFind,
  isFindOpen,
  isReviewPanelOpen,
  setIsReviewPanelOpen,
  activeReviewCount,
  isMinimapOpen,
  setIsMinimapOpen,
  onAddCommentClick,
}) => {
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ top: number; right: number } | null>(null);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  const toggleThemeMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isThemeMenuOpen && themeButtonRef.current) {
      const rect = themeButtonRef.current.getBoundingClientRect();
      setMenuCoords({
        top: rect.bottom + 5,
        right: Math.max(10, window.innerWidth - rect.right),
      });
    }
    setIsThemeMenuOpen((prev) => !prev);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        themeMenuRef.current &&
        !themeMenuRef.current.contains(e.target as Node) &&
        themeButtonRef.current &&
        !themeButtonRef.current.contains(e.target as Node)
      ) {
        setIsThemeMenuOpen(false);
      }
    };
    if (isThemeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      const handleResize = () => setIsThemeMenuOpen(false);
      window.addEventListener('resize', handleResize);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isThemeMenuOpen]);

  return (
    <div
      style={editorToolbarStyle}
      className="editor-toolbar toolbar-scrollbar"
      onWheel={(e) => {
        if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
      }}
    >
      {/* Left Controls: Sidebar toggle, Code/Visual switcher, File Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            style={{
              height: 24,
              padding: '0 6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isSidebarOpen ? 'var(--text-secondary)' : '#38bdf8',
              backgroundColor: isSidebarOpen ? 'var(--bg-surface-1)' : 'rgba(56, 189, 248, 0.12)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 5,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title={isSidebarOpen ? 'Collapse files sidebar' : 'Expand files sidebar'}
          >
            {isSidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeftOpen size={12} />}
          </button>
        )}

        {isImageFile ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '0 8px',
              borderRadius: 5,
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              fontSize: 10.5,
              fontWeight: 600,
              height: 24,
              boxSizing: 'border-box',
            }}
          >
            <ImageIcon size={11} />
            <span>Image Asset</span>
          </div>
        ) : (
          <div style={segmentedControlStyle}>
            <button
              type="button"
              onClick={() => {
                setEditorMode('code');
                localStorage.setItem('teeex_editor_mode', 'code');
              }}
              style={{
                ...segmentedBtnStyle,
                ...(editorMode === 'code' ? activeSegmentedBtnStyle : {}),
              }}
              title="Code Editor: High-performance CodeMirror 6 LaTeX editor"
            >
              <CodeIcon size={11} />
              <span>Code</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditorMode('visual');
                localStorage.setItem('teeex_editor_mode', 'visual');
              }}
              style={{
                ...segmentedBtnStyle,
                ...(editorMode === 'visual' ? activeSegmentedBtnStyle : {}),
              }}
              title="Visual Editor: Interactive rich-text LaTeX WYSIWYG editor"
            >
              <Eye size={11} />
              <span>Visual</span>
            </button>
          </div>
        )}

        {/* Active File Pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '0 7px',
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 5,
            height: 24,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {isImageFile ? <ImageIcon size={11} color="#38bdf8" /> : <FileText size={11} color="#38bdf8" />}
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            {fileName}
          </span>
          <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
            {isImageFile ? '• Asset' : `• ${lineCount} lines`}
          </span>
        </div>

        {/* Active Co-Authors Presence Avatar Stack */}
        {peers.filter((p) => p.activeFile === fileName).length > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: 2 }}>
              {peers
                .filter((p) => p.activeFile === fileName)
                .map((p, idx) => (
                  <div
                    key={p.id}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      backgroundColor: p.color,
                      color: '#ffffff',
                      fontSize: 9,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid var(--bg-surface-0)',
                      marginLeft: idx > 0 ? -6 : 0,
                      position: 'relative',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                      cursor: 'default',
                    }}
                    title={`${p.name} (Line ${p.cursorLine} • ${p.status === 'typing' ? 'Typing...' : 'Active'})`}
                  >
                    {p.avatar || p.name.substring(0, 2).toUpperCase()}
                  </div>
                ))}
            </div>
            <span className="badge badge-emerald" style={{ fontSize: 9, padding: '2px 6px', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
              {peers.filter((p) => p.activeFile === fileName).length} co-author{peers.filter((p) => p.activeFile === fileName).length > 1 ? 's' : ''} live
            </span>
          </div>
        )}

        {/* Suggesting vs Editing Mode Toggle */}
        {role !== 'viewer' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: 'var(--bg-surface-2)', borderRadius: 5, padding: 2, border: '1px solid var(--border-subtle)', height: 24, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setSuggestionMode(false)}
              style={{
                ...segmentedBtnStyle,
                height: 20,
                padding: '0 6px',
                fontSize: 10,
                backgroundColor: !suggestionMode ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                color: !suggestionMode ? '#38bdf8' : 'var(--text-muted)',
              }}
              title="Editing Mode: Direct changes apply immediately"
            >
              <Edit3 size={10} />
              <span>Editing</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSuggestionMode(true);
                setIsReviewPanelOpen(true);
              }}
              style={{
                ...segmentedBtnStyle,
                height: 20,
                padding: '0 6px',
                fontSize: 10,
                backgroundColor: suggestionMode ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                color: suggestionMode ? '#10b981' : 'var(--text-muted)',
              }}
              title="Suggesting Mode: Edits become track-change suggestions"
            >
              <Check size={10} />
              <span>Suggesting</span>
              {trackedChangesCount > 0 && (
                <span
                  style={{
                    fontSize: 8.5,
                    fontWeight: 700,
                    padding: '0 4px',
                    borderRadius: 999,
                    backgroundColor: '#10b981',
                    color: '#fff',
                    marginLeft: 2,
                    lineHeight: '13px',
                  }}
                >
                  {trackedChangesCount}
                </span>
              )}
            </button>
          </div>
        )}

        {role === 'viewer' && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              whiteSpace: 'nowrap',
            }}
          >
            Read-Only
          </span>
        )}
      </div>

      {/* Right Controls: Quick Formatting Snippets, Sync Preview, Syntax Theme */}
      {isImageFile ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
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
            style={{
              height: 24,
              padding: '0 8px',
              fontSize: 10.5,
              fontWeight: 600,
              borderRadius: 5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              backgroundColor: imageCopied ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.12)',
              color: imageCopied ? '#22c55e' : '#38bdf8',
              border: imageCopied ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(56, 189, 248, 0.25)',
              cursor: 'pointer',
            }}
            title="Copy LaTeX \\includegraphics snippet to clipboard"
          >
            <Copy size={11} />
            <span>{imageCopied ? 'Copied' : 'Copy \\includegraphics'}</span>
          </button>

          {currentFile?.dataUrl && (
            <a
              href={currentFile.dataUrl}
              download={fileName.split('/').pop() || 'figure.png'}
              style={{
                height: 24,
                padding: '0 8px',
                fontSize: 10.5,
                fontWeight: 500,
                borderRadius: 5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: 'var(--bg-surface-1)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
              title="Download original image file"
            >
              <Download size={11} />
              <span>Download</span>
            </a>
          )}

          {onOpenImageUpload && (
            <button
              type="button"
              onClick={onOpenImageUpload}
              style={{
                height: 24,
                padding: '0 8px',
                fontSize: 10.5,
                fontWeight: 500,
                borderRadius: 5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: 'var(--bg-surface-1)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
              title="Upload or replace image"
            >
              <Upload size={11} />
              <span>Upload</span>
            </button>
          )}
        </div>
      ) : editorMode === 'code' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {role !== 'viewer' && (
            <div style={formatGroupStyle}>
              <button
                type="button"
                onClick={() => onWrapSelection('\\textbf{', '}')}
                className="format-toolbar-btn"
                style={formatBtnStyle}
                title="Bold (\textbf{})"
              >
                <Bold size={11} />
              </button>

              <div style={formatDividerStyle} />

              <button
                type="button"
                onClick={() => onWrapSelection('\\textit{', '}')}
                className="format-toolbar-btn"
                style={formatBtnStyle}
                title="Italic (\textit{})"
              >
                <Italic size={11} />
              </button>

              <div style={formatDividerStyle} />

              <button
                type="button"
                onClick={() => onInsertSnippet('\\begin{equation}\n  \\label{eq:label}\n  \n\\end{equation}', 38)}
                className="format-toolbar-btn"
                style={formatBtnStyle}
                title="Display Equation"
              >
                <Sigma size={11} />
              </button>

              <div style={formatDividerStyle} />

              <button
                type="button"
                onClick={() => onWrapSelection('\\frac{', '}{}')}
                className="format-toolbar-btn"
                style={formatBtnStyle}
                title="Fraction (\frac{}{})"
              >
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>a/b</span>
              </button>

              <div style={formatDividerStyle} />

              <button
                type="button"
                onClick={() => onWrapSelection('\\cite{', '}')}
                className="format-toolbar-btn"
                style={formatBtnStyle}
                title="Citation (\cite{})"
              >
                <Quote size={11} />
              </button>

              <div style={formatDividerStyle} />

              <button
                type="button"
                onClick={() => onInsertSnippet('\\begin{itemize}\n  \\item \n\\end{itemize}', 25)}
                className="format-toolbar-btn"
                style={formatBtnStyle}
                title="Itemize List"
              >
                <List size={11} />
              </button>

              <div style={formatDividerStyle} />

              <button
                type="button"
                onClick={() => {
                  if (onOpenImageUpload) {
                    onOpenImageUpload();
                  } else {
                    onInsertSnippet('\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{figure.png}\n  \\caption{Caption}\n  \\label{fig:label}\n\\end{figure}', 95);
                  }
                }}
                className="format-toolbar-btn"
                style={formatBtnStyle}
                title="Insert Figure / Image (\includegraphics)"
              >
                <ImageIcon size={11} />
              </button>

              {onOpenSnippets && (
                <>
                  <div style={formatDividerStyle} />
                  <button
                    type="button"
                    onClick={onOpenSnippets}
                    className="format-toolbar-btn"
                    style={{ ...formatBtnStyle, color: '#a855f7' }}
                    title="LaTeX Snippets & Macro Manager"
                  >
                    <Layers size={11} />
                  </button>
                </>
              )}

              {onFormatDocument && (
                <>
                  <div style={formatDividerStyle} />
                  <button
                    type="button"
                    onClick={onFormatDocument}
                    className="format-toolbar-btn"
                    style={{ ...formatBtnStyle, color: '#38bdf8' }}
                    title="Format LaTeX Code"
                  >
                    <CodeIcon size={11} />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Forward SyncTeX Control: Manual Sync Button + Auto Sync Toggle */}
          {onForwardSync && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 24,
                borderRadius: 5,
                backgroundColor: 'var(--bg-surface-1)',
                border: '1px solid var(--border-medium)',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={() => onForwardSync(currentCursorLine)}
                style={{
                  height: '100%',
                  padding: '0 8px',
                  fontSize: 10.5,
                  fontWeight: 500,
                  color: '#38bdf8',
                  backgroundColor: 'transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  border: 'none',
                  borderRight: '1px solid var(--border-subtle)',
                }}
                title="Manual Sync: Scroll PDF preview to cursor line"
              >
                <ArrowRight size={11} />
                <span>Sync Preview</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !autoSyncPreview;
                  setAutoSyncPreview(next);
                  localStorage.setItem('teeex_auto_sync_preview', String(next));
                  if (next) onForwardSync(currentCursorLine);
                }}
                style={{
                  height: '100%',
                  padding: '0 7px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: autoSyncPreview ? '#10b981' : 'var(--text-muted)',
                  backgroundColor: autoSyncPreview ? 'rgba(16, 185, 129, 0.14)' : 'transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3.5,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  border: 'none',
                }}
                title={autoSyncPreview ? 'Auto Sync ON' : 'Auto Sync OFF'}
              >
                <Zap size={10} color={autoSyncPreview ? '#10b981' : 'var(--text-muted)'} />
                <span>{autoSyncPreview ? 'Auto: ON' : 'Auto: OFF'}</span>
              </button>
            </div>
          )}

          {/* Syntax Theme Switcher */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <button
              ref={themeButtonRef}
              type="button"
              onClick={toggleThemeMenu}
              style={{
                height: 24,
                padding: '0 8px',
                fontSize: 10.5,
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                backgroundColor: isThemeMenuOpen ? 'var(--bg-surface-elevated)' : 'var(--bg-surface-1)',
                borderRadius: 5,
                border: isThemeMenuOpen ? '1px solid #38bdf8' : '1px solid var(--border-medium)',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
              }}
              title="Editor Syntax Color Theme"
            >
              <Palette size={11} color="#38bdf8" />
              <span style={{ fontWeight: 600 }}>Syntax: {SYNTAX_THEMES[syntaxTheme].badge}</span>
              <span style={{ display: 'flex', gap: 2, alignItems: 'center', marginLeft: 2 }}>
                {SYNTAX_THEMES[syntaxTheme].previewColors.map((c, i) => (
                  <span
                    key={i}
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      backgroundColor: c,
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                ))}
              </span>
              <ChevronDown size={10} color="var(--text-muted)" style={{ marginLeft: 2 }} />
            </button>

            {isThemeMenuOpen && menuCoords && createPortal(
              <div
                ref={themeMenuRef}
                style={{
                  position: 'fixed',
                  top: menuCoords.top,
                  right: menuCoords.right,
                  zIndex: 99999,
                  backgroundColor: 'var(--bg-surface-1)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
                  width: 250,
                  padding: 6,
                  backdropFilter: 'blur(16px)',
                }}
              >
                <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Palette size={12} color="#38bdf8" />
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                      Syntax Color Theme
                    </span>
                  </div>
                </div>
                {(Object.keys(SYNTAX_THEMES) as SyntaxTheme[]).map((tKey) => {
                  const th = SYNTAX_THEMES[tKey];
                  const isSelected = syntaxTheme === tKey;
                  return (
                    <div
                      key={tKey}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSyntaxTheme(tKey);
                        localStorage.setItem('teeex_syntax_theme', tKey);
                        setIsThemeMenuOpen(false);
                      }}
                      style={{
                        padding: '7px 9px',
                        borderRadius: 4,
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                        marginBottom: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 2 }}>
                          {th.previewColors.map((c, i) => (
                            <span
                              key={i}
                              style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: c, display: 'inline-block' }}
                            />
                          ))}
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#38bdf8' : 'var(--text-primary)' }}>
                          {th.label}
                        </span>
                      </div>
                      {isSelected && <Check size={12} color="#38bdf8" />}
                    </div>
                  );
                })}
              </div>,
              document.body
            )}
          </div>

          {/* Add Inline Review Comment */}
          <button
            onClick={onAddCommentClick}
            className="btn-ghost"
            style={{ ...toolBtnStyle, color: '#f59e0b' }}
            title="Add inline review comment at cursor"
          >
            <MessageSquarePlus size={13} />
            <span style={{ fontSize: 10 }}>Comment</span>
          </button>

          {/* Review & Annotations Panel Button */}
          <button
            onClick={() => setIsReviewPanelOpen((prev) => !prev)}
            className="btn-ghost"
            style={{
              ...toolBtnStyle,
              color: isReviewPanelOpen ? '#38bdf8' : activeReviewCount > 0 ? '#f59e0b' : 'var(--text-muted)',
              backgroundColor: isReviewPanelOpen ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
            }}
            title="Toggle Review & Suggestions Drawer"
          >
            <MessageSquare size={12} />
            <span style={{ fontSize: 10 }}>Review</span>
            {activeReviewCount > 0 && (
              <span
                style={{
                  backgroundColor: '#f59e0b',
                  color: '#000000',
                  borderRadius: 10,
                  padding: '1px 5px',
                  fontSize: 9,
                  fontWeight: 700,
                  marginLeft: 2,
                }}
              >
                {activeReviewCount}
              </span>
            )}
          </button>

          {/* Find & Replace Bar Button */}
          <button
            type="button"
            onClick={onOpenFind}
            className="btn-ghost"
            style={{
              ...toolBtnStyle,
              color: isFindOpen ? '#38bdf8' : 'var(--text-secondary)',
              backgroundColor: isFindOpen ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
            }}
            title="Find & Replace in Document (Ctrl+F / Ctrl+H)"
          >
            <Search size={12} />
            <span style={{ fontSize: 10 }}>Find</span>
          </button>

          {/* Toggle Code Minimap */}
          <button
            type="button"
            onClick={() => {
              const next = !isMinimapOpen;
              setIsMinimapOpen(next);
              localStorage.setItem('teeex_editor_minimap', String(next));
            }}
            className="btn-ghost"
            style={{
              ...toolBtnStyle,
              color: isMinimapOpen ? '#38bdf8' : 'var(--text-secondary)',
              backgroundColor: isMinimapOpen ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
            }}
            title="Toggle Code Minimap"
          >
            <MapIcon size={12} />
            <span style={{ fontSize: 10 }}>Minimap</span>
          </button>
        </div>
      )}
    </div>
  );
});

EditorToolbar.displayName = 'EditorToolbar';

const segmentedControlStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  backgroundColor: 'var(--bg-surface-2)',
  borderRadius: 5,
  padding: 2,
  border: '1px solid var(--border-subtle)',
  height: 24,
  boxSizing: 'border-box',
  flexShrink: 0,
};

const segmentedBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0 8px',
  height: '100%',
  borderRadius: 3.5,
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
};

const activeSegmentedBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface-0)',
  color: 'var(--text-primary)',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
};

const formatGroupStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 5,
  height: 24,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const formatBtnStyle: React.CSSProperties = {
  height: '100%',
  padding: '0 7px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  transition: 'all 0.15s ease',
};

const formatDividerStyle: React.CSSProperties = {
  width: 1,
  height: 12,
  backgroundColor: 'var(--border-subtle)',
  flexShrink: 0,
};

const editorToolbarStyle: React.CSSProperties = {
  height: 38,
  backgroundColor: 'var(--bg-surface-0)',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 10px',
  flexShrink: 0,
  overflowX: 'auto',
  overflowY: 'hidden',
  whiteSpace: 'nowrap',
  gap: 8,
};

const toolBtnStyle: React.CSSProperties = {
  height: 24,
  padding: '0 7px',
  borderRadius: 5,
  color: 'var(--text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};
