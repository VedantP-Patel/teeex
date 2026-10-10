import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  FileCode,
  FileText,
  Play,
  Download,
  Columns,
  Moon,
  Sun,
  BookOpen,
  BarChart2,
  History,
  Grid,
  Check,
  Code,
  Table,
  FolderKanban
} from 'lucide-react';
import type { ProjectFile } from '../../types/latex';
import { PAPER_FORMATS, type PaperFormatId } from '../../services/paperFormats';

export interface CommandItem {
  id: string;
  category: 'Commands' | 'Academic Formats' | 'Files' | 'Sections';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  onExecute: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  files: ProjectFile[];
  onSelectFile: (fileId: string) => void;
  onCompile: () => void;
  onFormatDocument: () => void;
  onToggleTwoColumn: () => void;
  isTwoColumn: boolean;
  activeFormat: PaperFormatId;
  onSelectFormat: (format: PaperFormatId) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onExportPdf: () => void;
  onExportZip: () => void;
  onOpenWordCount: () => void;
  onOpenHistory: () => void;
  onOpenProjectsHub: () => void;
  onOpenSymbols: () => void;
  onOpenTableBuilder: () => void;
  sections?: Array<{ title: string; line: number; level: number }>;
  onJumpToLine: (line: number) => void;
}

export const CommandPaletteModal: React.FC<Props> = ({
  isOpen,
  onClose,
  files,
  onSelectFile,
  onCompile,
  onFormatDocument,
  onToggleTwoColumn,
  isTwoColumn,
  activeFormat,
  onSelectFormat,
  theme,
  onToggleTheme,
  onExportPdf,
  onExportZip,
  onOpenWordCount,
  onOpenHistory,
  onOpenProjectsHub,
  onOpenSymbols,
  onOpenTableBuilder,
  sections = [],
  onJumpToLine,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  // Build All Available Commands
  const allCommands = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [];

    // Core Actions
    list.push({
      id: 'action-compile',
      category: 'Commands',
      title: 'Compile Document',
      subtitle: 'Run LaTeX live compilation & typeset KaTeX',
      icon: <Play size={13} color="#10b981" />,
      shortcut: 'Ctrl+Enter',
      onExecute: () => { onCompile(); onClose(); },
    });

    list.push({
      id: 'action-format',
      category: 'Commands',
      title: 'Format LaTeX Document',
      subtitle: 'Auto-indent nested environments & clean whitespace',
      icon: <Code size={13} color="#38bdf8" />,
      shortcut: 'Shift+Alt+F',
      onExecute: () => { onFormatDocument(); onClose(); },
    });

    list.push({
      id: 'action-columns',
      category: 'Commands',
      title: `Toggle Column Layout (${isTwoColumn ? 'Switch to 1-Col' : 'Switch to 2-Col'})`,
      subtitle: 'Switch between single-column and IEEE 2-column layout',
      icon: <Columns size={13} color="#38bdf8" />,
      onExecute: () => { onToggleTwoColumn(); onClose(); },
    });

    list.push({
      id: 'action-theme',
      category: 'Commands',
      title: `Toggle Theme (${theme === 'dark' ? 'Light Mode' : 'Dark Mode'})`,
      subtitle: 'Switch application color theme',
      icon: theme === 'dark' ? <Sun size={13} color="#f59e0b" /> : <Moon size={13} color="#38bdf8" />,
      onExecute: () => { onToggleTheme(); onClose(); },
    });

    list.push({
      id: 'action-export-pdf',
      category: 'Commands',
      title: 'Export Document as PDF',
      subtitle: 'Generate high-fidelity print-ready PDF manuscript',
      icon: <Download size={13} color="#38bdf8" />,
      shortcut: 'Ctrl+P',
      onExecute: () => { onExportPdf(); onClose(); },
    });

    list.push({
      id: 'action-export-zip',
      category: 'Commands',
      title: 'Export Project as ZIP Archive',
      subtitle: 'Download complete LaTeX bundle with assets & bib',
      icon: <Download size={13} color="#f59e0b" />,
      onExecute: () => { onExportZip(); onClose(); },
    });

    list.push({
      id: 'action-word-count',
      category: 'Commands',
      title: 'Word Count & Statistics',
      subtitle: 'Check manuscript length against conference limits',
      icon: <BarChart2 size={13} color="#38bdf8" />,
      onExecute: () => { onOpenWordCount(); onClose(); },
    });

    list.push({
      id: 'action-history',
      category: 'Commands',
      title: 'Version History & Checkpoints',
      subtitle: 'Browse time-machine diffs and restore checkpoints',
      icon: <History size={13} color="#38bdf8" />,
      onExecute: () => { onOpenHistory(); onClose(); },
    });

    list.push({
      id: 'action-table-builder',
      category: 'Commands',
      title: 'Visual LaTeX Table Builder',
      subtitle: 'Create customized matrix and tabular LaTeX structures visually',
      icon: <Table size={13} color="#10b981" />,
      onExecute: () => { onOpenTableBuilder(); onClose(); },
    });

    list.push({
      id: 'action-symbols',
      category: 'Commands',
      title: 'Symbol Palette & Math Notation',
      subtitle: 'Browse Greek letters, operators, relations and arrows',
      icon: <Code size={13} color="#a855f7" />,
      onExecute: () => { onOpenSymbols(); onClose(); },
    });

    list.push({
      id: 'action-projects-hub',
      category: 'Commands',
      title: 'Projects Dashboard',
      subtitle: 'Manage and switch between your LaTeX workspaces',
      icon: <FolderKanban size={13} color="#38bdf8" />,
      onExecute: () => { onOpenProjectsHub(); onClose(); },
    });

    // Academic Paper Formats
    (Object.keys(PAPER_FORMATS) as PaperFormatId[]).forEach(fmtId => {
      const fmt = PAPER_FORMATS[fmtId];
      const isCurrent = activeFormat === fmtId;
      list.push({
        id: `format-${fmtId}`,
        category: 'Academic Formats',
        title: fmt.name,
        subtitle: `${fmt.badge} • ${fmt.description}`,
        icon: isCurrent ? <Check size={13} color="#38bdf8" /> : <BookOpen size={13} color="var(--text-muted)" />,
        onExecute: () => { onSelectFormat(fmtId); onClose(); },
      });
    });

    // Project Files
    files.forEach(f => {
      list.push({
        id: `file-${f.id}`,
        category: 'Files',
        title: f.name,
        subtitle: `Project File (${f.content.split('\n').length} lines)`,
        icon: f.name.endsWith('.tex') ? <FileCode size={13} color="#38bdf8" /> : <FileText size={13} color="#f59e0b" />,
        onExecute: () => { onSelectFile(f.id); onClose(); },
      });
    });

    // Sections in Current Document
    sections.forEach((sec, idx) => {
      list.push({
        id: `section-${idx}-${sec.line}`,
        category: 'Sections',
        title: sec.title,
        subtitle: `Heading ${sec.level} • Line ${sec.line}`,
        icon: <Grid size={13} color="#10b981" />,
        onExecute: () => { onJumpToLine(sec.line); onClose(); },
      });
    });

    return list;
  }, [
    onCompile,
    onFormatDocument,
    isTwoColumn,
    onToggleTwoColumn,
    theme,
    onToggleTheme,
    onExportPdf,
    onExportZip,
    onOpenWordCount,
    onOpenHistory,
    onOpenTableBuilder,
    onOpenSymbols,
    onOpenProjectsHub,
    activeFormat,
    onSelectFormat,
    files,
    onSelectFile,
    sections,
    onJumpToLine,
    onClose,
  ]);

  // Filter commands by search query
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter(c =>
      c.title.toLowerCase().includes(q) ||
      (c.subtitle && c.subtitle.toLowerCase().includes(q)) ||
      c.category.toLowerCase().includes(q)
    );
  }, [allCommands, query]);

  // Reset selectedIndex when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length, query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = filteredCommands[selectedIndex];
      if (current) current.onExecute();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(10px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 580,
          maxHeight: 460,
          backgroundColor: 'var(--bg-surface-0)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'modalSlideUp 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Search Input Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface-1)',
        }}>
          <Search size={15} color="#38bdf8" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, format, file, or section..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 500,
            }}
          />
          <kbd style={{
            fontSize: 9.5,
            fontFamily: 'var(--font-mono)',
            padding: '2px 5px',
            borderRadius: 4,
            backgroundColor: 'var(--bg-surface-0)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}>
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '6px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {filteredCommands.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No commands or files matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredCommands.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.onExecute}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isSelected ? 'var(--bg-active)' : 'transparent',
                    borderLeft: isSelected ? '2px solid #38bdf8' : '2px solid transparent',
                    transition: 'background 0.08s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      backgroundColor: 'var(--bg-surface-1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {item.icon}
                    </div>

                    <div style={{ overflow: 'hidden' }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: isSelected ? 600 : 500,
                        color: isSelected ? '#38bdf8' : 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div style={{
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  {item.shortcut ? (
                    <kbd style={{
                      fontSize: 9.5,
                      fontFamily: 'var(--font-mono)',
                      padding: '2px 5px',
                      borderRadius: 4,
                      backgroundColor: 'var(--bg-surface-1)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                    }}>
                      {item.shortcut}
                    </kbd>
                  ) : (
                    <span style={{
                      fontSize: 9,
                      color: 'var(--text-muted)',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      padding: '1px 5px',
                      borderRadius: 3,
                      backgroundColor: 'var(--bg-surface-1)',
                      flexShrink: 0,
                    }}>
                      {item.category}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div style={{
          padding: '6px 12px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface-1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--text-muted)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Select</span>
            <span><kbd>ESC</kbd> Close</span>
          </div>
          <span>{filteredCommands.length} actions</span>
        </div>
      </div>
    </div>
  );
};
