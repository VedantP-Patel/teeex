/**
 * Teeex — preview shell (Memoized & Instant Surface Switching).
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { FileCode2, FileText, Loader2, Zap } from 'lucide-react';
import type { ParsedDocument } from '../types/latex';
import type { SyncTexIndex, ForwardMatch } from '../services/synctex';
import type { EngineStatus } from '../services/latexCompiler';
import { PdfPreviewPane } from './PdfPreviewPane';

type Surface = 'hybrid' | 'pdf' | 'outline';

const SURFACE_STORAGE_KEY = 'teeex_preview_surface_v2';

interface Props {
  renderedHtml: string;
  parsedDoc: ParsedDocument;
  documentTitle: string;

  pdf: Uint8Array | null;
  status: EngineStatus;
  isCompiling: boolean;
  isDebouncing?: boolean;
  durationMs?: number | null;
  isStale: boolean;
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
    if (val === 'pdf' || val === 'outline' || val === 'hybrid') return val;
    return 'hybrid';
  } catch {
    return 'hybrid';
  }
}

/**
 * Memoized draft HTML surface so status/compile updates never force the browser
 * to tear down and re-parse `renderedHtml` via dangerouslySetInnerHTML.
 */
const OutlineSheet = memo(function OutlineSheet({
  title,
  authorsText,
  renderedHtml,
  onOutlineClick,
}: {
  title: string;
  authorsText: string;
  renderedHtml: string;
  onOutlineClick: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const htmlObj = useMemo(() => ({ __html: renderedHtml }), [renderedHtml]);

  return (
    <div className="outline-scroll">
      <article className="outline-sheet" onClick={onOutlineClick}>
        {title && <h1 className="outline-title">{title}</h1>}
        {authorsText && <p className="outline-authors">{authorsText}</p>}
        <div
          className="outline-body latex-paper-sheet"
          dangerouslySetInnerHTML={htmlObj}
        />
      </article>
    </div>
  );
});

export function PreviewPane({
  renderedHtml,
  parsedDoc,
  documentTitle,
  pdf,
  status,
  isCompiling,
  isDebouncing = false,
  durationMs,
  isStale,
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

  const handleOutlineClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onJumpToLine) return;
      const anchor = (event.target as HTMLElement).closest<HTMLElement>('[data-line]');
      const line = Number.parseInt(anchor?.dataset.line ?? '', 10);
      if (Number.isFinite(line) && line > 0) onJumpToLine(line);
    },
    [onJumpToLine],
  );

  const authorsText = useMemo(
    () => (parsedDoc.authors.length > 0 ? parsedDoc.authors.join(' · ') : ''),
    [parsedDoc.authors],
  );

  const showPdfPane = surface === 'pdf' && Boolean(pdf);

  return (
    <div className="preview-shell">
      <div className="preview-surface-switch" role="tablist" aria-label="Preview surface">
        <button
          type="button"
          role="tab"
          aria-selected={surface === 'hybrid'}
          className={`preview-surface-tab${surface === 'hybrid' ? ' is-active' : ''}`}
          onClick={() => selectSurface('hybrid')}
          title="⚡ Instant Live Sync: Updates while typing, auto-syncs vector PDF in background"
        >
          <Zap size={12} color={surface === 'hybrid' ? '#38bdf8' : undefined} />
          Hybrid Live
        </button>
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
          title="Draft structural skim of the source. Not a layout preview."
        >
          <FileCode2 size={12} />
          Outline
        </button>
      </div>

      {/* Keep PdfPreviewPane mounted once `pdf` exists so switching tabs is 0ms and preserves zoom/scroll */}
      {pdf && (
        <div
          style={{
            display: showPdfPane ? 'flex' : 'none',
            flex: 1,
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
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
        </div>
      )}

      {!showPdfPane && (
        <div className="outline-pane">
          {surface === 'hybrid' ? (
            <div
              className="outline-notice"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(56, 189, 248, 0.08)',
                color: '#38bdf8',
                borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
                padding: '6px 14px',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="pulse-dot" style={{ backgroundColor: '#38bdf8' }} />
                <span>
                  <strong>⚡ Instant 60fps Live Sync</strong> — live draft preview
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '11px', opacity: 0.85 }}>
                  {isCompiling
                    ? 'Typesetting vector PDF in background...'
                    : pdf
                      ? '✓ Vector PDF in sync'
                      : 'Live draft active'}
                </span>
                {pdf && (
                  <button
                    type="button"
                    onClick={() => selectSurface('pdf')}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      borderRadius: '4px',
                      color: '#38bdf8',
                      padding: '2px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                    title="Switch to PDF view to see authoritative vector pages"
                  >
                    View PDF →
                  </button>
                )}
              </div>
            </div>
          ) : surface === 'pdf' ? (
            <div
              className="outline-notice"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(56, 189, 248, 0.08)',
                color: '#38bdf8',
                borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
                padding: '8px 14px',
              }}
            >
              <Loader2 size={12} className="spin" style={{ flexShrink: 0 }} />
              <span>
                {status.phase === 'fetching'
                  ? `Preparing high-fidelity PDF engine (${Math.round(status.progress)}%)... Showing instant live draft.`
                  : isCompiling
                    ? 'Typesetting PDF in background... Showing instant live draft preview.'
                    : 'Instant live draft preview (compiling PDF in background...)'}
              </span>
            </div>
          ) : (
            <p className="outline-notice">
              Draft outline of your source, for orientation while the document
              compiles. Line breaks, spacing, and page boundaries here are not the
              document&apos;s — switch to <strong>PDF</strong> for the real layout.
            </p>
          )}

          <OutlineSheet
            title={parsedDoc.title}
            authorsText={authorsText}
            renderedHtml={renderedHtml}
            onOutlineClick={handleOutlineClick}
          />
        </div>
      )}
    </div>
  );
}