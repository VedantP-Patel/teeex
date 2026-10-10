import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  FileText,
  ChevronDown,
  Zap,
  Search,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
  Map as MapIcon
} from 'lucide-react';
import type { Collaborator, Diagnostic, ReviewComment, ProjectRole, ProjectFile, TrackedChange } from '../types/latex';
import type { BibEntry } from '../services/bibtexParser';
import { extractLatexLabels } from '../services/latexParser';
import { SYNTAX_THEMES, type SyntaxTheme, highlightLatexCode } from '../services/syntaxHighlighter';
import { VisualEditor } from './VisualEditor';
import { searchLatexSnippets, type LatexSnippet } from '../services/latexSnippets';
import { findMatchingBracket } from '../services/bracketMatcher';
import { EditorMinimap } from './EditorMinimap';

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
  onAddTrackedChange: _onAddTrackedChange,
  onOpenSnippets,
  onFormatDocument,
  onOpenCommandPalette,
}) => {
  const [editorMode, setEditorMode] = useState<'code' | 'visual'>(() => {
    return (localStorage.getItem('teeex_editor_mode') as 'code' | 'visual') || 'code';
  });
  const [suggestionMode, setSuggestionMode] = useState(false);
  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(false);
  const [activeChangeId, setActiveChangeId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [currentCursorLine, setCurrentCursorLine] = useState(1);

  // LaTeX Command & Environment Snippet Autocomplete State
  const [snippetQuery, setSnippetQuery] = useState<string | null>(null);
  const [snippetStartPos, setSnippetStartPos] = useState<number | null>(null);
  const [selectedSnippetIdx, setSelectedSnippetIdx] = useState(0);

  const filteredSnippets = React.useMemo(() => {
    if (snippetQuery === null) return [];
    return searchLatexSnippets(snippetQuery);
  }, [snippetQuery]);

  // In-Editor Find & Replace State
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchWord, setMatchWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [replaceFeedback, setReplaceFeedback] = useState<string | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Compute all matches for Find & Replace
  interface MatchRange {
    start: number;
    end: number;
    line: number;
    text: string;
  }

  const findMatches = React.useMemo<MatchRange[]>(() => {
    if (!findQuery) return [];
    try {
      let patternStr = findQuery;
      if (!useRegex) {
        patternStr = patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      if (matchWord) {
        patternStr = `\\b${patternStr}\\b`;
      }
      const flags = matchCase ? 'g' : 'gi';
      const regex = new RegExp(patternStr, flags);
      const matches: MatchRange[] = [];
      let match: RegExpExecArray | null;

      let count = 0;
      while ((match = regex.exec(code)) !== null && count < 2000) {
        count++;
        const start = match.index;
        const end = match.index + match[0].length;
        const textBefore = code.slice(0, start);
        const line = textBefore.split('\n').length;
        matches.push({
          start,
          end,
          line,
          text: match[0],
        });
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
      return matches;
    } catch {
      return [];
    }
  }, [code, findQuery, matchCase, matchWord, useRegex]);

  const scrollToMatch = (m: MatchRange) => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    ta.focus();
    ta.setSelectionRange(m.start, m.end);

    const lineHeight = 21;
    const targetScroll = Math.max(0, (m.line - 4) * lineHeight);
    if (viewportRef.current) viewportRef.current.scrollTop = targetScroll;
    if (gutterRef.current) gutterRef.current.scrollTop = targetScroll;
    if (syntaxBackdropRef.current) syntaxBackdropRef.current.scrollTop = targetScroll;
  };

  const handleNextMatch = () => {
    if (findMatches.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % findMatches.length;
    setActiveMatchIndex(nextIdx);
    scrollToMatch(findMatches[nextIdx]);
  };

  const handlePrevMatch = () => {
    if (findMatches.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + findMatches.length) % findMatches.length;
    setActiveMatchIndex(prevIdx);
    scrollToMatch(findMatches[prevIdx]);
  };

  const handleReplaceCurrent = () => {
    if (role === 'viewer' || findMatches.length === 0) return;
    const curr = findMatches[activeMatchIndex] || findMatches[0];
    if (!curr) return;

    const newCode = code.substring(0, curr.start) + replaceQuery + code.substring(curr.end);
    onChange(newCode);

    setReplaceFeedback('Replaced match');
    setTimeout(() => setReplaceFeedback(null), 1500);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(curr.start, curr.start + replaceQuery.length);
      }
    }, 0);
  };

  const handleReplaceAll = () => {
    if (role === 'viewer' || findMatches.length === 0) return;
    try {
      let patternStr = findQuery;
      if (!useRegex) {
        patternStr = patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      if (matchWord) {
        patternStr = `\\b${patternStr}\\b`;
      }
      const flags = matchCase ? 'g' : 'gi';
      const regex = new RegExp(patternStr, flags);
      const replacedCount = findMatches.length;
      const newCode = code.replace(regex, replaceQuery);
      onChange(newCode);

      setReplaceFeedback(`Replaced ${replacedCount} occurrence${replacedCount > 1 ? 's' : ''}`);
      setTimeout(() => setReplaceFeedback(null), 2000);
    } catch (e: any) {
      alert('Replace All failed: ' + e.message);
    }
  };

  // Global shortcut listeners for Ctrl+F and Ctrl+H
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        const target = e.target as HTMLElement;
        const isOtherInput = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target !== textareaRef.current && target !== findInputRef.current;
        if (!isOtherInput) {
          e.preventDefault();
          if (textareaRef.current) {
            const ta = textareaRef.current;
            const selected = code.substring(ta.selectionStart, ta.selectionEnd);
            if (selected && selected.length < 100 && !selected.includes('\n')) {
              setFindQuery(selected);
            }
          }
          setIsFindOpen(true);
          setTimeout(() => findInputRef.current?.focus(), 50);
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) {
        const target = e.target as HTMLElement;
        const isOtherInput = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target !== textareaRef.current && target !== findInputRef.current;
        if (!isOtherInput) {
          e.preventDefault();
          if (textareaRef.current) {
            const ta = textareaRef.current;
            const selected = code.substring(ta.selectionStart, ta.selectionEnd);
            if (selected && selected.length < 100 && !selected.includes('\n')) {
              setFindQuery(selected);
            }
          }
          setIsFindOpen(true);
          setIsReplaceOpen(true);
          setTimeout(() => findInputRef.current?.focus(), 50);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [code]);

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

  // Tracked Changes map: line -> TrackedChange[]
  const changeMap = React.useMemo(() => {
    const map = new Map<number, TrackedChange[]>();
    trackedChanges.filter(t => t.status === 'pending').forEach(t => {
      const arr = map.get(t.line) || [];
      arr.push(t);
      map.set(t.line, arr);
    });
    return map;
  }, [trackedChanges]);

  const [autoSyncPreview, setAutoSyncPreview] = useState<boolean>(() => {
    return localStorage.getItem('teeex_auto_sync_preview') === 'true';
  });
  const lastAutoSyncedLineRef = useRef<number>(1);

  // Auto Sync: Debounced tracking when cursor line changes
  useEffect(() => {
    if (!autoSyncPreview || !onForwardSync) return;
    if (currentCursorLine === lastAutoSyncedLineRef.current) return;

    const timer = setTimeout(() => {
      lastAutoSyncedLineRef.current = currentCursorLine;
      onForwardSync(currentCursorLine);
    }, 260);

    return () => clearTimeout(timer);
  }, [autoSyncPreview, currentCursorLine, onForwardSync]);

  const [syntaxTheme, setSyntaxTheme] = useState<SyntaxTheme>(() => {
    const saved = localStorage.getItem('teeex_syntax_theme') as SyntaxTheme;
    if (saved && (saved === 'vscode' || saved === 'antigravity' || saved === 'monokai' || saved === 'dracula' || saved === 'normal')) {
      return saved;
    }
    return 'vscode';
  });
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ top: number; right: number } | null>(null);
  const [isMinimapOpen, setIsMinimapOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('teeex_editor_minimap');
    return saved !== null ? saved === 'true' : true;
  });
  const [cursorOffset, setCursorOffset] = useState<number>(0);
  const [viewportScrollTop, setViewportScrollTop] = useState<number>(0);
  const [viewportHeight, setViewportHeight] = useState<number>(600);
  const syntaxBackdropRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const themeButtonRef = useRef<HTMLButtonElement>(null);

  // Track viewport dimensions for minimap scaling
  useEffect(() => {
    const updateViewportDim = () => {
      if (viewportRef.current) {
        setViewportHeight(viewportRef.current.clientHeight);
      }
    };
    updateViewportDim();
    window.addEventListener('resize', updateViewportDim);
    return () => window.removeEventListener('resize', updateViewportDim);
  }, []);

  const toggleThemeMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isThemeMenuOpen && themeButtonRef.current) {
      const rect = themeButtonRef.current.getBoundingClientRect();
      setMenuCoords({
        top: rect.bottom + 5,
        right: Math.max(10, window.innerWidth - rect.right),
      });
    }
    setIsThemeMenuOpen(prev => !prev);
  };

  // Close theme menu on outside click or window resize
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

  // Compute matching bracket pair based on current cursor offset
  const matchingBracketPair = React.useMemo(() => {
    return findMatchingBracket(code, cursorOffset);
  }, [code, cursorOffset]);

  // Tokenize LaTeX syntax for color backdrop overlay with light/dark mode adaptation
  const highlightedHtml = React.useMemo(() => {
    if (syntaxTheme === 'normal') return '';
    return highlightLatexCode(code, syntaxTheme, isLightMode, matchingBracketPair) + (code.endsWith('\n') ? ' ' : '');
  }, [code, syntaxTheme, isLightMode, matchingBracketPair]);

  // Sync gutter scroll and minimap position
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    setViewportScrollTop(st);
    if (gutterRef.current) {
      gutterRef.current.scrollTop = st;
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
        if (viewportRef.current) viewportRef.current.scrollTop = newScrollTop;
        if (gutterRef.current) {
          gutterRef.current.scrollTop = newScrollTop;
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

  // Handle key events: Tab, Ctrl+Enter, auto-close brackets, snippet navigation, Ctrl+F, Ctrl+H, Esc
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 1. Snippet autocomplete popover keyboard navigation
    if (snippetQuery !== null && filteredSnippets.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSnippetIdx(prev => (prev + 1) % filteredSnippets.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSnippetIdx(prev => (prev - 1 + filteredSnippets.length) % filteredSnippets.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const activeSnip = filteredSnippets[selectedSnippetIdx] || filteredSnippets[0];
        if (activeSnip) {
          handleSelectSnippet(activeSnip);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSnippetQuery(null);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onCompileShortcut();
      return;
    }

    // Format Document (Shift+Alt+F)
    if (e.shiftKey && e.altKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      onFormatDocument?.();
      return;
    }

    // Command Palette (Cmd+K / Ctrl+K)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      onOpenCommandPalette?.();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      const ta = e.currentTarget;
      const selected = code.substring(ta.selectionStart, ta.selectionEnd);
      if (selected && selected.length < 100 && !selected.includes('\n')) {
        setFindQuery(selected);
      }
      setIsFindOpen(true);
      setTimeout(() => findInputRef.current?.focus(), 50);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      const ta = e.currentTarget;
      const selected = code.substring(ta.selectionStart, ta.selectionEnd);
      if (selected && selected.length < 100 && !selected.includes('\n')) {
        setFindQuery(selected);
      }
      setIsFindOpen(true);
      setIsReplaceOpen(true);
      setTimeout(() => findInputRef.current?.focus(), 50);
      return;
    }

    if (e.key === 'Escape') {
      if (snippetQuery !== null) {
        e.preventDefault();
        setSnippetQuery(null);
        return;
      }
      if (isFindOpen) {
        e.preventDefault();
        setIsFindOpen(false);
        return;
      }
    }

    // 2. Smart auto-closing pairs & selection wrapping
    if (role !== 'viewer') {
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;

      // Selection wrapping: (, [, {, ", $
      if (start !== end && ['(', '[', '{', '"', '$'].includes(e.key)) {
        e.preventDefault();
        const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', '$': '$' };
        const closeChar = pairs[e.key] || e.key;
        const selected = code.substring(start, end);
        const newCode = code.substring(0, start) + e.key + selected + closeChar + code.substring(end);
        onChange(newCode);
        setTimeout(() => {
          ta.selectionStart = start + 1;
          ta.selectionEnd = end + 1;
        }, 0);
        return;
      }

      // Pair auto-closing when no selection
      if (start === end) {
        if (['(', '[', '{', '"'].includes(e.key)) {
          e.preventDefault();
          const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"' };
          const closeChar = pairs[e.key];
          const newCode = code.substring(0, start) + e.key + closeChar + code.substring(start);
          onChange(newCode);
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = start + 1;
          }, 0);
          return;
        }

        if (e.key === '$') {
          e.preventDefault();
          const newCode = code.substring(0, start) + '$$' + code.substring(start);
          onChange(newCode);
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = start + 1;
          }, 0);
          return;
        }

        // Skip-over existing closing character
        if ([')', ']', '}', '"', '$'].includes(e.key) && code[start] === e.key) {
          e.preventDefault();
          ta.selectionStart = ta.selectionEnd = start + 1;
          return;
        }

        // Smart Backspace: delete matching pairs
        if (e.key === 'Backspace' && start > 0) {
          const charBefore = code[start - 1];
          const charAfter = code[start];
          const isPair =
            (charBefore === '(' && charAfter === ')') ||
            (charBefore === '[' && charAfter === ']') ||
            (charBefore === '{' && charAfter === '}') ||
            (charBefore === '"' && charAfter === '"') ||
            (charBefore === '$' && charAfter === '$');

          if (isPair) {
            e.preventDefault();
            const newCode = code.substring(0, start - 1) + code.substring(start + 1);
            onChange(newCode);
            setTimeout(() => {
              ta.selectionStart = ta.selectionEnd = start - 1;
            }, 0);
            return;
          }
        }

        // Environment auto-closing on Enter after \begin{...}
        if (e.key === 'Enter') {
          const lineStart = code.lastIndexOf('\n', start - 1) + 1;
          const lineBefore = code.substring(lineStart, start);
          const envMatch = lineBefore.match(/\\begin\{([a-zA-Z0-9*]+)\}(?:\[.*?\])?$/);
          if (envMatch) {
            const envName = envMatch[1];
            const textAfter = code.substring(start);
            const nextClose = `\\end{${envName}}`;
            if (!textAfter.trim().startsWith(nextClose)) {
              e.preventDefault();
              const indent = '  ';
              const insertion = `\n${indent}\n\\end{${envName}}`;
              const newCode = code.substring(0, start) + insertion + code.substring(start);
              const cursorTarget = start + 1 + indent.length;
              onChange(newCode);
              setTimeout(() => {
                ta.selectionStart = ta.selectionEnd = cursorTarget;
              }, 0);
              return;
            }
          }
        }
      }
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

  // Track cursor position and check for \cite{ and \ref{ and \command
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const pos = ta.selectionStart;
    const textBefore = code.substring(0, pos);
    const line = textBefore.split('\n').length;
    const col = pos - textBefore.lastIndexOf('\n');
    setCurrentCursorLine(line);
    setCursorOffset(pos);
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

    // Check if cursor is right after \command... (for snippet autocomplete)
    const snippetMatch = textBefore.match(/\\([a-zA-Z]{1,20})$/);
    if (snippetMatch && !textBefore.endsWith('\\cite') && !textBefore.endsWith('\\ref')) {
      setSnippetQuery(snippetMatch[1]);
      setSnippetStartPos(pos - snippetMatch[1].length - 1);
      setSelectedSnippetIdx(0);
    } else {
      setSnippetQuery(null);
    }
  };

  // Insert snippet autocomplete key
  const handleSelectSnippet = (snip: LatexSnippet) => {
    if (!textareaRef.current || snippetStartPos === null) return;
    const ta = textareaRef.current;
    const pos = ta.selectionStart;
    const newCode = code.substring(0, snippetStartPos) + snip.template + code.substring(pos);
    onChange(newCode);
    setSnippetQuery(null);

    setTimeout(() => {
      ta.focus();
      const targetPos = snippetStartPos + (snip.cursorOffset ?? snip.template.length);
      ta.selectionStart = ta.selectionEnd = targetPos;
    }, 0);
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
        <div
          style={tabStripStyle}
          className="toolbar-scrollbar"
          onWheel={(e) => {
            if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
          }}
        >
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
      <div
        style={editorToolbarStyle}
        className="editor-toolbar toolbar-scrollbar"
        onWheel={(e) => {
          if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
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

          {/* Active Co-Authors Presence Avatar Stack */}
          {peers.filter(p => p.activeFile === fileName).length > 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginLeft: 2 }}>
                {peers
                  .filter(p => p.activeFile === fileName)
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
                {peers.filter(p => p.activeFile === fileName).length} co-author{peers.filter(p => p.activeFile === fileName).length > 1 ? 's' : ''} live
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
                title="Suggesting Mode: Edits become track-change suggestions that can be accepted or rejected"
              >
                <Check size={10} />
                <span>Suggesting</span>
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

                {onOpenSnippets && (
                  <>
                    <div style={formatDividerStyle} />
                    <button
                      type="button"
                      onClick={onOpenSnippets}
                      className="format-toolbar-btn"
                      style={{ ...formatBtnStyle, color: '#a855f7' }}
                      title="LaTeX Snippets & Macro Manager (Matrices, Algorithms, TikZ, \newcommand)"
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
                      title="Format LaTeX Code (Shift+Alt+F)"
                    >
                      <CodeIcon size={11} />
                    </button>
                  </>
                )}
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
                {/* Manual Click Sync */}
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
                    transition: 'all 0.15s ease',
                    borderRight: '1px solid var(--border-subtle)',
                  }}
                  title="Manual Sync: Click to immediately scroll & pulse preview to current cursor line"
                >
                  <ArrowRight size={11} />
                  <span style={{ whiteSpace: 'nowrap' }}>Sync Preview</span>
                </button>

                {/* Auto Sync Toggle */}
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
                    transition: 'all 0.15s ease',
                  }}
                  title={
                    autoSyncPreview
                      ? 'Auto Sync is ON (Preview automatically tracks cursor position). Click to switch to manual.'
                      : 'Auto Sync is OFF (Manual click). Click to enable Auto Sync preview.'
                  }
                >
                  <Zap size={10} color={autoSyncPreview ? '#10b981' : 'var(--text-muted)'} />
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {autoSyncPreview ? 'Auto: ON' : 'Auto: OFF'}
                  </span>
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
                  transition: 'all 0.15s ease',
                }}
                title="Editor Syntax Color Theme (VS Code, Cyber Neon, Monokai, Dracula, Plain)"
              >
                <Palette size={11} color="#38bdf8" />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  Syntax: {SYNTAX_THEMES[syntaxTheme].badge}
                </span>
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
                  <div
                    style={{
                      padding: '6px 8px 6px 8px',
                      borderBottom: '1px solid var(--border-subtle)',
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Palette size={12} color="#38bdf8" />
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                        Syntax Color Theme
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      Customize code colors in editor
                    </div>
                  </div>
                  {(Object.keys(SYNTAX_THEMES) as SyntaxTheme[]).map(tKey => {
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
                          transition: 'background 0.15s ease',
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
                </div>,
                document.body
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

            {/* Review & Annotations Panel Button */}
            <button
              onClick={() => setIsReviewPanelOpen(prev => !prev)}
              className="btn-ghost"
              style={{
                ...toolBtnStyle,
                color: isReviewPanelOpen ? '#38bdf8' : (comments.filter(c => !c.resolved).length > 0 || trackedChanges.filter(t => t.status === 'pending').length > 0) ? '#f59e0b' : 'var(--text-muted)',
                backgroundColor: isReviewPanelOpen ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
              }}
              title="Toggle Review & Suggestions Drawer"
            >
              <MessageSquare size={12} />
              <span style={{ fontSize: 10 }}>Review</span>
              {(comments.filter(c => !c.resolved).length + trackedChanges.filter(t => t.status === 'pending').length) > 0 && (
                <span style={{
                  backgroundColor: '#f59e0b',
                  color: '#000000',
                  borderRadius: 10,
                  padding: '1px 5px',
                  fontSize: 9,
                  fontWeight: 700,
                  marginLeft: 2,
                }}>
                  {comments.filter(c => !c.resolved).length + trackedChanges.filter(t => t.status === 'pending').length}
                </span>
              )}
            </button>

            {/* Find & Replace Bar Button */}
            <button
              type="button"
              onClick={() => {
                setIsFindOpen(prev => {
                  const next = !prev;
                  if (next) setTimeout(() => findInputRef.current?.focus(), 50);
                  return next;
                });
              }}
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
                  ) : changeMap.get(lineNum)?.length ? (
                    <span
                      onClick={() => {
                        setIsReviewPanelOpen(true);
                        setActiveChangeId(changeMap.get(lineNum)![0].id);
                      }}
                      style={{
                        cursor: 'pointer',
                        fontSize: 10,
                        fontWeight: 800,
                        color: changeMap.get(lineNum)![0].type === 'insertion' ? '#10b981' : '#f43f5e',
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title={`Line ${lineNum}: Tracked suggestion (${changeMap.get(lineNum)![0].type})`}
                    >
                      {changeMap.get(lineNum)![0].type === 'insertion' ? '+' : '−'}
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

        {/* Scrollable Viewport */}
        <div 
          ref={viewportRef}
          style={{ position: 'relative', flex: 1, height: '100%', overflow: 'auto' }}
          onScroll={handleScroll}
        >
          {/* Relative Container that grows to content size */}
          <div style={{ position: 'relative', minHeight: '100%', minWidth: '100%', width: 'fit-content', height: 'fit-content' }}>
          {/* External Highlight Line Banner (SyncTeX Jump Flash) */}
          {highlightedLine !== null && (
            <div
              style={{
                position: 'absolute',
                top: (highlightedLine - 1) * 21 + 10,
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

          {/* Peer Selections & Highlight Ranges */}
          {peers
            .filter(p => p.activeFile === fileName)
            .map(p => {
              const startLine = p.selectionStartLine || p.cursorLine;
              const endLine = p.selectionEndLine || p.cursorLine;
              const topOffset = (startLine - 1) * 21 + 10;
              const height = (endLine - startLine + 1) * 21;
              return (
                <div
                  key={`peer-sel-${p.id}`}
                  style={{
                    position: 'absolute',
                    top: topOffset,
                    left: 0,
                    right: 0,
                    height,
                    backgroundColor: `${p.color}15`,
                    borderLeft: `2px solid ${p.color}`,
                    pointerEvents: 'none',
                    zIndex: 14,
                    transition: 'all 0.15s ease',
                  }}
                />
              );
            })}

          {/* Peer Cursors Overlay */}
          {peers
            .filter(p => p.activeFile === fileName)
            .map(p => {
              const topOffset = (p.cursorLine - 1) * 21 + 10;
              const isTyping = p.status === 'typing';
              return (
                <div
                  key={p.id}
                  style={{
                    position: 'absolute',
                    top: topOffset,
                    left: 12 + Math.min(p.cursorCol * 8, 480),
                    pointerEvents: 'none',
                    zIndex: 25,
                    transition: 'top 0.15s ease, left 0.15s ease',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 3,
                  }}
                >
                  <div
                    style={{
                      width: 2,
                      height: 20,
                      backgroundColor: p.color,
                      boxShadow: `0 0 10px ${p.color}`,
                      borderRadius: 1,
                      animation: 'peerCursorBlink 1.2s ease-in-out infinite',
                    }}
                  />
                  <div
                    style={{
                      backgroundColor: p.color,
                      color: '#ffffff',
                      fontSize: 9.5,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.45)',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      lineHeight: '13px',
                      transform: 'translateY(-6px)',
                    }}
                  >
                    <span style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(255, 255, 255, 0.25)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 7.5,
                      fontWeight: 800,
                    }}>
                      {p.avatar || p.name.substring(0, 2).toUpperCase()}
                    </span>
                    <span>{p.name}</span>
                    {isTyping && (
                      <span style={{ fontSize: 8, opacity: 0.9, fontWeight: 500, fontStyle: 'italic' }}>
                        typing...
                      </span>
                    )}
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

          {/* LaTeX Command & Environment Autocomplete Dropdown */}
          {snippetQuery !== null && filteredSnippets.length > 0 && (
            <div style={{
              position: 'absolute',
              top: Math.max(10, (currentCursorLine - 1) * 21 + 24),
              left: 40,
              zIndex: 40,
              backgroundColor: 'var(--bg-surface-1)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65)',
              maxHeight: 240,
              width: 360,
              overflowY: 'auto',
              backdropFilter: 'blur(16px)',
            }}>
              <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--bg-surface-0)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={11} color="#a855f7" />
                  <span style={{ letterSpacing: '0.04em' }}>LATEX AUTOCOMPLETE</span>
                </div>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  ↵ / Tab to insert
                </span>
              </div>
              {filteredSnippets.map((snip, idx) => {
                const isSelected = idx === selectedSnippetIdx;
                const catColor = snip.category === 'env' ? '#c084fc' :
                                 snip.category === 'math' ? '#38bdf8' :
                                 snip.category === 'structure' ? '#fbbf24' :
                                 snip.category === 'format' ? '#34d399' : '#fb7185';
                const catBg = snip.category === 'env' ? 'rgba(192, 132, 252, 0.12)' :
                              snip.category === 'math' ? 'rgba(56, 189, 248, 0.12)' :
                              snip.category === 'structure' ? 'rgba(251, 191, 36, 0.12)' :
                              snip.category === 'format' ? 'rgba(52, 211, 153, 0.12)' : 'rgba(251, 113, 133, 0.12)';
                return (
                  <div
                    key={snip.id}
                    onClick={() => handleSelectSnippet(snip)}
                    onMouseEnter={() => setSelectedSnippetIdx(idx)}
                    style={{
                      padding: '7px 10px',
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      fontSize: 11,
                      backgroundColor: isSelected ? 'var(--bg-active)' : 'transparent',
                      borderLeft: isSelected ? `3px solid ${catColor}` : '3px solid transparent',
                      transition: 'background 0.1s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 700, color: catColor, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                        {snip.label}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: 3,
                          backgroundColor: catBg,
                          color: catColor,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {snip.category}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {snip.description}
                    </div>
                  </div>
                );
              })}
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
                ...SHARED_EDITOR_METRICS,
                pointerEvents: 'none',
                zIndex: 1,
                color: SYNTAX_THEMES[syntaxTheme].colors.defaultText,
                backgroundColor: 'transparent',
              }}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          )}

          {/* Core Textarea */}
          <textarea
            ref={textareaRef}
            className="editor-code-textarea"
            value={code}
            readOnly={role === 'viewer'}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            onClick={handleSelect}
            onKeyUp={handleSelect}
            onDoubleClick={() => onForwardSync?.(currentCursorLine)}
            onScroll={(e) => {
              if (e.currentTarget.scrollTop !== 0) e.currentTarget.scrollTop = 0;
              if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0;
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            style={{
              ...textareaStyle,
              color: syntaxTheme === 'normal' ? 'var(--text-primary)' : 'transparent',
              WebkitTextFillColor: syntaxTheme === 'normal' ? 'var(--text-primary)' : 'transparent',
              caretColor: '#38bdf8',
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 2,
              cursor: role === 'viewer' ? 'default' : 'text',
              opacity: role === 'viewer' ? 0.9 : 1,
              overflow: 'hidden',
            }}
          />
          </div>

          {/* Floating Find & Replace Bar */}
          {isFindOpen && (
            <div
              style={{
                position: 'absolute',
                top: 8,
                right: isReviewPanelOpen ? 326 : 14,
                zIndex: 42,
                backgroundColor: 'var(--bg-surface-1)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                backdropFilter: 'blur(16px)',
                animation: 'modalContent 0.18s var(--ease-spring) forwards',
                minWidth: 350,
                maxWidth: 'calc(100% - 28px)',
              }}
            >
              {/* Row 1: Search Input + Mode Toggles + Navigation + Close */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Expand/Collapse Replace Chevron */}
                <button
                  type="button"
                  onClick={() => setIsReplaceOpen(prev => !prev)}
                  className="btn-ghost"
                  style={{ padding: '2px 4px', color: isReplaceOpen ? '#38bdf8' : 'var(--text-muted)' }}
                  title={isReplaceOpen ? 'Collapse Replace field' : 'Expand Replace field (Ctrl+H)'}
                >
                  <ChevronDown
                    size={13}
                    style={{
                      transform: isReplaceOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 0.15s ease',
                    }}
                  />
                </button>

                {/* Search Input Box */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flex: 1,
                    backgroundColor: 'var(--bg-surface-0)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 4,
                    padding: '3px 8px',
                    gap: 6,
                    minWidth: 0,
                  }}
                >
                  <Search size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  <input
                    ref={findInputRef}
                    type="text"
                    placeholder="Find (Enter: next, Shift+Enter: prev)..."
                    value={findQuery}
                    onChange={e => {
                      setFindQuery(e.target.value);
                      setActiveMatchIndex(0);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (e.shiftKey) handlePrevMatch();
                        else handleNextMatch();
                      } else if (e.key === 'Escape') {
                        setIsFindOpen(false);
                        textareaRef.current?.focus();
                      }
                    }}
                    style={{
                      flex: 1,
                      background: 'none',
                      border: 'none',
                      outline: 'none',
                      fontSize: 11.5,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      minWidth: 0,
                    }}
                  />

                  {/* Match Count Badge */}
                  {findQuery && (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        color: findMatches.length > 0 ? '#10b981' : '#f43f5e',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {findMatches.length > 0 ? `${activeMatchIndex + 1} of ${findMatches.length}` : '0 results'}
                    </span>
                  )}
                </div>

                {/* Search Modifiers: Aa (Case), \b (Word), .* (Regex) */}
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => setMatchCase(prev => !prev)}
                    style={{
                      padding: '2px 5px',
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 3,
                      border: `1px solid ${matchCase ? '#38bdf8' : 'transparent'}`,
                      backgroundColor: matchCase ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                      color: matchCase ? '#38bdf8' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                    title="Match Case"
                  >
                    Aa
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatchWord(prev => !prev)}
                    style={{
                      padding: '2px 5px',
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 3,
                      border: `1px solid ${matchWord ? '#38bdf8' : 'transparent'}`,
                      backgroundColor: matchWord ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                      color: matchWord ? '#38bdf8' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                    title="Match Whole Word"
                  >
                    \b
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseRegex(prev => !prev)}
                    style={{
                      padding: '2px 5px',
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 3,
                      border: `1px solid ${useRegex ? '#38bdf8' : 'transparent'}`,
                      backgroundColor: useRegex ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                      color: useRegex ? '#38bdf8' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                    title="Regular Expression"
                  >
                    .*
                  </button>
                </div>

                {/* Arrows: Previous / Next Match */}
                <button
                  type="button"
                  onClick={handlePrevMatch}
                  disabled={findMatches.length === 0}
                  className="btn-ghost"
                  style={{ padding: '3px 4px', color: findMatches.length > 0 ? 'var(--text-primary)' : 'var(--text-faint)' }}
                  title="Previous Match (Shift+Enter)"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  onClick={handleNextMatch}
                  disabled={findMatches.length === 0}
                  className="btn-ghost"
                  style={{ padding: '3px 4px', color: findMatches.length > 0 ? 'var(--text-primary)' : 'var(--text-faint)' }}
                  title="Next Match (Enter)"
                >
                  <ArrowDown size={12} />
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsFindOpen(false);
                    textareaRef.current?.focus();
                  }}
                  className="btn-ghost"
                  style={{ padding: '3px 4px', color: 'var(--text-muted)' }}
                  title="Close (Esc)"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Row 2: Replace Input + Action Buttons */}
              {isReplaceOpen && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ width: 18 }} />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flex: 1,
                      backgroundColor: 'var(--bg-surface-0)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 4,
                      padding: '3px 8px',
                      minWidth: 0,
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Replace with..."
                      value={replaceQuery}
                      onChange={e => setReplaceQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleReplaceCurrent();
                        } else if (e.key === 'Escape') {
                          setIsFindOpen(false);
                          textareaRef.current?.focus();
                        }
                      }}
                      style={{
                        flex: 1,
                        background: 'none',
                        border: 'none',
                        outline: 'none',
                        fontSize: 11.5,
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        minWidth: 0,
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleReplaceCurrent}
                    disabled={role === 'viewer' || findMatches.length === 0}
                    className="btn-secondary"
                    style={{ fontSize: 10.5, padding: '3px 8px' }}
                    title="Replace current match"
                  >
                    Replace
                  </button>

                  <button
                    type="button"
                    onClick={handleReplaceAll}
                    disabled={role === 'viewer' || findMatches.length === 0}
                    className="btn-primary"
                    style={{ fontSize: 10.5, padding: '3px 8px' }}
                    title="Replace all matching occurrences"
                  >
                    Replace All
                  </button>

                  {replaceFeedback && (
                    <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>
                      {replaceFeedback}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Floating Review & Suggestions Drawer */}
          {isReviewPanelOpen && (
            <div style={{
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
              animation: 'modalContent 0.2s var(--ease-spring) forwards',
            }}>
              {/* Drawer Header */}
              <div style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--bg-surface-0)',
              }}>
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

              {/* Drawer Content */}
              <div style={{ flex: 1, padding: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Section 1: Pending Tracked Changes */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                    Tracked Suggestions ({trackedChanges.filter(t => t.status === 'pending').length})
                  </div>

                  {trackedChanges.filter(t => t.status === 'pending').length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 8px' }}>
                      No pending suggestions.
                    </div>
                  ) : (
                    trackedChanges.filter(t => t.status === 'pending').map(t => (
                      <div
                        key={t.id}
                        style={{
                          padding: 8,
                          backgroundColor: activeChangeId === t.id ? 'rgba(56, 189, 248, 0.08)' : 'var(--bg-surface-0)',
                          border: `1px solid ${activeChangeId === t.id ? '#38bdf8' : 'var(--border-subtle)'}`,
                          borderRadius: 'var(--radius-sm)',
                          marginBottom: 6,
                          fontSize: 11,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: t.authorColor }} />
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.authorName}</span>
                          </div>
                          <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Line {t.line}</span>
                        </div>

                        {/* Diff Box */}
                        <div style={{
                          padding: '4px 6px',
                          borderRadius: 3,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10.5,
                          backgroundColor: t.type === 'insertion' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                          color: t.type === 'insertion' ? '#10b981' : '#f43f5e',
                          border: `1px solid ${t.type === 'insertion' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
                          marginBottom: 6,
                          textDecoration: t.type === 'deletion' ? 'line-through' : 'none',
                        }}>
                          {t.type === 'insertion' ? `+ ${t.text}` : `- ${t.text}`}
                        </div>

                        {/* Accept / Reject Buttons */}
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

                {/* Section 2: Review Comments */}
                <div style={{ marginTop: 6, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                    Review Comments ({comments.filter(c => !c.resolved).length})
                  </div>

                  {comments.filter(c => !c.resolved).length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 8px' }}>
                      No active comments.
                    </div>
                  ) : (
                    comments.filter(c => !c.resolved).map(c => (
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
                            <div style={{
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
                            }}>
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
        </div>

        {/* Canvas Code Minimap */}
        {isMinimapOpen && (
          <EditorMinimap
            code={code}
            theme={syntaxTheme}
            isLightMode={isLightMode}
            scrollTop={viewportScrollTop}
            viewportHeight={viewportHeight}
            totalContentHeight={Math.max(viewportHeight, lines.length * 21 + 40)}
            onScrollTo={(target) => {
              if (viewportRef.current) viewportRef.current.scrollTop = target;
            }}
          />
        )}
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

/**
 * Strict Shared Monospace Typography & Padding Metrics
 * Guarantees zero-drift pixel alignment between transparent textarea caret and syntax backdrop spans.
 */
const SHARED_EDITOR_METRICS: React.CSSProperties = {
  fontFamily: 'var(--font-mono, "JetBrains Mono", Consolas, "Courier New", monospace)',
  fontSize: 13,
  lineHeight: '21px',
  fontWeight: 400,
  fontStyle: 'normal',
  letterSpacing: '0px',
  wordSpacing: '0px',
  fontVariantLigatures: 'none',
  fontFeatureSettings: '"liga" 0, "calt" 0',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  textRendering: 'auto',
  whiteSpace: 'pre',
  tabSize: 2,
  MozTabSize: 2,
  overflowWrap: 'normal',
  wordBreak: 'normal',
  boxSizing: 'border-box',
  padding: '10px 14px',
  margin: 0,
  border: 'none',
  outline: 'none',
};

const textareaStyle: React.CSSProperties = {
  ...SHARED_EDITOR_METRICS,
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: 'transparent',
  resize: 'none',
  overflowX: 'auto',
  overflowY: 'auto',
  borderRadius: 0,
  boxShadow: 'none',
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
