import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileCheck,
  Columns,
  Square,
  MousePointerClick,
  BookOpen,
  ChevronDown,
  Check,
  Layers,
  Grid,
  ChevronLeft,
  ChevronRight,
  FileText
} from 'lucide-react';
import type { ParsedDocument } from '../types/latex';
import { PAPER_FORMATS, type PaperFormatId } from '../services/paperFormats';

interface Props {
  renderedHtml: string;
  parsedDoc: ParsedDocument;
  onJumpToLine?: (line: number) => void;
  rawCode?: string;
  forwardTargetLine?: number | null;
  onClearForwardTargetLine?: () => void;
  paperFormat?: PaperFormatId;
  onFormatChange?: (format: PaperFormatId) => void;
  isTwoColumn?: boolean;
  onToggleTwoColumn?: () => void;
}

export const PreviewPane: React.FC<Props> = ({
  renderedHtml,
  parsedDoc,
  onJumpToLine,
  rawCode,
  forwardTargetLine,
  onClearForwardTargetLine,
  paperFormat,
  onFormatChange,
  isTwoColumn: isTwoColumnProp,
  onToggleTwoColumn,
}) => {
  const [zoom, setZoom] = useState(78);
  const [localColumnOverride, setLocalColumnOverride] = useState<boolean | null>(null);
  const [localFormat, setLocalFormat] = useState<PaperFormatId>(() => {
    return (localStorage.getItem('teeex_paper_format') as PaperFormatId) || 'ieee';
  });
  const [isFormatMenuOpen, setIsFormatMenuOpen] = useState(false);
  const [formatMenuCoords, setFormatMenuCoords] = useState<{ top: number; right: number } | null>(null);

  const activeFormat = paperFormat || localFormat;
  const currentFormatConfig = PAPER_FORMATS[activeFormat] || PAPER_FORMATS.ieee;
  const isTwoCol = isTwoColumnProp !== undefined
    ? isTwoColumnProp
    : (localColumnOverride !== null ? localColumnOverride : (currentFormatConfig.defaultColumns === 2));

  const sheetRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const formatMenuRef = useRef<HTMLDivElement>(null);
  const formatButtonRef = useRef<HTMLButtonElement>(null);

  // Sheet View vs Flow View State
  const [previewMode, setPreviewMode] = useState<'sheet' | 'flow'>(() => {
    return (localStorage.getItem('teeex_preview_mode') as 'sheet' | 'flow') || 'sheet';
  });
  const [showMarginGuides, setShowMarginGuides] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const handleTogglePreviewMode = (mode: 'sheet' | 'flow') => {
    setPreviewMode(mode);
    localStorage.setItem('teeex_preview_mode', mode);
  };

  useEffect(() => {
    if (sheetRef.current) {
      const pageHeight = 1122;
      const h = sheetRef.current.scrollHeight;
      const pages = Math.max(1, Math.ceil(h / pageHeight));
      setTotalPages(pages);
    }
  }, [renderedHtml, activeFormat, isTwoCol, zoom]);

  const scrollToPage = (pageNum: number) => {
    setCurrentPage(pageNum);
    if (viewportRef.current) {
      const pageHeight = 1122 * (zoom / 100);
      viewportRef.current.scrollTo({
        top: (pageNum - 1) * pageHeight,
        behavior: 'smooth',
      });
    }
  };

  const handleViewportScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    const pageHeight = 1122 * (zoom / 100);
    const p = Math.min(totalPages, Math.max(1, Math.floor(top / pageHeight) + 1));
    if (p !== currentPage) {
      setCurrentPage(p);
    }
  };

  const toggleFormatMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isFormatMenuOpen && formatButtonRef.current) {
      const rect = formatButtonRef.current.getBoundingClientRect();
      setFormatMenuCoords({
        top: rect.bottom + 5,
        right: Math.max(10, window.innerWidth - rect.right),
      });
    }
    setIsFormatMenuOpen(prev => !prev);
  };

  // Close format menu on outside click or window resize
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        formatMenuRef.current &&
        !formatMenuRef.current.contains(e.target as Node) &&
        formatButtonRef.current &&
        !formatButtonRef.current.contains(e.target as Node)
      ) {
        setIsFormatMenuOpen(false);
      }
    };
    if (isFormatMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      const handleResize = () => setIsFormatMenuOpen(false);
      window.addEventListener('resize', handleResize);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isFormatMenuOpen]);

  const handleSelectFormat = (fmt: PaperFormatId) => {
    setLocalFormat(fmt);
    localStorage.setItem('teeex_paper_format', fmt);
    onFormatChange?.(fmt);
    setIsFormatMenuOpen(false);
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(160, Math.max(60, prev + delta)));
  };

  // Forward SyncTeX: Code -> Preview
  useEffect(() => {
    if (forwardTargetLine && sheetRef.current) {
      const sheet = sheetRef.current;
      const allLineEls = Array.from(sheet.querySelectorAll<HTMLElement>('[data-line]'));
      if (allLineEls.length > 0) {
        let matchedEl: HTMLElement | null = null;
        let bestDiff = Infinity;

        for (const el of allLineEls) {
          const l = parseInt(el.dataset.line || '0', 10);
          if (l === forwardTargetLine) {
            matchedEl = el;
            break;
          }
          if (l <= forwardTargetLine) {
            const diff = forwardTargetLine - l;
            if (diff < bestDiff) {
              bestDiff = diff;
              matchedEl = el;
            }
          }
        }

        if (!matchedEl) matchedEl = allLineEls[0];

        if (matchedEl) {
          matchedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          matchedEl.classList.remove('synctex-forward-pulse');
          void matchedEl.offsetWidth; // trigger reflow
          matchedEl.classList.add('synctex-forward-pulse');
          const timer = setTimeout(() => {
            matchedEl?.classList.remove('synctex-forward-pulse');
          }, 2500);
          onClearForwardTargetLine?.();
          return () => clearTimeout(timer);
        }
      }
      onClearForwardTargetLine?.();
    }
  }, [forwardTargetLine, onClearForwardTargetLine]);

