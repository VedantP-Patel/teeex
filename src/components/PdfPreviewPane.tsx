/**
 * Teeex — Compiled PDF Viewer.
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
  Sparkles,
} from 'lucide-react';
import {
  CSS_PX_PER_PT,
  PdfDocument,
  isSafeUrl,
  type PageGeometry,
  type PdfLinkAnnotation,
} from '../services/pdfRenderer';
import { downloadPdf } from '../services/pdfExporter';
import { inverseSync, type ForwardMatch, type SyncTexIndex } from '../services/synctex';
import type { EngineId, EngineStatus } from '../services/latexCompiler';

export type PreviewState =
  | { type: 'current'; durationMs: number | null }
  | { type: 'compiling'; elapsedSec: number }
  | { type: 'stale'; reason: 'typing' | 'compile_error'; errorSummary?: string | null }
  | { type: 'failed'; error: string };

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
const OVERSCAN = 1.5;

const ENGINE_LABELS: Record<EngineId, string> = {
  pdflatex: 'pdfLaTeX',
  xelatex: 'XeLaTeX',
  lualatex: 'LuaLaTeX',
};

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
  displayZoom,
  rasterZoom,
  active,
  highlights,
  onPointerSync,
  onInternalNavigate,
}: {
  doc: PdfDocument;
  geometry: PageGeometry;
  displayZoom: number;
  rasterZoom: number;
  active: boolean;
  highlights: { x: number; y: number; width: number; height: number }[];
  onPointerSync?: (pageNumber: number, xPt: number, yPt: number) => void;
  onInternalNavigate?: (dest: string | unknown[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [painted, setPainted] = useState(false);
  const [links, setLinks] = useState<PdfLinkAnnotation[]>([]);

  const width = geometry.width * displayZoom;
  const height = geometry.height * displayZoom;

  useEffect(() => {
    if (active) {
      void doc.ensurePageGeometry(geometry.pageNumber);
    }
  }, [doc, geometry.pageNumber, active]);

  useEffect(() => {
    if (!active) {
      setLinks([]);
      return;
    }
    let cancelled = false;
    doc
      .getPageLinkAnnotations(geometry.pageNumber, displayZoom)
      .then((annots) => {
        if (!cancelled) setLinks(annots);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc, geometry.pageNumber, displayZoom, active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textContainer = textRef.current;

    if (!active) {
      // Release high-DPI bitmap backing store and text layer DOM nodes when outside window
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      if (textContainer) {
        textContainer.replaceChildren();
      }
      doc.releaseTextLayer?.(geometry.pageNumber);
      setPainted(false);
      return;
    }

    if (!canvas) return;
    let cancelled = false;

    void (async () => {
      try {
        const ok = await doc.renderPage({
          canvas,
          pageNumber: geometry.pageNumber,
          zoom: rasterZoom,
        });
        if (!cancelled && ok) {
          setPainted(true);
          const container = textRef.current;
          if (container) {
            void doc.renderTextLayer(geometry.pageNumber, rasterZoom, container).catch(() => {});
          }
        }
      } catch (err) {
        console.warn(`[PdfPageView] Page ${geometry.pageNumber} render error:`, err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, geometry.pageNumber, rasterZoom, active]);

  const handleSyncJump = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onPointerSync) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const scale = CSS_PX_PER_PT * displayZoom;
      onPointerSync(
        geometry.pageNumber,
        (event.clientX - bounds.left) / scale,
        (event.clientY - bounds.top) / scale,
      );
    },
    [onPointerSync, geometry.pageNumber, displayZoom],
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
      className={`pdf-page${painted ? ' is-painted' : ''}`}
      data-page={geometry.pageNumber}
      style={{ width, height }}
      onClick={handleClick}
      onDoubleClick={handleSyncJump}
      title="Double-click (or Ctrl+Click) to jump to corresponding LaTeX source line"
    >
      {active && (
        <canvas
          ref={canvasRef}
          className="pdf-page-canvas"
          style={{ width: '100%', height: '100%' }}
          aria-hidden
        />
      )}
      {!painted && (
        <div className="pdf-page-placeholder pdf-shimmer" aria-hidden>
          <Loader2 size={16} className="spin" style={{ color: '#38bdf8', marginBottom: 6 }} />
          <span>Rendering Page {geometry.pageNumber}...</span>
        </div>
      )}
      <div ref={textRef} className="pdf-text-layer" />
      {links.length > 0 && (
        <div
          className="pdf-annotation-layer"
          aria-label={`Page ${geometry.pageNumber} links`}
        >
          {links.map((link) => {
            const [left, top, width, height] = link.rect;
            if (link.url) {
              const safe = isSafeUrl(link.url);
              return (
                <a
                  key={link.id}
                  className={`pdf-link-annotation${safe ? '' : ' is-unsafe'}`}
                  href={safe ? link.url : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.title || link.url}
                  aria-label={link.title || link.url}
                  style={{ left, top, width, height }}
                  onClick={safe ? undefined : (e) => e.preventDefault()}
                />
              );
            }
            if (link.dest) {
              return (
                <a
                  key={link.id}
                  className="pdf-link-annotation pdf-link-internal"
                  href={`#dest-${link.id}`}
                  title={link.title || 'Jump to cross-reference'}
                  aria-label={link.title || 'Jump to cross-reference'}
                  style={{ left, top, width, height }}
                  onClick={(e) => {
                    e.preventDefault();
                    if (link.dest) onInternalNavigate?.(link.dest);
                  }}
                />
              );
            }
            return null;
          })}
        </div>
      )}
      {highlights.length > 0 && (
        <div className="pdf-highlight-layer" aria-hidden>
          {highlights.map((rect, index) => (
            <div
              key={`${rect.x}-${rect.y}-${index}`}
              className="pdf-highlight"
              style={{
                left: rect.x * CSS_PX_PER_PT * displayZoom,
                top: rect.y * CSS_PX_PER_PT * displayZoom,
                width: Math.max(4, rect.width * CSS_PX_PER_PT * displayZoom),
                height: Math.max(4, rect.height * CSS_PX_PER_PT * displayZoom),
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
  const [rasterZoom, setRasterZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [activePages, setActivePages] = useState<Set<number>>(() => new Set([1, 2, 3]));
  const [elapsedCompileSec, setElapsedCompileSec] = useState(0);

  const anchorRef = useRef<{ page: number; offset: number } | null>(null);

  useEffect(() => {
    if (!isCompiling) {
      setElapsedCompileSec(0);
      return;
    }
    const start = performance.now();
    const interval = setInterval(() => {
      setElapsedCompileSec(Number(((performance.now() - start) / 1000).toFixed(1)));
    }, 100);
    return () => clearInterval(interval);
  }, [isCompiling]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setRasterZoom(zoom);
    }, 150);
    return () => clearTimeout(timer);
  }, [zoom]);

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
    const clamped = clampZoom(next);
    setZoom(clamped);
    setRasterZoom(clamped);
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
      setCustomZoom(zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
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
    (pageNumber: number, yPt?: number) => {
      const container = scrollRef.current;
      if (!container || offsets.length === 0) return;
      const index = Math.min(Math.max(pageNumber, 1), offsets.length) - 1;
      const baseTop = offsets[index] ?? 0;
      let targetTop = baseTop;

      if (typeof yPt === 'number' && geometry[index]) {
        // PDF point space (origin at bottom-left) to CSS pixel space (origin at top-left)
        const pageHeightPt = geometry[index].height / CSS_PX_PER_PT;
        const offsetFromPageTop = Math.max(0, (pageHeightPt - yPt) * CSS_PX_PER_PT * zoom);
        targetTop = baseTop + offsetFromPageTop;
      }

      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    },
    [offsets, geometry, zoom],
  );

  const handleInternalNavigate = useCallback(
    async (dest: string | unknown[]) => {
      if (!doc) return;
      const target = await doc.resolveDestination(dest);
      if (target) {
        scrollToPage(target.pageNumber, target.yPt);
      }
    },
    [doc, scrollToPage],
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

  const hasDocument = Boolean(doc) && geometry.length > 0;

  const previewState: PreviewState = useMemo(() => {
    if (status.phase === 'failed') {
      return { type: 'failed', error: status.error || 'The TeX engine could not start' };
    }
    if (isCompiling) {
      return { type: 'compiling', elapsedSec: elapsedCompileSec };
    }
    if (!hasDocument) {
      return { type: 'failed', error: errorSummary || 'No PDF generated yet' };
    }
    if (isStale) {
      return { type: 'stale', reason: 'compile_error', errorSummary };
    }
    if (isDebouncing) {
      return { type: 'stale', reason: 'typing' };
    }
    return { type: 'current', durationMs: durationMs ?? null };
  }, [
    status,
    isCompiling,
    elapsedCompileSec,
    hasDocument,
    isStale,
    isDebouncing,
    errorSummary,
    durationMs,
  ]);

  const totalHeight = useMemo(() => {
    if (geometry.length === 0) return 0;
    const lastIdx = geometry.length - 1;
    return (offsets[lastIdx] ?? 0) + geometry[lastIdx].height * zoom;
  }, [geometry, offsets, zoom]);

  const handleDownload = useCallback(() => {
    if (!pdf) return;
    try {
      downloadPdf(pdf, documentTitle);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    }
  }, [pdf, documentTitle]);

  return (
    <div className="pdf-pane" data-preview-state={previewState.type}>
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

        <div className="pdf-toolbar-status" role="status" aria-live="polite">
          {previewState.type === 'compiling' && (
            <span
              className="pdf-status pdf-status-compiling"
              title="Typesetting document with pdfLaTeX"
            >
              <Loader2 size={12} className="spin" />
              <span>Typesetting · {previewState.elapsedSec.toFixed(1)}s</span>
            </span>
          )}

          {previewState.type === 'current' && (
            <span
              className="pdf-status pdf-status-current"
              title={`Document up to date · compiled with ${ENGINE_LABELS[status.engine] ?? status.engine} in ${previewState.durationMs ?? 0}ms`}
            >
              <Sparkles size={11} style={{ marginRight: 4 }} />
              Up to date
              {previewState.durationMs !== null
                ? ` · ${previewState.durationMs < 1000 ? `${previewState.durationMs}ms` : `${(previewState.durationMs / 1000).toFixed(1)}s`}`
                : ''}
            </span>
          )}

          {previewState.type === 'stale' && previewState.reason === 'typing' && (
            <span
              className="pdf-status pdf-status-stale"
              title="Live sync queued — pausing for typing"
            >
              <span className="pulse-dot" />
              Changes pending · Live compile queued
            </span>
          )}

          {previewState.type === 'stale' && previewState.reason === 'compile_error' && (
            <span
              className="pdf-status pdf-status-stale"
              title={
                previewState.errorSummary ||
                'Last compile failed — showing previous successful build'
              }
            >
              <AlertTriangle size={12} />
              Showing last build · changes pending
            </span>
          )}

          {previewState.type === 'failed' && (
            <span className="pdf-status pdf-status-failed" title={previewState.error}>
              <AlertTriangle size={12} />
              Build failed
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
            title="Recompile (Ctrl+Enter)"
          >
            <RefreshCw size={14} className={isCompiling ? 'spin' : undefined} />
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
                  ? `Typesetting your document (${elapsedCompileSec.toFixed(1)}s)`
                  : 'No output yet'
            }
            detail={
              status.phase === 'fetching'
                ? `${Math.round(status.progress)}% downloaded. Cached permanently for instant future loads.`
                : isCompiling
                  ? 'Pre-caching packages & typesetting vector pages...'
                  : errorSummary ??
                  'Start writing, or press Recompile to typeset the document.'
            }
          />
        )}

        {hasDocument && doc && (
          <div
            className="pdf-pages-container"
            style={{
              position: 'relative',
              width: '100%',
              minWidth: widest * zoom,
              height: totalHeight,
            }}
          >
            {geometry.map((page, index) => {
              // True virtualization: only mount active pages in the window
              if (!activePages.has(page.pageNumber)) return null;

              const pageTop = offsets[index] ?? 0;
              return (
                <div
                  key={page.pageNumber}
                  className="pdf-page-wrapper"
                  style={{
                    position: 'absolute',
                    top: pageTop,
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                >
                  <PdfPageView
                    doc={doc}
                    geometry={page}
                    displayZoom={zoom}
                    rasterZoom={rasterZoom}
                    active={true}
                    highlights={highlightsByPage.get(page.pageNumber) ?? []}
                    onPointerSync={syncTexIndex ? handlePointerSync : undefined}
                    onInternalNavigate={handleInternalNavigate}
                  />
                </div>
              );
            })}
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