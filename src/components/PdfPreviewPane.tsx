/**
 * Teeex — compiled PDF viewer (Zero White-Page Scroll + Accurate Double-Click SyncTeX).
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { CSS_PX_PER_PT, PdfDocument, type PageGeometry } from '../services/pdfRenderer';
import { downloadPdf } from '../services/pdfExporter';
import { inverseSync, type ForwardMatch, type SyncTexIndex } from '../services/synctex';
import type { EngineStatus } from '../services/latexCompiler';

interface Props {
  pdf: Uint8Array | null;
  status: EngineStatus;
  isCompiling: boolean;
  isDebouncing?: boolean;
  durationMs?: number | null;
  isStale: boolean;
  errorSummary?: string | null;
  documentTitle: string;
  onCompile: () => void;
  syncTexIndex?: SyncTexIndex | null;
  forwardTarget?: ForwardMatch | null;
  onInverseSync?: (file: string, line: number) => void;
}

type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4];
const PAGE_GAP = 20;
/** Pre-render 3 full viewport heights above and below so scrolling never hits a blank white page! */
const OVERSCAN = 3.5;

function clampZoom(value: number): number {
  return Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], Math.max(ZOOM_STEPS[0], value));
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function PdfPageView({
  doc,
  geometry,
  zoom,
  active,
  highlights,
  onPointerSync,
}: {
  doc: PdfDocument;
  geometry: PageGeometry;
  zoom: number;
  active: boolean;
  highlights: { x: number; y: number; width: number; height: number }[];
  onPointerSync?: (pageNumber: number, xPt: number, yPt: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [painted, setPainted] = useState(false);

  const width = geometry.width * zoom;
  const height = geometry.height * zoom;

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    void (async () => {
      try {
        const ok = await doc.renderPage({
          canvas,
          pageNumber: geometry.pageNumber,
          zoom,
        });
        if (!cancelled && ok) {
          setPainted(true);
          const container = textRef.current;
          if (container) {
            void doc.renderTextLayer(geometry.pageNumber, zoom, container).catch(() => { });
          }
        }
      } catch (err) {
        console.warn(`[PdfPageView] Page ${geometry.pageNumber} render error:`, err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, geometry.pageNumber, zoom, active]);

  // Double-click (or Ctrl/Cmd + Click) to jump to LaTeX source line (like Overleaf),
  // so normal clicking/scrolling/selecting text never triggers unwanted editor jumps!
  const handleSyncJump = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onPointerSync) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const scale = CSS_PX_PER_PT * zoom;
      onPointerSync(
        geometry.pageNumber,
        (event.clientX - bounds.left) / scale,
        (event.clientY - bounds.top) / scale,
      );
    },
    [onPointerSync, geometry.pageNumber, zoom],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        handleSyncJump(event);
      }
    },
    [handleSyncJump],
  );

  return (
    <div
      className="pdf-page"
      data-page={geometry.pageNumber}
      style={{ width, height }}
      onClick={handleClick}
      onDoubleClick={handleSyncJump}
      title="Double-click (or Ctrl+Click) to jump to corresponding LaTeX source line"
    >
      <canvas ref={canvasRef} className="pdf-page-canvas" aria-hidden />
      {!painted && (
        <div className="pdf-page-placeholder" aria-hidden>
          <Loader2 size={15} className="spin" style={{ color: '#38bdf8', marginBottom: 4 }} />
          <span>Rendering Page {geometry.pageNumber}...</span>
        </div>
      )}
      <div ref={textRef} className="pdf-text-layer" />
      {highlights.length > 0 && (
        <div className="pdf-highlight-layer" aria-hidden>
          {highlights.map((rect, index) => (
            <div
              key={index}
              className="pdf-highlight"
              style={{
                left: rect.x * CSS_PX_PER_PT * zoom,
                top: rect.y * CSS_PX_PER_PT * zoom,
                width: Math.max(2, rect.width * CSS_PX_PER_PT * zoom),
                height: Math.max(2, rect.height * CSS_PX_PER_PT * zoom),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PdfPreviewPane({
  pdf,
  status,
  isCompiling,
  isDebouncing = false,
  durationMs,
  isStale,
  errorSummary,
  documentTitle,
  onCompile,
  syncTexIndex,
  forwardTarget,
  onInverseSync,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const docRef = useRef<PdfDocument | null>(null);
  const [geometry, setGeometry] = useState<PageGeometry[]>([]);
  const [openError, setOpenError] = useState<string | null>(null);

  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width');
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [activePages, setActivePages] = useState<Set<number>>(() => new Set([1, 2, 3, 4, 5]));

  const anchorRef = useRef<{ page: number; offset: number } | null>(null);

  useEffect(() => {
    if (!pdf || pdf.byteLength === 0) {
      setDoc(null);
      setGeometry([]);
      return;
    }
    let cancelled = false;
    let opened: PdfDocument | null = null;

    void (async () => {
      try {
        opened = await PdfDocument.open(pdf);
        opened.setOnGeometryUpdate((updatedPages) => {
          if (!cancelled) setGeometry(updatedPages);
        });
        const pages = await opened.geometry();
        if (cancelled) {
          void opened.destroy();
          return;
        }

        const container = scrollRef.current;
        if (container && geometry.length > 0) {
          const pageTop = pageOffsets(geometry, zoom)[currentPage - 1] ?? 0;
          anchorRef.current = {
            page: currentPage,
            offset: container.scrollTop - pageTop,
          };
        }

        setOpenError(null);
        setGeometry(pages);
        setDoc((previous) => {
          if (previous) void previous.destroy();
          return opened;
        });
        docRef.current = opened;
      } catch (error) {
        if (cancelled) return;
        setOpenError(
          error instanceof Error
            ? error.message
            : 'The compiled PDF could not be opened.',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf]);

  useEffect(
    () => () => {
      const open = docRef.current;
      docRef.current = null;
      if (open) void open.destroy();
    },
    [],
  );

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
      setContainerHeight(entry.contentRect.height);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const widest = useMemo(
    () => geometry.reduce((max, page) => Math.max(max, page.width), 0),
    [geometry],
  );
  const tallest = useMemo(
    () => geometry.reduce((max, page) => Math.max(max, page.height), 0),
    [geometry],
  );

  useEffect(() => {
    if (zoomMode === 'custom' || widest === 0 || containerWidth === 0) return;
    const available = containerWidth - 48;
    const next =
      zoomMode === 'fit-width'
        ? available / widest
        : Math.min(available / widest, (containerHeight - 48) / tallest);
    setZoom(clampZoom(next));
  }, [zoomMode, widest, tallest, containerWidth, containerHeight]);

  const setCustomZoom = useCallback((value: number) => {
    setZoomMode('custom');
    setZoom(clampZoom(value));
  }, []);

  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      const index = ZOOM_STEPS.findIndex((step) => step > zoom + 1e-6);
      const next =
        direction === 1
          ? ZOOM_STEPS[index === -1 ? ZOOM_STEPS.length - 1 : index]
          : ZOOM_STEPS[Math.max(0, (index === -1 ? ZOOM_STEPS.length : index) - 1)];
      setCustomZoom(next);
    },
    [zoom, setCustomZoom],
  );

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setCustomZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [zoom, setCustomZoom]);

  const offsets = useMemo(() => pageOffsets(geometry, zoom), [geometry, zoom]);

  const recomputeVisible = useCallback(() => {
    const container = scrollRef.current;
    if (!container || geometry.length === 0) return;

    const top = container.scrollTop;
    const viewH = Math.max(container.clientHeight, 800);
    const bottom = top + viewH;
    const margin = viewH * OVERSCAN;

    const next = new Set<number>();
    let firstVisible = 1;

    for (let index = 0; index < geometry.length; index++) {
      const pageTop = offsets[index];
      const pageBottom = pageTop + geometry[index].height * zoom;

      if (pageBottom >= top - margin && pageTop <= bottom + margin) {
        next.add(geometry[index].pageNumber);
      }
      if (pageTop <= top + 60) firstVisible = geometry[index].pageNumber;
    }

    setActivePages((previous) => (sameSet(previous, next) ? previous : next));
    setCurrentPage((prev) => (prev !== firstVisible ? firstVisible : prev));
  }, [geometry, offsets, zoom]);

  useLayoutEffect(() => {
    recomputeVisible();
  }, [recomputeVisible]);

  const scrollRafRef = useRef<number | null>(null);
  const onScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      recomputeVisible();
    });
  }, [recomputeVisible]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const container = scrollRef.current;
    if (!anchor || !container || offsets.length === 0) return;
    anchorRef.current = null;

    const index = Math.min(anchor.page, offsets.length) - 1;
    container.scrollTop = Math.max(0, offsets[index] + anchor.offset);
    recomputeVisible();
  }, [offsets, recomputeVisible]);

  const scrollToPage = useCallback(
    (pageNumber: number) => {
      const container = scrollRef.current;
      if (!container) return;
      const index = Math.min(Math.max(pageNumber, 1), offsets.length) - 1;
      container.scrollTo({
        top: offsets[index] ?? 0,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    },
    [offsets],
  );

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, ForwardMatch['rects']>();
    if (forwardTarget) map.set(forwardTarget.page, forwardTarget.rects);
    return map;
  }, [forwardTarget]);

  useEffect(() => {
    if (forwardTarget) scrollToPage(forwardTarget.page);
  }, [forwardTarget, scrollToPage]);

  const handlePointerSync = useCallback(
    (pageNumber: number, xPt: number, yPt: number) => {
      if (!syncTexIndex || !onInverseSync) return;
      const match = inverseSync(syncTexIndex, pageNumber, xPt, yPt);
      if (match) onInverseSync(match.file, match.line);
    },
    [syncTexIndex, onInverseSync],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key === '=' || event.key === '+') {
          event.preventDefault();
          stepZoom(1);
          return;
        }
        if (event.key === '-') {
          event.preventDefault();
          stepZoom(-1);
          return;
        }
        if (event.key === '0') {
          event.preventDefault();
          setZoomMode('fit-width');
          return;
        }
        return;
      }

      if (event.key === 'PageDown' || event.key === 'n') {
        event.preventDefault();
        scrollToPage(currentPage + 1);
      } else if (event.key === 'PageUp' || event.key === 'p') {
        event.preventDefault();
        scrollToPage(currentPage - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        scrollToPage(1);
      } else if (event.key === 'End') {
        event.preventDefault();
        scrollToPage(geometry.length);
      }
    },
    [currentPage, geometry.length, scrollToPage, stepZoom],
  );

  const engineMessage =
    status.phase === 'fetching'
      ? `Downloading TeX engine · ${Math.round(status.progress)}%`
      : status.phase === 'failed'
        ? status.error
        : null;

  const hasDocument = Boolean(doc) && geometry.length > 0;

  const handleDownload = useCallback(() => {
    if (!pdf) return;
    try {
      downloadPdf(pdf, documentTitle);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    }
  }, [pdf, documentTitle]);

  return (
    <div className="pdf-pane">
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-group">
          <button
            type="button"
            className="btn-icon"
            onClick={() => scrollToPage(currentPage - 1)}
            disabled={!hasDocument || currentPage <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="pdf-page-indicator" aria-live="polite">
            {hasDocument ? `${currentPage} / ${geometry.length}` : '—'}
          </span>
          <button
            type="button"
            className="btn-icon"
            onClick={() => scrollToPage(currentPage + 1)}
            disabled={!hasDocument || currentPage >= geometry.length}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="pdf-toolbar-status">
          {isCompiling && (
            <span className="pdf-status pdf-status-busy">
              <Loader2 size={12} className="spin" />
              Typesetting
            </span>
          )}
          {!isCompiling && isDebouncing && (
            <span className="pdf-status pdf-status-queued">
              <span className="pulse-dot" />
              Queued
            </span>
          )}
          {!isCompiling && engineMessage && status.phase === 'fetching' && (
            <span className="pdf-status pdf-status-busy">
              <Loader2 size={12} className="spin" />
              {engineMessage}
            </span>
          )}
          {!isCompiling && isStale && (
            <span className="pdf-status pdf-status-warn" title={errorSummary ?? undefined}>
              <AlertTriangle size={12} />
              Showing last successful build
            </span>
          )}
          {!isCompiling && !isDebouncing && durationMs !== null && durationMs !== undefined && (
            <span
              className="pdf-status-duration"
              title={`Last compile finished in ${durationMs}ms`}
            >
              {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>

        <div className="pdf-toolbar-group">
          <button
            type="button"
            className="btn-icon"
            onClick={() => stepZoom(-1)}
            aria-label="Zoom out"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="pdf-zoom-readout"
            onClick={() => setZoomMode(zoomMode === 'fit-width' ? 'fit-page' : 'fit-width')}
            title={zoomMode === 'fit-width' ? 'Fit page' : 'Fit width'}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={() => stepZoom(1)}
            aria-label="Zoom in"
          >
            <Plus size={14} />
          </button>

          <div className="pdf-toolbar-divider" />

          <button
            type="button"
            className="btn-icon"
            onClick={onCompile}
            disabled={isCompiling}
            aria-label="Recompile"
            title="Recompile"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className="btn-primary-sm"
            onClick={handleDownload}
            disabled={!pdf}
            title="Download the compiled PDF"
          >
            <Download size={13} />
            PDF
          </button>
        </div>
      </div>

      {isCompiling && <div className="pdf-compile-progress-bar" />}

      <div
        ref={scrollRef}
        className="pdf-scroll"
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="document"
        aria-label="Compiled document preview"
      >
        {status.phase === 'failed' && (
          <EmptyState
            icon={<AlertTriangle size={22} />}
            tone="error"
            title="The TeX engine could not start"
            detail={status.error}
          />
        )}

        {openError && (
          <EmptyState
            icon={<AlertTriangle size={22} />}
            tone="error"
            title="This PDF could not be displayed"
            detail={openError}
          />
        )}

        {!hasDocument && status.phase !== 'failed' && !openError && (
          <EmptyState
            icon={
              isCompiling || status.phase === 'fetching' ? (
                <Loader2 size={22} className="spin" />
              ) : (
                <FileText size={22} />
              )
            }
            title={
              status.phase === 'fetching'
                ? 'Preparing the TeX engine'
                : isCompiling
                  ? 'Typesetting your document'
                  : 'No output yet'
            }
            detail={
              status.phase === 'fetching'
                ? `${Math.round(status.progress)}% downloaded. This happens once, then it is cached.`
                : isCompiling
                  ? 'Running pdfLaTeX.'
                  : errorSummary ??
                  'Start writing, or press Recompile to typeset the document.'
            }
          />
        )}

        {hasDocument && doc && (
          <div className="pdf-pages" style={{ gap: PAGE_GAP }}>
            {geometry.map((page) => (
              <PdfPageView
                key={page.pageNumber}
                doc={doc}
                geometry={page}
                zoom={zoom}
                active={activePages.has(page.pageNumber)}
                highlights={highlightsByPage.get(page.pageNumber) ?? []}
                onPointerSync={syncTexIndex ? handlePointerSync : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string | null;
  tone?: 'neutral' | 'error';
}) {
  return (
    <div className={`pdf-empty pdf-empty-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <div className="pdf-empty-icon">{icon}</div>
      <p className="pdf-empty-title">{title}</p>
      {detail && <p className="pdf-empty-detail">{detail}</p>}
    </div>
  );
}

function pageOffsets(geometry: PageGeometry[], zoom: number): number[] {
  const out: number[] = [];
  let y = 0;
  for (const page of geometry) {
    out.push(y);
    y += page.height * zoom + PAGE_GAP;
  }
  return out;
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}