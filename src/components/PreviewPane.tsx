/**
 * Teeex — PDF preview shell and React structural outline panel.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, FileCode2, FileText, Hash, Loader2 } from 'lucide-react';
import type { LatexLabel, ParsedDocument } from '../types/latex';
import type { SyncTexIndex, ForwardMatch } from '../services/synctex';
import type { EngineStatus } from '../services/latexCompiler';
import { PdfPreviewPane } from './PdfPreviewPane';

type Surface = 'pdf' | 'outline';

const SURFACE_STORAGE_KEY = 'teeex_preview_surface_v3';

interface Props {
  parsedDoc: ParsedDocument;
  labels?: LatexLabel[];
  documentTitle: string;

  pdf: Uint8Array | null;
  status: EngineStatus;
  isCompiling: boolean;
  isDebouncing?: boolean;
  durationMs?: number | null;
  isStale: boolean;
  rerunRequired?: boolean;
  errorSummary?: string | null;
  onCompile: () => void;

  syncTexIndex?: SyncTexIndex | null;
  forwardTarget?: ForwardMatch | null;
  onInverseSync?: (file: string, line: number) => void;
  onJumpToLine?: (line: number) => void;
}

function readStoredSurface(): Surface {
  try {
    const val = localStorage.getItem(SURFACE_STORAGE_KEY);
    if (val === 'pdf' || val === 'outline') return val;
    return 'pdf';
  } catch {
    return 'pdf';
  }
}

const StructurePanel = memo(function StructurePanel({
  parsedDoc,
  labels,
  onJumpToLine,
}: {
  parsedDoc: ParsedDocument;
  labels: LatexLabel[];
  onJumpToLine?: (line: number) => void;
}) {
  const authorsText = useMemo(
    () => (parsedDoc.authors.length > 0 ? parsedDoc.authors.join(' · ') : ''),
    [parsedDoc.authors],
  );

  const figureAndTableLabels = useMemo(
    () => labels.filter((l) => l.type === 'figure' || l.type === 'table'),
    [labels],
  );

  const otherLabels = useMemo(
    () => labels.filter((l) => l.type !== 'figure' && l.type !== 'table'),
    [labels],
  );

  return (
    <div className="outline-scroll" style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
      <div className="structure-panel" style={{ maxWidth: 680, margin: '0 auto' }}>
        <header style={{ marginBottom: 20, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 14 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>
            Document Structure ({parsedDoc.documentClass})
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {parsedDoc.title || 'Untitled Document'}
          </h2>
          {authorsText && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              {authorsText}
            </p>
          )}
        </header>

        {/* Sections */}
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>
            Sections ({parsedDoc.sections.length})
          </h3>
          {parsedDoc.sections.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No sections defined in this document.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {parsedDoc.sections.map((sec, idx) => (
                <li key={`${sec.line}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => onJumpToLine?.(sec.line)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 10px',
                      paddingLeft: 10 + (sec.level - 1) * 16,
                      background: 'var(--bg-surface-1)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      color: 'var(--text-primary)',
                      fontSize: sec.level === 1 ? 13 : 12.5,
                      fontWeight: sec.level === 1 ? 600 : 400,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>{sec.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      L{sec.line}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Figures & Tables */}
        {figureAndTableLabels.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>
              Figures &amp; Tables ({figureAndTableLabels.length})
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {figureAndTableLabels.map((lbl) => (
                <li key={`${lbl.fileName}-${lbl.line}-${lbl.key}`}>
                  <button
                    type="button"
                    onClick={() => onJumpToLine?.(lbl.line)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 10px',
                      background: 'var(--bg-surface-1)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      color: 'var(--text-primary)',
                      fontSize: 12.5,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>
                      <strong style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#38bdf8' }}>{lbl.key}</strong>
                      {lbl.caption ? ` — ${lbl.caption}` : ''}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>
                      L{lbl.line}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Labels */}
        {otherLabels.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Hash size={12} /> Labels ({otherLabels.length})
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {otherLabels.map((lbl) => (
                <button
                  key={`${lbl.fileName}-${lbl.line}-${lbl.key}`}
                  type="button"
                  onClick={() => onJumpToLine?.(lbl.line)}
                  style={{
                    padding: '4px 8px',
                    background: 'var(--bg-surface-1)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 4,
                    color: 'var(--text-secondary)',
                    fontSize: 11.5,
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                  title={lbl.caption ? `${lbl.caption} (line ${lbl.line})` : `Line ${lbl.line}`}
                >
                  {lbl.key} <span style={{ opacity: 0.6 }}>L{lbl.line}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Citations */}
        {parsedDoc.citations.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <BookOpen size={12} /> Citations ({parsedDoc.citations.length})
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {parsedDoc.citations.map((citeKey) => (
                <span
                  key={citeKey}
                  style={{
                    padding: '3px 8px',
                    background: 'var(--bg-surface-1)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 4,
                    color: 'var(--text-secondary)',
                    fontSize: 11.5,
                    fontFamily: 'monospace',
                  }}
                >
                  {citeKey}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
});

export function PreviewPane({
  parsedDoc,
  labels = [],
  documentTitle,
  pdf,
  status,
  isCompiling,
  isDebouncing = false,
  durationMs,
  isStale,
  rerunRequired = false,
  errorSummary,
  onCompile,
  syncTexIndex,
  forwardTarget,
  onInverseSync,
  onJumpToLine,
}: Props) {
  const [surface, setSurface] = useState<Surface>(readStoredSurface);

  const selectSurface = useCallback((next: Surface) => {
    setSurface(next);
    try {
      localStorage.setItem(SURFACE_STORAGE_KEY, next);
    } catch {
      // Ignore storage errors
    }
  }, []);

  return (
    <div className="preview-shell">
      <div className="preview-surface-switch" role="tablist" aria-label="Preview surface">
        <button
          type="button"
          role="tab"
          aria-selected={surface === 'pdf'}
          className={`preview-surface-tab${surface === 'pdf' ? ' is-active' : ''}`}
          onClick={() => selectSurface('pdf')}
          title="The compiled document — identical to the exported PDF"
        >
          <FileText size={12} />
          PDF
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={surface === 'outline'}
          className={`preview-surface-tab${surface === 'outline' ? ' is-active' : ''}`}
          onClick={() => selectSurface('outline')}
          title="Structural outline of sections, labels, figures, tables, and citations"
        >
          <FileCode2 size={12} />
          Structure
        </button>
      </div>

      {rerunRequired && !isCompiling && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            fontSize: 12,
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            color: '#f59e0b',
            borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
          }}
        >
          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
          <span>Cross-references may be one pass behind — recompile to settle labels.</span>
        </div>
      )}

      {/* Keep PdfPreviewPane mounted when surface is PDF */}
      <div
        style={{
          display: surface === 'pdf' ? 'flex' : 'none',
          flex: 1,
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {pdf ? (
          <PdfPreviewPane
            pdf={pdf}
            status={status}
            isCompiling={isCompiling}
            isDebouncing={isDebouncing}
            durationMs={durationMs}
            isStale={isStale}
            errorSummary={errorSummary}
            documentTitle={documentTitle}
            onCompile={onCompile}
            syncTexIndex={syncTexIndex}
            forwardTarget={forwardTarget}
            onInverseSync={onInverseSync}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 24,
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            {status.phase === 'fetching' || isCompiling ? (
              <>
                <Loader2 size={22} className="spin" color="#38bdf8" />
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {status.phase === 'fetching'
                    ? `Downloading TeX engine (${Math.round(status.progress)}%)…`
                    : 'Typesetting PDF with pdfLaTeX…'}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {errorSummary || status.error || 'No PDF generated yet.'}
                </div>
                <button
                  type="button"
                  onClick={onCompile}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border-medium)',
                    background: 'var(--bg-surface-1)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Compile PDF
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {surface === 'outline' && (
        <div className="outline-pane" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <StructurePanel
            parsedDoc={parsedDoc}
            labels={labels}
            onJumpToLine={onJumpToLine}
          />
        </div>
      )}
    </div>
  );
}