/**
 * Accurately finds the source code line for selected / highlighted text or clicked snippets
 */
function findSelectedTextLine(query: string, rawCode: string): number | null {
  if (!query || !rawCode) return null;
  const rawLines = rawCode.split('\n');

  // Strip excessive whitespace, bracket markers, punctuation for fuzzy matching
  const clean = query
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 2) return null;

  // 1. Direct exact chunk search (first 25 characters)
  const cleanChunk = clean.replace(/[\[\](){}<>.,;:?!'"“”‘’]/g, '').trim().slice(0, 25);
  if (cleanChunk.length >= 4) {
    const idx = rawLines.findIndex(l => l.includes(cleanChunk));
    if (idx !== -1) return idx + 1;

    const lowerIdx = rawLines.findIndex(l => l.toLowerCase().includes(cleanChunk.toLowerCase()));
    if (lowerIdx !== -1) return lowerIdx + 1;
  }

  // 2. Multi-word phrase search
  const words = clean
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !w.startsWith('\\'));

  if (words.length >= 2) {
    // Try first 2-3 words phrase
    for (let count = Math.min(4, words.length); count >= 2; count--) {
      const phrase = words.slice(0, count).join(' ').toLowerCase();
      const pIdx = rawLines.findIndex(l => l.toLowerCase().includes(phrase));
      if (pIdx !== -1) return pIdx + 1;
    }

    // Match line containing the highest density of query words
    let bestLine = -1;
    let maxMatch = 0;
    const testWords = words.slice(0, 6).map(w => w.toLowerCase());

    for (let i = 0; i < rawLines.length; i++) {
      const lineLower = rawLines[i].toLowerCase();
      let matchCount = 0;
      for (const w of testWords) {
        if (lineLower.includes(w)) matchCount++;
      }
      if (matchCount > maxMatch && matchCount >= 2) {
        maxMatch = matchCount;
        bestLine = i + 1;
      }
    }

    if (bestLine !== -1) return bestLine;
  } else if (words.length === 1 && words[0].length >= 4) {
    const single = words[0].toLowerCase();
    const sIdx = rawLines.findIndex(l => l.toLowerCase().includes(single));
    if (sIdx !== -1) return sIdx + 1;
  }

  // 3. Fallback: search anywhere in lines using first 15 chars of raw query
  const rawPrefix = query.trim().slice(0, 15);
  if (rawPrefix.length >= 4) {
    const rIdx = rawLines.findIndex(l => l.includes(rawPrefix));
    if (rIdx !== -1) return rIdx + 1;
  }

  return null;
}

  // Universal SyncTeX Interaction Handler: handles click, double-click, AND mouse selection/highlight
  const handlePreviewInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onJumpToLine) return;

    // 1. Check if the user selected / highlighted any text in the preview pane
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';

    if (selectedText.length > 0 && rawCode) {
      const line = findSelectedTextLine(selectedText, rawCode);
      if (line !== null) {
        onJumpToLine(line);
        return;
      }
    }

    const target = e.target as HTMLElement;

    // 2. Direct data-line attribute on the target or any parent element
    const lineEl = target.closest('[data-line]') as HTMLElement | null;
    if (lineEl && lineEl.dataset.line) {
      const line = parseInt(lineEl.dataset.line, 10);
      if (!isNaN(line) && line > 0) {
        onJumpToLine(line);
        return;
      }
    }

    // 3. Heading fallback: match text against parsed sections
    const heading = target.closest('h2, h3, h4');
    if (heading) {
      const headingText = heading.textContent?.trim().toLowerCase() || '';
      const matched = parsedDoc.sections.find(s =>
        headingText.includes(s.title.toLowerCase()) ||
        s.title.toLowerCase().includes(headingText)
      );
      if (matched) {
        onJumpToLine(matched.line);
        return;
      }
    }

    // 4. Math equation fallback
    const mathBlock = target.closest('.latex-math-display');
    if (mathBlock) {
      const mathText = mathBlock.textContent?.trim() || '';
      const matchedMath = parsedDoc.mathBlocks.find(m =>
        mathText.includes(m.latex.slice(0, 10))
      );
      if (matchedMath) {
        onJumpToLine(matchedMath.line);
        return;
      } else if (parsedDoc.mathBlocks.length > 0) {
        onJumpToLine(parsedDoc.mathBlocks[0].line);
        return;
      }
    }

    // 5. Text fallback: search clicked element text in rawCode
    if (rawCode) {
      const rawText = target.textContent?.trim() || '';
      if (rawText.length > 3) {
        const line = findSelectedTextLine(rawText, rawCode);
        if (line !== null) {
          onJumpToLine(line);
          return;
        }
      }
    }
  };

  return (
    <div
      style={previewContainerStyle}
      className="preview-container"
    >
      {/* Top Toolbar */}
      <div
        style={previewToolbarStyle}
        className="preview-toolbar toolbar-scrollbar"
        onWheel={(e) => {
          if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
          <FileCheck size={13} color="#10b981" />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            Preview
          </span>
          <span
            style={{
              fontSize: 9.5,
              padding: '1.5px 6px',
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 600,
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 4.5, height: 4.5, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
            Live
          </span>
          <span
            style={{
              fontSize: 9.5,
              padding: '1.5px 7px',
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 600,
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              marginLeft: 2,
              whiteSpace: 'nowrap',
              cursor: 'help',
            }}
            title="SyncTeX: Click or double-click any section in the preview to jump to that line in LaTeX code!"
          >
            <MousePointerClick size={10} color="#38bdf8" /> SyncTeX: Active
          </span>
        </div>

        {/* Controls: Format, Column mode, Zoom, Print */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {/* Standard Format Selector Dropdown */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <button
              ref={formatButtonRef}
              type="button"
              onClick={toggleFormatMenu}
              style={{
                padding: '2px 8px',
                fontSize: 10.5,
                fontWeight: 600,
                color: 'var(--text-primary)',
                backgroundColor: isFormatMenuOpen ? 'var(--bg-surface-elevated)' : 'var(--bg-surface-1)',
                border: isFormatMenuOpen ? '1px solid #38bdf8' : '1px solid var(--border-medium)',
                borderRadius: 5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                height: 24,
                transition: 'all 0.15s ease',
              }}
              title="Academic publication format"
            >
              <BookOpen size={11} color="#38bdf8" />
              <span style={{ whiteSpace: 'nowrap' }}>{currentFormatConfig.badge}</span>
              <ChevronDown size={10} color="var(--text-muted)" />
            </button>

            {isFormatMenuOpen && formatMenuCoords && createPortal(
              <div
                ref={formatMenuRef}
                style={{
                  position: 'fixed',
                  top: formatMenuCoords.top,
                  right: formatMenuCoords.right,
                  zIndex: 99999,
                  backgroundColor: 'var(--bg-surface-1)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
                  width: 280,
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
                    <BookOpen size={12} color="#38bdf8" />
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                      Academic Publication Format
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    Typesetting & layout standards
                  </div>
                </div>
                {(Object.keys(PAPER_FORMATS) as PaperFormatId[]).map(fid => {
                  const fmt = PAPER_FORMATS[fid];
                  const isSelected = activeFormat === fid;
                  return (
                    <div
                      key={fid}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectFormat(fid);
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 4,
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                        marginBottom: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        transition: 'background 0.15s ease',
                      }}
                      className="hover:bg-active"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#38bdf8' : 'var(--text-primary)' }}>
                          {fmt.name}
                        </span>
                        {isSelected && <Check size={12} color="#38bdf8" />}
                      </div>
                      <div style={{ fontSize: 9.5, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                        {fmt.description}
                      </div>
                    </div>
                  );
                })}
              </div>,
              document.body
            )}
          </div>

          {/* View Mode Toggle: Sheet vs Flow */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 5,
            height: 24,
            padding: 1,
          }}>
            <button
              type="button"
              onClick={() => handleTogglePreviewMode('sheet')}
              style={{
                padding: '2px 7px',
                fontSize: 10,
                fontWeight: previewMode === 'sheet' ? 700 : 500,
                backgroundColor: previewMode === 'sheet' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                color: previewMode === 'sheet' ? '#38bdf8' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                height: '100%',
              }}
              title="Paged Sheet View: Discrete academic paper pages with margins and headers"
            >
              <Layers size={10} />
              <span>Sheet</span>
            </button>
            <button
              type="button"
              onClick={() => handleTogglePreviewMode('flow')}
              style={{
                padding: '2px 7px',
                fontSize: 10,
                fontWeight: previewMode === 'flow' ? 700 : 500,
                backgroundColor: previewMode === 'flow' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                color: previewMode === 'flow' ? '#38bdf8' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                height: '100%',
              }}
              title="Continuous Flow View: Single continuous scrollable canvas"
            >
              <FileText size={10} />
              <span>Flow</span>
            </button>
          </div>

          {/* Margins Guide Toggle (in Sheet mode) */}
          {previewMode === 'sheet' && (
            <button
              type="button"
              onClick={() => setShowMarginGuides(prev => !prev)}
              style={{
                padding: '2px 7px',
                fontSize: 10,
                fontWeight: showMarginGuides ? 700 : 500,
                color: showMarginGuides ? '#10b981' : 'var(--text-muted)',
                backgroundColor: showMarginGuides ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-surface-1)',
                border: showMarginGuides ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-subtle)',
                borderRadius: 5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                height: 24,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
              title="Toggle printable 1-inch margin guidelines"
            >
              <Grid size={11} />
              <span>Margins</span>
            </button>
          )}

          {/* Page Navigation in Sheet Mode */}
          {previewMode === 'sheet' && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              backgroundColor: 'var(--bg-surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 5,
              height: 24,
              padding: '0 3px',
              gap: 2,
            }}>
              <button
                type="button"
                onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
                className="btn-ghost"
                style={{ padding: '1px 3px', height: '100%', display: 'flex', alignItems: 'center' }}
                title="Previous Page"
                disabled={currentPage <= 1}
              >
                <ChevronLeft size={11} />
              </button>
              <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)', padding: '0 2px' }}>
                p. {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => scrollToPage(Math.min(totalPages, currentPage + 1))}
                className="btn-ghost"
                style={{ padding: '1px 3px', height: '100%', display: 'flex', alignItems: 'center' }}
                title="Next Page"
                disabled={currentPage >= totalPages}
              >
                <ChevronRight size={11} />
              </button>
            </div>
          )}

          {/* Column Toggle Button */}
          <button
            type="button"
            onClick={onToggleTwoColumn || (() => setLocalColumnOverride(!isTwoCol))}
            style={{
              padding: '2px 7px',
              fontSize: 10.5,
              fontWeight: 500,
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              height: 24,
              transition: 'all 0.15s ease',
            }}
            title={`Toggle column layout (currently ${isTwoCol ? '2-Column' : '1-Column'})`}
          >
            {isTwoCol ? <Columns size={12} color="#38bdf8" /> : <Square size={12} />}
            <span style={{ whiteSpace: 'nowrap' }}>{isTwoCol ? '2-Col' : '1-Col'}</span>
          </button>

          <div style={{ width: 1, height: 14, backgroundColor: 'var(--border-subtle)', flexShrink: 0 }} />

          {/* Zoom Segmented Controls */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 5,
            height: 24,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}>
            <button
              type="button"
              onClick={() => handleZoom(-10)}
              className="btn-ghost"
              style={{ padding: '2px 5px', height: '100%', borderRadius: 0, display: 'flex', alignItems: 'center' }}
              title="Zoom Out"
            >
              <ZoomOut size={11} />
            </button>
            <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', minWidth: 32, textAlign: 'center', color: 'var(--text-primary)', fontWeight: 600, padding: '0 2px' }}>
              {zoom}%
            </span>
            <button
              type="button"
              onClick={() => handleZoom(10)}
              className="btn-ghost"
              style={{ padding: '2px 5px', height: '100%', borderRadius: 0, display: 'flex', alignItems: 'center' }}
              title="Zoom In"
            >
              <ZoomIn size={11} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(78)}
              className="btn-ghost"
              style={{ padding: '2px 5px', height: '100%', borderRadius: 0, borderLeft: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center' }}
              title="Fit Page (78%)"
            >
              <Maximize2 size={10} />
            </button>
          </div>
        </div>
      </div>

      {/* Paper Sheet View Container (PDF Surrounding Area) */}
      <div
        ref={viewportRef}
        onScroll={handleViewportScroll}
        style={sheetViewportStyle}
        className="sheet-viewport"
      >
        <div
          ref={sheetRef}
          onClick={handlePreviewInteraction}
          onMouseUp={handlePreviewInteraction}
          onDoubleClick={handlePreviewInteraction}
          style={{
            ...paperSheetStyle,
            fontFamily: currentFormatConfig.fontFamily,
            fontSize: currentFormatConfig.fontSize,
            lineHeight: currentFormatConfig.lineHeight,
            padding: currentFormatConfig.padding,
            maxWidth: previewMode === 'flow' ? '860px' : currentFormatConfig.maxWidth,
            width: previewMode === 'flow' ? '100%' : '210mm',
            boxShadow: previewMode === 'flow' ? '0 4px 16px rgba(0,0,0,0.2)' : '0 18px 48px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
          }}
          className={`latex-paper-sheet format-${activeFormat} ${previewMode === 'sheet' ? 'preview-mode-sheet' : 'preview-mode-flow'}`}
        >
          {/* Printable 1-Inch Margin Boundaries */}
          {previewMode === 'sheet' && showMarginGuides && (
            <div
              style={{
                position: 'absolute',
                top: '18mm',
                left: '18mm',
                right: '18mm',
                bottom: '18mm',
                border: '1px dashed rgba(56, 189, 248, 0.45)',
                pointerEvents: 'none',
                zIndex: 20,
              }}
            >
              <span style={{
                position: 'absolute',
                top: 2,
                right: 4,
                fontSize: 8,
                fontFamily: 'monospace',
                color: '#38bdf8',
                opacity: 0.8,
                fontWeight: 600,
              }}>
                1-Inch Margin Guide
              </span>
            </div>
          )}

          {/* Format Metadata Header */}
          <div className="paper-meta-header synctex-target" data-line="1">
            <span>{currentFormatConfig.headerMeta}</span>
            <span style={{ fontWeight: 700 }}>{currentFormatConfig.badge}</span>
          </div>

          {/* Academic Header (Title & Authors) */}
          <div style={academicHeaderStyle}>
            <h1
              style={{ ...paperTitleStyle, cursor: 'pointer' }}
              className="synctex-target"
              data-line={parsedDoc.titleLine || 1}
              title={`Click to jump to line ${parsedDoc.titleLine || 1} in code`}
            >
              {parsedDoc.title}
            </h1>
            <div
              style={{ ...paperAuthorBlockStyle, cursor: 'pointer' }}
              className="synctex-target"
              data-line={parsedDoc.authorLine || 1}
              title={`Click to jump to line ${parsedDoc.authorLine || 1} in code`}
            >
              {parsedDoc.authors.map((auth, idx) => (
                <span key={idx} style={paperAuthorNameStyle}>
                  {auth}
                </span>
              ))}
            </div>
            {parsedDoc.date && (
              <div
                style={{ ...paperDateStyle, cursor: 'pointer' }}
                className="synctex-target"
                data-line={parsedDoc.dateLine || 1}
                title={`Click to jump to line ${parsedDoc.dateLine || 1} in code`}
              >
                {parsedDoc.date}
              </div>
            )}
          </div>

          {/* Body Content with 2-Column or 1-Column styling */}
          <div
            style={{
              ...paperBodyStyle,
              columnCount: isTwoCol ? 2 : 1,
              columnGap: isTwoCol ? currentFormatConfig.columnGap : 'normal',
              columnRule: isTwoCol && activeFormat === 'ieee' ? '1px solid #cbd5e1' : 'none',
            }}
            className="paper-body"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />

          {/* Academic Footnote / Page Number */}
          <div
            style={{ ...paperFooterStyle, cursor: 'pointer' }}
            className="synctex-target"
            data-line="1"
            title="Click to jump to document preamble"
          >
            <span>{currentFormatConfig.footerMeta}</span>
            <span>Page {currentPage} of {totalPages}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const previewContainerStyle: React.CSSProperties = {
  flex: 1,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'var(--bg-app)',
  borderLeft: '1px solid var(--border-subtle)',
  overflow: 'hidden',
};

const previewToolbarStyle: React.CSSProperties = {
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

const sheetViewportStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'auto',
  padding: '20px 14px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  backgroundColor: 'var(--bg-app)',
};

const paperSheetStyle: React.CSSProperties = {
  width: '210mm',
  minHeight: '297mm',
  maxWidth: '210mm',
  boxSizing: 'border-box',
  backgroundColor: 'var(--paper-bg)',
  color: 'var(--paper-text)',
  boxShadow: 'var(--paper-shadow)',
  borderRadius: 2,
  fontFamily: 'var(--paper-font-serif)',
  lineHeight: 1.5,
  fontSize: '12px',
  transition: 'transform 0.15s ease, box-shadow 0.45s cubic-bezier(0.25, 1, 0.5, 1), background-color 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  cursor: 'default',
};

const academicHeaderStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: 18,
  paddingBottom: 12,
  borderBottom: '1px solid #e5e7eb',
};

const paperTitleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  marginBottom: 8,
  lineHeight: 1.25,
  color: '#111827',
};

const paperAuthorBlockStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: '16px',
  fontSize: '13px',
  fontStyle: 'italic',
  color: '#374151',
  marginBottom: 6,
};

const paperAuthorNameStyle: React.CSSProperties = {
  fontWeight: 500,
};

const paperDateStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#6b7280',
  marginTop: 4,
};

const paperBodyStyle: React.CSSProperties = {
  flex: 1,
  textAlign: 'justify',
};

const paperFooterStyle: React.CSSProperties = {
  marginTop: 32,
  paddingTop: 12,
  borderTop: '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 10,
  color: '#9ca3af',
  fontFamily: 'var(--font-ui)',
};
