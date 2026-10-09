import React, { useState, useRef, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileCheck,
  Columns,
  Square,
  Printer,
  MousePointerClick,
  BookOpen,
  ChevronDown,
  Check
} from 'lucide-react';
import type { ParsedDocument } from '../types/latex';
import { PAPER_FORMATS, type PaperFormatId } from '../services/paperFormats';
import { exportDocumentAsPdf } from '../services/pdfExporter';

interface Props {
  renderedHtml: string;
  parsedDoc: ParsedDocument;
  onJumpToLine?: (line: number) => void;
  rawCode?: string;
  forwardTargetLine?: number | null;
  onClearForwardTargetLine?: () => void;
  paperFormat?: PaperFormatId;
  onFormatChange?: (format: PaperFormatId) => void;
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
}) => {
  const [zoom, setZoom] = useState(78);
  const [forceTwoColumn, setForceTwoColumn] = useState<boolean | null>(null);
  const [localFormat, setLocalFormat] = useState<PaperFormatId>(() => {
    return (localStorage.getItem('teeex_paper_format') as PaperFormatId) || 'ieee';
  });
  const [isFormatMenuOpen, setIsFormatMenuOpen] = useState(false);

  const activeFormat = paperFormat || localFormat;
  const currentFormatConfig = PAPER_FORMATS[activeFormat] || PAPER_FORMATS.ieee;
  const isTwoCol = forceTwoColumn !== null ? forceTwoColumn : (currentFormatConfig.defaultColumns === 2);

  const sheetRef = useRef<HTMLDivElement>(null);
  const formatMenuRef = useRef<HTMLDivElement>(null);

  // Close format menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (formatMenuRef.current && !formatMenuRef.current.contains(e.target as Node)) {
        setIsFormatMenuOpen(false);
      }
    };
    if (isFormatMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isFormatMenuOpen]);

  const handleSelectFormat = (fmt: PaperFormatId) => {
    setLocalFormat(fmt);
    localStorage.setItem('teeex_paper_format', fmt);
    onFormatChange?.(fmt);
    setIsFormatMenuOpen(false);
    // Reset manual column override so it uses the format's default standard
    setForceTwoColumn(null);
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(160, Math.max(60, prev + delta)));
  };

  const handlePrint = () => {
    exportDocumentAsPdf({
      title: parsedDoc.title || 'LaTeX Document',
      element: sheetRef.current,
      format: activeFormat,
      isTwoColumn: isTwoCol,
    });
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
    <div style={previewContainerStyle}>
      {/* Top Toolbar */}
      <div style={previewToolbarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileCheck size={14} color="#10b981" />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
            PUBLICATION PREVIEW
          </span>
          <span className="badge badge-emerald" style={{ fontSize: 9 }}>
            Live Rendered
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 2 }}>
            <MousePointerClick size={10} color="#38bdf8" /> SyncTeX Active
          </span>

          <div style={{ width: 1, height: 14, backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />

          {/* Standard Format Selector Dropdown */}
          <div ref={formatMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsFormatMenuOpen(!isFormatMenuOpen)}
              className="btn-ghost"
              style={{
                padding: '2px 7px',
                fontSize: 10.5,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                backgroundColor: isFormatMenuOpen ? 'var(--bg-surface-2)' : 'rgba(56, 189, 248, 0.08)',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
              }}
              title="Standard Academic Format (IEEE Transactions default, ACM, Nature, arXiv, Standard)"
            >
              <BookOpen size={11} color="#38bdf8" />
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {currentFormatConfig.badge}
              </span>
              <ChevronDown size={10} color="var(--text-muted)" />
            </button>

            {isFormatMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  zIndex: 50,
                  backgroundColor: 'var(--bg-surface-1)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45)',
                  width: 290,
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
                  Academic Publication Format
                </div>
                {(Object.keys(PAPER_FORMATS) as PaperFormatId[]).map(fid => {
                  const fmt = PAPER_FORMATS[fid];
                  const isSelected = activeFormat === fid;
                  return (
                    <div
                      key={fid}
                      onClick={() => handleSelectFormat(fid)}
                      style={{
                        padding: '7px 9px',
                        borderRadius: 4,
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                        marginBottom: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                      className="hover:bg-active"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11.5, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#38bdf8' : 'var(--text-primary)' }}>
                          {fmt.name}
                        </span>
                        {isSelected && <Check size={12} color="#38bdf8" />}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                        {fmt.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Controls: Zoom, Column mode, Print */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Column Toggle */}
          <button
            onClick={() => setForceTwoColumn(!isTwoCol)}
            className="btn-ghost"
            style={{ padding: '3px 6px', fontSize: 11 }}
            title={`Toggle layout (currently ${isTwoCol ? '2-Column' : '1-Column'})`}
          >
            {isTwoCol ? <Columns size={13} color="#38bdf8" /> : <Square size={13} />}
            <span style={{ fontSize: 10 }}>{isTwoCol ? '2-Col' : '1-Col'}</span>
          </button>

          <div style={{ width: 1, height: 14, backgroundColor: 'var(--border-subtle)' }} />

          {/* Zoom Controls */}
          <button onClick={() => handleZoom(-10)} className="btn-ghost" style={{ padding: 4 }} title="Zoom Out">
            <ZoomOut size={13} />
          </button>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', minWidth: 36, textAlign: 'center', color: 'var(--text-secondary)' }}>
            {zoom}%
          </span>
          <button onClick={() => handleZoom(10)} className="btn-ghost" style={{ padding: 4 }} title="Zoom In">
            <ZoomIn size={13} />
          </button>
          <button onClick={() => setZoom(100)} className="btn-ghost" style={{ padding: 4 }} title="Reset Zoom">
            <Maximize2 size={12} />
          </button>

          <div style={{ width: 1, height: 14, backgroundColor: 'var(--border-subtle)' }} />

          <button onClick={handlePrint} className="btn-ghost" style={{ padding: 4 }} title="Print / Save as PDF">
            <Printer size={13} />
          </button>
        </div>
      </div>

      {/* Paper Sheet View Container */}
      <div style={sheetViewportStyle}>
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
            maxWidth: currentFormatConfig.maxWidth,
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
          }}
          className={`latex-paper-sheet format-${activeFormat}`}
        >
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
            <span>Page 1</span>
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
  height: 36,
  backgroundColor: 'var(--bg-surface-0)',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  flexShrink: 0,
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
  boxShadow: '0 12px 35px -5px rgba(0, 0, 0, 0.45), 0 0 1px 1px rgba(255, 255, 255, 0.08)',
  borderRadius: 2,
  fontFamily: 'var(--paper-font-serif)',
  lineHeight: 1.5,
  fontSize: '12.5px',
  transition: 'transform 0.15s ease',
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
