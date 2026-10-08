import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileCheck,
  Columns,
  Square,
  Printer
} from 'lucide-react';
import type { ParsedDocument } from '../types/latex';

interface Props {
  renderedHtml: string;
  parsedDoc: ParsedDocument;
  onJumpToLine?: (line: number) => void;
}

export const PreviewPane: React.FC<Props> = ({
  renderedHtml,
  parsedDoc,
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
          style={{
            ...paperSheetStyle,
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
          }}
          className="latex-paper-sheet"
        >
          {/* Academic Header (Title & Authors) */}
          <div style={academicHeaderStyle}>
            <h1 style={paperTitleStyle}>{parsedDoc.title}</h1>
            <div style={paperAuthorBlockStyle}>
              {parsedDoc.authors.map((auth, idx) => (
                <span key={idx} style={paperAuthorNameStyle}>
                  {auth}
                </span>
              ))}
            </div>
            {parsedDoc.date && (
              <div style={paperDateStyle}>{parsedDoc.date}</div>
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
          <div style={paperFooterStyle}>
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
