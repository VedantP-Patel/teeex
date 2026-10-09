import React, { useRef, useEffect, useState } from 'react';
import {
  Bold,
  Italic,
  Sigma,
  Quote,
  List,
  MessageSquarePlus,
  Check,
  X,
  MessageSquare,
  BookMarked,
  Eye,
  Code as CodeIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowRight,
  Tag,
  Edit3,
  Palette,
  FileText
} from 'lucide-react';
import type { Collaborator, Diagnostic, ReviewComment, ProjectRole, ProjectFile, TrackedChange } from '../types/latex';
import type { BibEntry } from '../services/bibtexParser';
import { extractLatexLabels } from '../services/latexParser';
import { SYNTAX_THEMES, type SyntaxTheme, highlightLatexCode } from '../services/syntaxHighlighter';
import { VisualEditor } from './VisualEditor';

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
  onAcceptTrackedChange: _onAcceptTrackedChange,
  onRejectTrackedChange: _onRejectTrackedChange,
}) => {
  const [editorMode, setEditorMode] = useState<'code' | 'visual'>(() => {
    return (localStorage.getItem('teeex_editor_mode') as 'code' | 'visual') || 'code';
  });
  const [suggestionMode, setSuggestionMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [currentCursorLine, setCurrentCursorLine] = useState(1);

  // Citation Autocomplete state
  const [citeQuery, setCiteQuery] = useState<string | null>(null);
  const [citeStartPos, setCiteStartPos] = useState<number>(0);

  // Label Autocomplete state (\ref{})
  const [refQuery, setRefQuery] = useState<string | null>(null);
  const [refStartPos, setRefStartPos] = useState<number>(0);

  const labels = React.useMemo(() => extractLatexLabels(files), [files]);
  const filteredLabels = React.useMemo(() => {
    if (refQuery === null) return [];
    if (!refQuery) return labels.slice(0, 8);
    return labels.filter(l => l.key.toLowerCase().includes(refQuery) || l.caption?.toLowerCase().includes(refQuery)).slice(0, 8);
  }, [labels, refQuery]);

  const lines = code.split('\n');

  // Gutter diagnostics map: line -> Diagnostic
  const diagMap = new Map<number, Diagnostic>();
  diagnostics.forEach(d => {
    if (!diagMap.has(d.line)) diagMap.set(d.line, d);
  });

  // Comments map: line -> ReviewComment[]
  const commentMap = new Map<number, ReviewComment[]>();
  comments.filter(c => !c.resolved).forEach(c => {
    const arr = commentMap.get(c.line) || [];
    arr.push(c);
    commentMap.set(c.line, arr);
  });

  const [syntaxTheme, setSyntaxTheme] = useState<SyntaxTheme>(() => {
    return (localStorage.getItem('teeex_syntax_theme') as SyntaxTheme) || 'antigravity';
  });
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const syntaxBackdropRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Close theme menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    if (isThemeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isThemeMenuOpen]);

  const [isLightMode, setIsLightMode] = useState<boolean>(() => {
    return document.documentElement.getAttribute('data-theme') === 'light';
  });

  // Track theme changes dynamically
  useEffect(() => {
    const checkTheme = () => {
      setIsLightMode(document.documentElement.getAttribute('data-theme') === 'light');
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Tokenize LaTeX syntax for color backdrop overlay with light/dark mode adaptation
  const highlightedHtml = React.useMemo(() => {
    if (syntaxTheme === 'normal') return '';
    return highlightLatexCode(code, syntaxTheme, isLightMode) + (code.endsWith('\n') ? ' ' : '');
  }, [code, syntaxTheme, isLightMode]);

  // Sync gutter scroll and overlay position
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const st = e.currentTarget.scrollTop;
    const sl = e.currentTarget.scrollLeft;
    setScrollTop(st);
    if (gutterRef.current) {
      gutterRef.current.scrollTop = st;
    }
    if (syntaxBackdropRef.current) {
      syntaxBackdropRef.current.scrollTop = st;
      syntaxBackdropRef.current.scrollLeft = sl;
    }
  };

  // Scroll to target line if triggered externally (SyncTeX)
  useEffect(() => {
    if (targetLine) {
      if (editorMode !== 'code') {
        setEditorMode('code');
      }

      // Allow DOM to update if mode switched
      const timerId = setTimeout(() => {
        if (!textareaRef.current) return;
        const textarea = textareaRef.current;
        const targetCharPos = targetLine === 1 ? 0 : lines.slice(0, targetLine - 1).join('\n').length + 1;
        const lineContent = lines[targetLine - 1] || '';
        const lineEndPos = targetCharPos + lineContent.length;

        textarea.focus();
        textarea.setSelectionRange(targetCharPos, lineEndPos);

        // Accurate scroll calculation
        const lineHeight = 21;
        const newScrollTop = Math.max(0, (targetLine - 5) * lineHeight);
        textarea.scrollTop = newScrollTop;
        setScrollTop(newScrollTop);
        if (gutterRef.current) {
          gutterRef.current.scrollTop = newScrollTop;
        }
        if (syntaxBackdropRef.current) {
          syntaxBackdropRef.current.scrollTop = newScrollTop;
          syntaxBackdropRef.current.scrollLeft = 0;
        }

        // Flash highlight line for 3 seconds
        setHighlightedLine(targetLine);
      }, editorMode !== 'code' ? 50 : 0);

      const timer = setTimeout(() => {
        setHighlightedLine(null);
      }, 3000);

      onClearTargetLine();
      return () => {
        clearTimeout(timerId);
        clearTimeout(timer);
      };
    }
  }, [targetLine, lines, onClearTargetLine, editorMode]);

  // Handle key events: Tab, Ctrl+Enter, auto-close brackets
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onCompileShortcut();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;

      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      onChange(newCode);

      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      }, 0);
    }
  };

  // Track cursor position and check for \cite{
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const pos = ta.selectionStart;
    const textBefore = code.substring(0, pos);
    const line = textBefore.split('\n').length;
    const col = pos - textBefore.lastIndexOf('\n');
    setCurrentCursorLine(line);
    onCursorChange(line, col);

    // Check if cursor is right after \cite{...
    const citeMatch = textBefore.match(/\\cite\{([a-zA-Z0-9_-]*)$/);
    if (citeMatch) {
      setCiteQuery(citeMatch[1].toLowerCase());
      setCiteStartPos(pos - citeMatch[1].length);
    } else {
      setCiteQuery(null);
    }

    // Check if cursor is right after \ref{...
    const refMatch = textBefore.match(/\\ref\{([a-zA-Z0-9_:-]*)$/);
    if (refMatch) {
      setRefQuery(refMatch[1].toLowerCase());
      setRefStartPos(pos - refMatch[1].length);
    } else {
      setRefQuery(null);
    }
  };

  // Insert citation autocomplete key
  const handleSelectCiteKey = (key: string) => {
    if (!textareaRef.current || citeStartPos === null) return;
    const ta = textareaRef.current;
    const pos = ta.selectionStart;
    const newCode = code.substring(0, citeStartPos) + key + '}' + code.substring(pos);
    onChange(newCode);
    setCiteQuery(null);

    setTimeout(() => {
      ta.focus();
      const nextPos = citeStartPos + key.length + 1;
      ta.selectionStart = ta.selectionEnd = nextPos;
    }, 0);
  };

  // Insert cross-reference label autocomplete key
  const handleSelectRefKey = (key: string) => {
    if (!textareaRef.current || refStartPos === null) return;
    const ta = textareaRef.current;
    const pos = ta.selectionStart;
    const newCode = code.substring(0, refStartPos) + key + '}' + code.substring(pos);
    onChange(newCode);
    setRefQuery(null);

    setTimeout(() => {
      ta.focus();
      const nextPos = refStartPos + key.length + 1;
      ta.selectionStart = ta.selectionEnd = nextPos;
    }, 0);
  };

  // Quick insertion helpers
  const insertSnippet = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = code.substring(start, end);

    const replacement = prefix + selected + suffix;
    const newCode = code.substring(0, start) + replacement + code.substring(end);
    onChange(newCode);

    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + prefix.length;
      ta.selectionEnd = start + prefix.length + selected.length;
    }, 0);
  };

  const submitComment = () => {
    if (!commentDraft.trim() || activeCommentLine === null) return;
    onAddComment(activeCommentLine, commentDraft.trim());
    setCommentDraft('');
    setActiveCommentLine(null);
  };

  // Filtered BibTeX citations
  const filteredCitations = bibEntries.filter(b => {
    if (!citeQuery) return true;
    return b.key.toLowerCase().includes(citeQuery) ||
           b.title.toLowerCase().includes(citeQuery) ||
           b.author.toLowerCase().includes(citeQuery);
  });

  return (
    <div style={editorContainerStyle}>
      {/* Multi-File Tab Bar */}
      {openFileIds && openFileIds.length > 0 && onSelectFile && (
        <div style={tabStripStyle}>
          {openFileIds.map(fId => {
            const f = files.find(file => file.id === fId);
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

      {/* Viewer Notice Ribbon */}
      {role === 'viewer' && (
        <div style={viewerNoticeStyle}>
          <Eye size={13} color="#f59e0b" style={{ flexShrink: 0 }} />
          <span>
            <strong>Viewer Mode (Read-Only):</strong> You can review LaTeX code and leave inline review comments. Editing and compilation are locked.
          </span>
        </div>
      )}

      {/* Editor Sub-Header Toolbar */}
      <div style={editorToolbarStyle} className="editor-toolbar no-scrollbar">
        {/* Left Controls: Sidebar toggle, Code/Visual switcher, File Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {/* Sidebar Toggle Button */}
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
              title={isSidebarOpen ? 'Collapse files sidebar (maximizes editor & preview)' : 'Expand files sidebar'}
            >
              {isSidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeftOpen size={12} />}
            </button>
          )}

          {/* Overleaf-Style Code vs Visual Segmented Switch */}
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
              title="Code Editor: Raw LaTeX source with syntax highlighting"
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
            <FileText size={11} color="#38bdf8" />
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              {fileName}
            </span>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              • {lines.length} lines
            </span>
          </div>

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

        {/* Right Controls: Quick Formatting Snippets, Edit/Suggest, Sync Preview, Syntax Theme */}
        {editorMode === 'code' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {role !== 'viewer' && (
              <div style={formatGroupStyle}>
                <button
                  type="button"
                  onClick={() => insertSnippet('\\textbf{', '}')}
                  className="format-toolbar-btn"
                  style={formatBtnStyle}
                  title="Bold (\textbf{})"
                >
                  <Bold size={11} />
                </button>

                <div style={formatDividerStyle} />

                <button
                  type="button"
                  onClick={() => insertSnippet('\\textit{', '}')}
                  className="format-toolbar-btn"
                  style={formatBtnStyle}
                  title="Italic (\textit{})"
                >
                  <Italic size={11} />
                </button>

                <div style={formatDividerStyle} />

                <button
                  type="button"
                  onClick={() => insertSnippet('\\begin{equation}\n  ', '\n\\end{equation}')}
                  className="format-toolbar-btn"
                  style={formatBtnStyle}
                  title="Display Equation"
                >
                  <Sigma size={11} />
                </button>

                <div style={formatDividerStyle} />

                <button
                  type="button"
                  onClick={() => insertSnippet('\\frac{', '}{}')}
                  className="format-toolbar-btn"
                  style={formatBtnStyle}
                  title="Fraction (\frac{}{})"
                >
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>a/b</span>
                </button>

                <div style={formatDividerStyle} />

                <button
                  type="button"
                  onClick={() => insertSnippet('\\cite{', '}')}
                  className="format-toolbar-btn"
                  style={formatBtnStyle}
                  title="Citation (\cite{})"
                >
                  <Quote size={11} />
                </button>

                <div style={formatDividerStyle} />

                <button
                  type="button"
                  onClick={() => insertSnippet('\\begin{itemize}\n  \\item ', '\n\\end{itemize}')}
                  className="format-toolbar-btn"
                  style={formatBtnStyle}
                  title="Itemize List"
                >
                  <List size={11} />
                </button>
              </div>
            )}

            {/* Suggestion / Track Changes Mode Switch */}
            <button
              type="button"
              onClick={() => setSuggestionMode(!suggestionMode)}
              style={{
                height: 24,
                padding: '0 8px',
                fontSize: 10.5,
                fontWeight: 500,
                borderRadius: 5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
                color: suggestionMode ? '#10b981' : 'var(--text-secondary)',
                backgroundColor: suggestionMode ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-surface-1)',
                border: suggestionMode ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-subtle)',
                transition: 'all 0.15s ease',
              }}
              title={suggestionMode ? 'Switch to Direct Edit mode' : 'Switch to Suggestion / Track Changes mode'}
            >
              <Edit3 size={11} />
              <span style={{ whiteSpace: 'nowrap' }}>{suggestionMode ? 'Suggesting' : 'Edit'}</span>
              {trackedChanges.length > 0 && (
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
                  {trackedChanges.length}
                </span>
              )}
            </button>

            {/* Forward SyncTeX Button */}
            {onForwardSync && (
              <button
                type="button"
                onClick={() => onForwardSync(currentCursorLine)}
                style={{
                  height: 24,
                  padding: '0 8px',
                  fontSize: 10.5,
                  fontWeight: 500,
                  color: '#38bdf8',
                  backgroundColor: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: 5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Forward Sync: Center and pulse preview on current cursor line"
              >
                <ArrowRight size={11} />
                <span style={{ whiteSpace: 'nowrap' }}>Sync Preview</span>
              </button>
            )}

            {/* Syntax Theme Switcher */}
            <div ref={themeMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
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
                  border: '1px solid var(--border-medium)',
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Syntax Highlight Theme (Antigravity Neon, VS Code, Monokai, Dracula, Normal)"
              >
                <Palette size={11} color="#38bdf8" />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  {SYNTAX_THEMES[syntaxTheme].badge}
                </span>
                <span style={{ display: 'flex', gap: 2.5, alignItems: 'center', marginLeft: 2 }}>
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
              </button>

              {isThemeMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    zIndex: 50,
                    backgroundColor: 'var(--bg-surface-1)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45)',
                    width: 250,
                    padding: 4,
                  }}
                >
                  <div
                    style={{
                      padding: '6px 8px',
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    Syntax Highlight Theme
                  </div>
                  {(Object.keys(SYNTAX_THEMES) as SyntaxTheme[]).map(tKey => {
                    const th = SYNTAX_THEMES[tKey];
                    const isSelected = syntaxTheme === tKey;
                    return (
                      <div
                        key={tKey}
                        onClick={() => {
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
                        className="hover:bg-active"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {th.previewColors.map((c, i) => (
                              <span
                                key={i}
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  backgroundColor: c,
                                  display: 'inline-block',
                                }}
                              />
                            ))}
                          </div>
                          <span
                            style={{
                              fontSize: 11.5,
                              fontWeight: isSelected ? 700 : 500,
                              color: isSelected ? '#38bdf8' : 'var(--text-primary)',
                            }}
                          >
                            {th.label}
                          </span>
                        </div>
                        {isSelected && <Check size={12} color="#38bdf8" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={() => setActiveCommentLine(currentCursorLine)}
              className="btn-ghost"
              style={{ ...toolBtnStyle, color: '#f59e0b' }}
              title="Add inline review comment at cursor"
            >
              <MessageSquarePlus size={13} />
              <span style={{ fontSize: 10 }}>Comment</span>
            </button>
          </div>
        )}
      </div>

      {/* RENDER VISUAL OR CODE EDITOR */}
      {editorMode === 'visual' ? (
        <VisualEditor
          code={code}
          fileName={fileName}
          onChange={onChange}
          files={files}
          bibEntries={bibEntries}
          role={role}
          peers={peers}
          onSwitchToCode={() => {
            setEditorMode('code');
            localStorage.setItem('teeex_editor_mode', 'code');
          }}
        />
      ) : (
        /* Editor Body: Line Gutters + Code Area */
        <div style={editorBodyStyle}>
        {/* Line Numbers & Diagnostic Gutters */}
        <div ref={gutterRef} style={gutterStyle}>
          {lines.map((_, idx) => {
            const lineNum = idx + 1;
            const diag = diagMap.get(lineNum);
            const lineComments = commentMap.get(lineNum);
            const peerHere = peers.find(p => p.activeFile === fileName && p.cursorLine === lineNum);
            const isHighlighted = highlightedLine === lineNum;

            return (
              <div
                key={lineNum}
                style={{
                  ...gutterRowStyle,
                  backgroundColor: isHighlighted ? 'rgba(56, 189, 248, 0.28)' : 'transparent',
                  boxShadow: isHighlighted ? 'inset 3px 0 0 #38bdf8' : 'none',
                  transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
                }}
              >
                {/* Diagnostic Marker or Comment Icon */}
                <div style={markerAreaStyle}>
                  {diag ? (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        backgroundColor: diag.severity === 'error' ? '#f43f5e' : diag.severity === 'warning' ? '#f59e0b' : '#38bdf8',
                        display: 'inline-block',
                      }}
                      title={`Line ${lineNum}: ${diag.message}`}
                    />
                  ) : lineComments && lineComments.length > 0 ? (
                    <span
                      onClick={() => setActiveCommentLine(lineNum)}
                      style={{ cursor: 'pointer', display: 'flex' }}
                      title={`${lineComments.length} comment(s) on line ${lineNum}`}
                    >
                      <MessageSquare size={10} color="#f59e0b" />
                    </span>
                  ) : null}
                </div>

                {/* Line Number */}
                <span style={{
                  color: isHighlighted
                    ? '#38bdf8'
                    : diag
                    ? (diag.severity === 'error' ? '#f43f5e' : '#f59e0b')
                    : 'var(--text-muted)',
                  fontWeight: isHighlighted || diag ? 700 : 400
                }}>
                  {lineNum}
                </span>

                {/* Multiplayer Cursor Line Indicator */}
                {peerHere && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      width: 2,
                      height: '100%',
                      backgroundColor: peerHere.color,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Textarea Input & Multiplayer Floating Overlay */}
        <div style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden' }}>
          {/* External Highlight Line Banner (SyncTeX Jump Flash) */}
          {highlightedLine !== null && (
            <div
              style={{
                position: 'absolute',
                top: (highlightedLine - 1) * 21 + 10 - scrollTop,
                left: 0,
                right: 0,
                height: 21,
                backgroundColor: 'rgba(56, 189, 248, 0.16)',
                borderLeft: '3px solid #38bdf8',
                boxShadow: '0 0 12px rgba(56, 189, 248, 0.25)',
                pointerEvents: 'none',
                zIndex: 15,
                transition: 'opacity 0.3s ease',
              }}
            />
          )}

          {/* Peer Cursors Overlay */}
          {peers
            .filter(p => p.activeFile === fileName)
            .map(p => {
              const topOffset = (p.cursorLine - 1) * 21 + 10 - scrollTop;
              return (
                <div
                  key={p.id}
                  style={{
                    position: 'absolute',
                    top: topOffset,
                    left: 12 + Math.min(p.cursorCol * 8, 400),
                    pointerEvents: 'none',
                    zIndex: 20,
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <div
                    style={{
                      width: 2,
                      height: 18,
                      backgroundColor: p.color,
                      boxShadow: `0 0 8px ${p.color}`,
                    }}
                  />
                  <div
                    style={{
                      backgroundColor: p.color,
                      color: '#ffffff',
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 3,
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.4)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.name}
                  </div>
                </div>
              );
            })}

          {/* BibTeX Citation Autocomplete Dropdown */}
          {citeQuery !== null && filteredCitations.length > 0 && (
            <div style={{
              position: 'absolute',
              top: Math.max(10, (currentCursorLine - 1) * 21 + 24),
              left: 40,
              zIndex: 35,
              backgroundColor: 'var(--bg-surface-1)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              maxHeight: 180,
              width: 320,
              overflowY: 'auto',
            }}>
              <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <BookMarked size={12} color="#38bdf8" />
                <span>BIBTEX CITATION AUTOCOMPLETE</span>
              </div>
              {filteredCitations.map(b => (
                <div
                  key={b.key}
                  onClick={() => handleSelectCiteKey(b.key)}
                  style={{
                    padding: '6px 8px',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                  className="hover:bg-active"
                >
                  <div style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    \\cite{`{${b.key}}`}
                  </div>
                  <div style={{ color: 'var(--text-primary)', fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {b.title}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9.5 }}>
                    {b.author} ({b.year})
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cross-Reference \ref{} Autocomplete Dropdown */}
          {refQuery !== null && filteredLabels.length > 0 && (
            <div style={{
              position: 'absolute',
              top: Math.max(10, (currentCursorLine - 1) * 21 + 24),
              left: 40,
              zIndex: 35,
              backgroundColor: 'var(--bg-surface-1)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              maxHeight: 180,
              width: 320,
              overflowY: 'auto',
            }}>
              <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Tag size={12} color="#10b981" />
                <span>CROSS-REFERENCE LABEL AUTOCOMPLETE</span>
              </div>
              {filteredLabels.map(l => (
                <div
                  key={l.key}
                  onClick={() => handleSelectRefKey(l.key)}
                  style={{
                    padding: '6px 8px',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                  className="hover:bg-active"
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                      \ref&#123;{l.key}&#125;
                    </span>
                    <span className="badge badge-emerald" style={{ fontSize: 9 }}>
                      {l.type}
                    </span>
                  </div>
                  {l.caption && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: 10.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {l.caption}
                    </div>
                  )}
                  <div style={{ color: 'var(--text-muted)', fontSize: 9.5 }}>
                    {l.fileName} : line {l.line}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active Comment Bubble Overlay */}
          {activeCommentLine !== null && (
            <div style={{
              position: 'absolute',
              top: Math.max(10, (activeCommentLine - 1) * 21 - 10),
              right: 20,
              zIndex: 30,
              backgroundColor: 'var(--bg-surface-1)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              padding: 10,
              width: 260,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>
                  Comment on Line {activeCommentLine}
                </span>
                <button onClick={() => setActiveCommentLine(null)} className="btn-ghost" style={{ padding: 2 }}>
                  <X size={12} />
                </button>
              </div>

              {/* Existing Comments on this line */}
              {(commentMap.get(activeCommentLine) || []).map(c => (
                <div key={c.id} style={{
                  padding: '6px 8px',
                  backgroundColor: 'var(--bg-surface-0)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  marginBottom: 6,
                  fontSize: 11,
                }}>
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

              {/* New Comment Input */}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  type="text"
                  placeholder="Leave comment..."
                  value={commentDraft}
                  onChange={e => setCommentDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitComment()}
                  style={{ flex: 1, padding: '4px 8px', fontSize: 11 }}
                  autoFocus
                />
                <button onClick={submitComment} className="btn-primary" style={{ padding: '4px 8px', fontSize: 11 }}>
                  Post
                </button>
              </div>
            </div>
          )}

          {/* Syntax Highlighting Token Backdrop */}
          {syntaxTheme !== 'normal' && (
            <div
              ref={syntaxBackdropRef}
              aria-hidden="true"
              className="syntax-backdrop"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                padding: '10px 14px',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                lineHeight: '21px',
                whiteSpace: 'pre',
                overflow: 'hidden',
                pointerEvents: 'none',
                zIndex: 1,
                color: SYNTAX_THEMES[syntaxTheme].colors.defaultText,
                boxSizing: 'border-box',
                tabSize: 2,
              }}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          )}

          {/* Core Textarea */}
          <textarea
            ref={textareaRef}
            value={code}
            readOnly={role === 'viewer'}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            onClick={handleSelect}
            onKeyUp={handleSelect}
            onDoubleClick={() => onForwardSync?.(currentCursorLine)}
            onScroll={handleScroll}
            spellCheck={false}
            style={{
              ...textareaStyle,
              color: syntaxTheme === 'normal' ? 'var(--text-primary)' : 'transparent',
              caretColor: '#38bdf8',
              position: 'relative',
              zIndex: 2,
              cursor: role === 'viewer' ? 'default' : 'text',
              opacity: role === 'viewer' ? 0.9 : 1,
            }}
          />
        </div>
      </div>
      )}
    </div>
  );
};

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

const editorContainerStyle: React.CSSProperties = {
  flex: 1,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'var(--bg-app)',
  overflow: 'hidden',
  transition: 'background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
};

const editorToolbarStyle: React.CSSProperties = {
  height: 36,
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
  transition: 'background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
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

const editorBodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
  position: 'relative',
};

const gutterStyle: React.CSSProperties = {
  width: 54,
  backgroundColor: 'var(--bg-surface-0)',
  borderRight: '1px solid var(--border-subtle)',
  paddingTop: 10,
  userSelect: 'none',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  lineHeight: '21px',
  overflow: 'hidden',
  flexShrink: 0,
};

const gutterRowStyle: React.CSSProperties = {
  height: 21,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  paddingRight: 8,
  position: 'relative',
};

const markerAreaStyle: React.CSSProperties = {
  position: 'absolute',
  left: 6,
  display: 'flex',
  alignItems: 'center',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  lineHeight: '21px',
  padding: '10px 14px',
  resize: 'none',
  whiteSpace: 'pre',
  overflowWrap: 'normal',
  overflowX: 'auto',
  tabSize: 2,
};

const tabStripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  backgroundColor: 'var(--bg-surface-0)',
  borderBottom: '1px solid var(--border-subtle)',
  overflowX: 'auto',
  scrollbarWidth: 'none',
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
