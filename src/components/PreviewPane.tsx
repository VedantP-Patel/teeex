import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileCheck,
  Columns,
  Square,
  Printer,
  MousePointerClick
} from 'lucide-react';
import type { ParsedDocument } from '../types/latex';

interface Props {
  renderedHtml: string;
  parsedDoc: ParsedDocument;
  onJumpToLine?: (line: number) => void;
  rawCode?: string;
}

export const PreviewPane: React.FC<Props> = ({
  renderedHtml,
  parsedDoc,
  onJumpToLine,
  rawCode,
}) => {
  const [zoom, setZoom] = useState(100);
  const [forceTwoColumn, setForceTwoColumn] = useState<boolean | null>(null);

  const isTwoCol = forceTwoColumn !== null ? forceTwoColumn : parsedDoc.isTwoColumn;

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(160, Math.max(60, prev + delta)));
  };

  const handlePrint = () => {
    window.print();
  };

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
          <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 4 }}>
            <MousePointerClick size={10} color="#38bdf8" /> SyncTeX Active
          </span>
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
          onClick={handlePreviewInteraction}
          onMouseUp={handlePreviewInteraction}
          onDoubleClick={handlePreviewInteraction}
          style={{
            ...paperSheetStyle,
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
          }}
          className="latex-paper-sheet"
        >
          {/* Academic Header (Title & Authors) */}
          {/* Academic Header (Title & Authors) with SyncTeX Line Anchors */}
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
              columnGap: isTwoCol ? '32px' : 'normal',
              columnRule: isTwoCol ? '1px solid #e5e7eb' : 'none',
            }}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />

          {/* Academic Footnote / Page Number */}
          <div
            style={{ ...paperFooterStyle, cursor: 'pointer' }}
            className="synctex-target"
            data-line="1"
            title="Click to jump to document preamble"
          >
            <span>Teeex Studio Typeset &bull; IEEE / ACM Standard</span>
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
  padding: '28px 20px',
  display: 'flex',
  justifyContent: 'center',
  backgroundColor: 'var(--bg-app)',
};

const paperSheetStyle: React.CSSProperties = {
  width: '740px',
  minHeight: '1040px',
  backgroundColor: 'var(--paper-bg)',
  color: 'var(--paper-text)',
  boxShadow: 'var(--paper-shadow)',
  borderRadius: 2,
  padding: '56px 48px',
  fontFamily: 'var(--paper-font-serif)',
  lineHeight: 1.6,
  fontSize: '13.5px',
  transition: 'transform 0.15s ease',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  cursor: 'default',
};

const academicHeaderStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: 24,
  paddingBottom: 16,
  borderBottom: '1px solid #e5e7eb',
};

const paperTitleStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  marginBottom: 10,
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
