/**
 * Teeex — preview shell.
 *
 * Hosts the two preview surfaces and makes the distinction between them
 * explicit:
 *
 *   PDF      the compiled document. Authoritative: the same bytes export
 *            ships, rendered by pdf.js. This is what the document *is*.
 *
 *   Outline  a draft HTML skim of the source, shown for structural orientation
 *            while the engine compiles. It makes no claim about layout,
 *            pagination, or typography, and cannot be exported.
 *
 * The outline deliberately does not paginate. The previous implementation drew
 * fake A4 page boundaries with invented running heads and footers, and split
 * content across them using per-block height measurements that are not valid
 * under CSS multi-column layout — then clipped the overflow with
 * `overflow: hidden`, silently deleting content. Presenting one continuous
 * column removes the entire class of problems instead of tuning it: nothing
 * about the outline now implies it knows where a page ends, because it does
 * not, and only the engine does.
 */

import React, { useCallback, useState } from 'react';
import { FileCode2, FileText, Loader2 } from 'lucide-react';
import type { ParsedDocument } from '../types/latex';
import type { SyncTexIndex, ForwardMatch } from '../services/synctex';
import type { EngineStatus } from '../services/latexCompiler';
import { PdfPreviewPane } from './PdfPreviewPane';

type Surface = 'pdf' | 'outline';

const SURFACE_STORAGE_KEY = 'teeex_preview_surface';

interface Props {
  /** Draft HTML rendering of the source, for the outline surface. */
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
  /** Outline click → source line, from the parser's recorded line anchors. */
  onJumpToLine?: (line: number) => void;
}

function readStoredSurface(): Surface {
  try {
    return localStorage.getItem(SURFACE_STORAGE_KEY) === 'outline' ? 'outline' : 'pdf';
  } catch {
    return 'pdf';
  }
}

export function PreviewPane({
  renderedHtml,
  parsedDoc,
  documentTitle,
  pdf,
  status,
  isCompiling,
  isDebouncing,
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
      // A blocked localStorage only costs the remembered choice.
    }
  }, []);

  /**
   * Outline → source. Uses the `data-line` anchors the parser emits, which
   * record the actual source line a block came from. This replaces a fuzzy
   * substring/word-density search over the source that was previously labelled
   * "SyncTeX" — real source mapping for the compiled document now comes from
   * the engine's own SyncTeX output, on the PDF surface.
   */
  const handleOutlineClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onJumpToLine) return;
      const anchor = (event.target as HTMLElement).closest<HTMLElement>('[data-line]');
      const line = Number.parseInt(anchor?.dataset.line ?? '', 10);
      if (Number.isFinite(line) && line > 0) onJumpToLine(line);
    },
    [onJumpToLine],
  );

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
          title="Draft structural skim of the source. Not a layout preview."
        >
          <FileCode2 size={12} />
          Outline
        </button>
      </div>

      {surface === 'pdf' ? (
        pdf ? (
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
          <div className="outline-pane">
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

            <div className="outline-scroll">
              <article className="outline-sheet" onClick={handleOutlineClick}>
                {parsedDoc.title && <h1 className="outline-title">{parsedDoc.title}</h1>}
                {parsedDoc.authors.length > 0 && (
                  <p className="outline-authors">{parsedDoc.authors.join(' · ')}</p>
                )}
                <div
                  className="outline-body latex-paper-sheet"
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              </article>
            </div>
          </div>
        )
      ) : (
        <div className="outline-pane">
          <p className="outline-notice">
            Draft outline of your source, for orientation while the document
            compiles. Line breaks, spacing, and page boundaries here are not the
            document's — switch to <strong>PDF</strong> for the real layout.
          </p>

          <div className="outline-scroll">
            <article className="outline-sheet" onClick={handleOutlineClick}>
              {parsedDoc.title && <h1 className="outline-title">{parsedDoc.title}</h1>}
              {parsedDoc.authors.length > 0 && (
                <p className="outline-authors">{parsedDoc.authors.join(' · ')}</p>
              )}
              <div
                className="outline-body latex-paper-sheet"
                // The draft renderer produces this markup from the source; it is
                // not user-supplied HTML.
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </article>
          </div>
        </div>
      )}
    </div>
  );
}
