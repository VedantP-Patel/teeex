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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FileText,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  CSS_PX_PER_PT,
  PdfDocument,
  isSafeUrl,
  type PageGeometry,
  type PdfLinkAnnotation,
  type PdfSearchResult,
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
  highlightNonce,
  onPointerSync,
  onInternalNavigate,
}: {
  doc: PdfDocument;
  geometry: PageGeometry;
  displayZoom: number;
  rasterZoom: number;
  active: boolean;
  highlights: { x: number; y: number; width: number; height: number }[];
  highlightNonce?: number;
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
      queueMicrotask(() => setLinks([]));
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
      // 1. Cancel in-flight PDF.js rendering task first to prevent writing into detached nodes
      doc.releaseTextLayer?.(geometry.pageNumber);
      // 2. Release text layer DOM nodes and high-DPI bitmap backing store
      if (textContainer) {
        textContainer.replaceChildren();
      }
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      queueMicrotask(() => setPainted(false));
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
          if (container && !cancelled) {
            void doc.renderTextLayer(geometry.pageNumber, rasterZoom, container).catch(() => {});
          }
        }
      } catch (err) {
        console.warn(`[PdfPageView] Page ${geometry.pageNumber} render error:`, err);
      }
    })();

    return () => {
      cancelled = true;
      doc.releaseTextLayer?.(geometry.pageNumber);
    };
  }, [doc, geometry.pageNumber, rasterZoom, active]);

  const [clickRipples, setClickRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleSyncJump = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onPointerSync) return;
      const targetEl = event.target as HTMLElement | null;
      if (targetEl && targetEl.closest('.pdf-link-annotation')) return;

      const bounds = event.currentTarget.getBoundingClientRect();
      const clickX = event.clientX - bounds.left;
      const clickY = event.clientY - bounds.top;
      const scale = CSS_PX_PER_PT * displayZoom;

      const rippleId = Date.now() + Math.random();
      setClickRipples((prev) => [...prev.slice(-3), { id: rippleId, x: clickX, y: clickY }]);
      setTimeout(() => {
        setClickRipples((prev) => prev.filter((r) => r.id !== rippleId));
      }, 600);

      onPointerSync(
        geometry.pageNumber,
        clickX / scale,
        clickY / scale,
      );
    },
    [onPointerSync, geometry.pageNumber, displayZoom],
  );

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    mouseDownPosRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const targetEl = event.target as HTMLElement | null;
      if (targetEl && targetEl.closest('.pdf-link-annotation')) return;

      // Distinguish clean click from text drag-selection
      const moved = mouseDownPosRef.current
        ? Math.hypot(event.clientX - mouseDownPosRef.current.x, event.clientY - mouseDownPosRef.current.y)
        : 0;
      const hasSelection = typeof window !== 'undefined' && Boolean(window.getSelection()?.toString().trim());

      // If user dragged to highlight text, allow text selection and don't jump unless modifier is pressed
      if ((moved > 6 || hasSelection) && !event.ctrlKey && !event.metaKey) {
        return;
      }

      handleSyncJump(event);
    },
    [handleSyncJump],
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const targetEl = event.target as HTMLElement | null;
      if (targetEl && targetEl.closest('.pdf-link-annotation')) return;
      handleSyncJump(event);
    },
    [handleSyncJump],
  );

  return (
    <div
      className={`pdf-page${painted ? ' is-painted' : ''}`}
      data-page={geometry.pageNumber}
      style={{ width, height }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title="Click or double-click to jump to corresponding LaTeX source line (drag to select text)"
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
              key={`${rect.x}-${rect.y}-${index}-${highlightNonce ?? 0}`}
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
      {clickRipples.map((ripple) => (
        <div
          key={ripple.id}
          className="pdf-sync-ripple"
          style={{ left: ripple.x, top: ripple.y }}
          aria-hidden
        />
      ))}
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

  const [isFindOpen, setIsFindOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PdfSearchResult[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const findInputRef = useRef<HTMLInputElement>(null);
  const [pageInputValue, setPageInputValue] = useState(String(currentPage));

  useEffect(() => {
    setPageInputValue(String(currentPage));
  }, [currentPage]);

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

  const pendingScrollRef = useRef<{ page: number; yPt?: number; isFromBottomOrigin?: boolean } | null>(null);

  const scrollToPage = useCallback(
    (pageNumber: number, yPt?: number, isFromBottomOrigin = false) => {
      const container = scrollRef.current;
      if (!container || offsets.length === 0) {
        pendingScrollRef.current = { page: pageNumber, yPt, isFromBottomOrigin };
        return;
      }
      pendingScrollRef.current = null;
      const index = Math.min(Math.max(pageNumber, 1), offsets.length) - 1;
      const baseTop = offsets[index] ?? 0;
      let targetTop = baseTop;

      if (typeof yPt === 'number' && geometry[index]) {
        let offsetFromPageTop = 0;
        if (isFromBottomOrigin) {
          // Native PDF point space (origin at bottom-left) to CSS pixel space (origin at top-left)
          const pageHeightPt = geometry[index].height / CSS_PX_PER_PT;
          offsetFromPageTop = Math.max(0, (pageHeightPt - yPt) * CSS_PX_PER_PT * zoom);
        } else {
          // SyncTeX point space (origin at top-left of page)
          offsetFromPageTop = Math.max(0, yPt * CSS_PX_PER_PT * zoom);
        }
        const viewportHeight = container.clientHeight;
        targetTop = Math.max(0, baseTop + offsetFromPageTop - viewportHeight / 2);
      }

      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    },
    [offsets, geometry, zoom],
  );

  useEffect(() => {
    if (pendingScrollRef.current && offsets.length > 0) {
      const { page, yPt, isFromBottomOrigin } = pendingScrollRef.current;
      pendingScrollRef.current = null;
      scrollToPage(page, yPt, isFromBottomOrigin);
    }
  }, [offsets, scrollToPage]);

  const handleInternalNavigate = useCallback(
    async (dest: string | unknown[]) => {
      if (!doc) return;
      const target = await doc.resolveDestination(dest);
      if (target) {
        scrollToPage(target.pageNumber, target.yPt, true);
      }
    },
    [doc, scrollToPage],
  );

  const handlePageInputSubmit = useCallback(() => {
    const p = parseInt(pageInputValue, 10);
    if (!isNaN(p) && p >= 1 && p <= geometry.length) {
      scrollToPage(p);
    } else {
      setPageInputValue(String(currentPage));
    }
  }, [pageInputValue, geometry.length, scrollToPage, currentPage]);

  const navigateMatch = useCallback(
    (direction: 1 | -1) => {
      if (searchResults.length === 0) return;
      const nextIdx = (currentResultIndex + direction + searchResults.length) % searchResults.length;
      setCurrentResultIndex(nextIdx);
      const match = searchResults[nextIdx];
      scrollToPage(match.pageNumber, match.yPt, true);
    },
    [searchResults, currentResultIndex, scrollToPage],
  );

  useEffect(() => {
    if (!doc || !searchQuery.trim()) {
      setSearchResults([]);
      setCurrentResultIndex(0);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(() => {
      doc
        .findText(searchQuery)
        .then((results) => {
          if (cancelled) return;
          setSearchResults(results);
          setCurrentResultIndex(0);
          setIsSearching(false);
          if (results.length > 0) {
            scrollToPage(results[0].pageNumber, results[0].yPt, true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchResults([]);
            setIsSearching(false);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc, searchQuery, scrollToPage]);

  useEffect(() => {
    if (isFindOpen) {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }
  }, [isFindOpen]);

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, { rects: ForwardMatch['rects']; nonce?: number }>();
    if (forwardTarget) map.set(forwardTarget.page, { rects: forwardTarget.rects, nonce: forwardTarget.nonce });
    return map;
  }, [forwardTarget]);

  useEffect(() => {
    if (forwardTarget) {
      const firstRect = forwardTarget.rects?.[0];
      scrollToPage(forwardTarget.page, firstRect?.y, false);
    }
  }, [forwardTarget, scrollToPage]);

  const handlePointerSync = useCallback(
    (pageNumber: number, xPt: number, yPt: number) => {
      if (!onInverseSync) return;
      if (!syncTexIndex) {
        onCompile();
        return;
      }
      const match = inverseSync(syncTexIndex, pageNumber, xPt, yPt);
      if (match) onInverseSync(match.file, match.line);
    },
    [syncTexIndex, onInverseSync, onCompile],
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
        if (event.key.toLowerCase() === 'f') {
          event.preventDefault();
          setIsFindOpen(true);
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
          <div className="pdf-page-jumper">
            <input
              type="number"
              min={1}
              max={geometry.length || 1}
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                  handlePageInputSubmit();
                }
              }}
              onBlur={handlePageInputSubmit}
              disabled={!hasDocument}
              className="pdf-page-input"
              aria-label="Current page number"
            />
            <span className="pdf-page-total">/ {geometry.length > 0 ? geometry.length : '—'}</span>
          </div>
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
              className="pdf-status pdf-status-compiling pdf-status-busy"
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

          <button
            type="button"
            className={`btn-icon ${isFindOpen ? 'active' : ''}`}
            onClick={() => setIsFindOpen((prev) => !prev)}
            title="Find in document (Ctrl+F)"
            aria-label="Find in document"
            disabled={!hasDocument}
          >
            <Search size={14} />
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

      {isFindOpen && hasDocument && (
        <div className="pdf-find-bar" role="search">
          <div className="pdf-find-input-wrap">
            <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
            <input
              ref={findInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  navigateMatch(e.shiftKey ? -1 : 1);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsFindOpen(false);
                }
              }}
              placeholder="Find in document..."
              className="pdf-find-input"
              aria-label="Search text"
            />
            {searchQuery && (
              <span className="pdf-find-count" aria-live="polite">
                {isSearching
                  ? 'Searching...'
                  : searchResults.length > 0
                    ? `${currentResultIndex + 1} of ${searchResults.length}`
                    : 'No matches'}
              </span>
            )}
          </div>
          <div className="pdf-find-actions">
            <button
              type="button"
              className="btn-icon"
              onClick={() => navigateMatch(-1)}
              disabled={searchResults.length === 0}
              title="Previous match (Shift+Enter)"
              aria-label="Previous match"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={() => navigateMatch(1)}
              disabled={searchResults.length === 0}
              title="Next match (Enter)"
              aria-label="Next match"
            >
              <ChevronDown size={14} />
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setIsFindOpen(false)}
              title="Close find (Esc)"
              aria-label="Close find"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {(isCompiling || status.phase === 'fetching') && (
        <div
          className="pdf-compile-progress-bar"
          style={
            status.phase === 'fetching'
              ? {
                  width: `${Math.max(8, Math.min(100, status.progress))}%`,
                  transition: 'width 0.25s ease-out',
                }
              : undefined
          }
        />
      )}

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
          status.phase === 'fetching' ? (
            <div className="pdf-empty pdf-empty-neutral cold-start-card" role="status" aria-live="polite">
              <div className="pdf-empty-icon">
                <Loader2 size={24} className="spin" style={{ color: 'var(--accent-cyan)' }} />
              </div>
              <p className="pdf-empty-title">Initializing TeX Live 2026 WASM Engine</p>
              <div
                style={{
                  width: '100%',
                  maxWidth: 340,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: 'var(--bg-surface-2)',
                  overflow: 'hidden',
                  margin: '12px auto 8px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  style={{
                    width: `${Math.max(5, Math.min(100, status.progress))}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-emerald))',
                    transition: 'width 0.25s ease',
                  }}
                />
              </div>
              <p className="pdf-empty-detail" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {Math.round(status.progress)}% downloaded
                {status.loadedBytes
                  ? ` · ${((status.loadedBytes) / (1024 * 1024)).toFixed(1)} MB of ${((status.totalBytes ?? 127694000) / (1024 * 1024)).toFixed(0)} MB`
                  : ''}
                {status.speedMbps ? ` (${status.speedMbps} MB/s)` : ''}
              </p>
              <p className="pdf-empty-detail" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                One-time initial engine download. Permanently cached offline in browser storage.
              </p>
            </div>
          ) : (
            <EmptyState
              icon={
                isCompiling ? (
                  <Loader2 size={22} className="spin" />
                ) : (
                  <FileText size={22} />
                )
              }
              title={
                isCompiling
                  ? `Typesetting your document (${elapsedCompileSec.toFixed(1)}s)`
                  : 'No output yet'
              }
              detail={
                isCompiling
                  ? 'Pre-caching packages & typesetting vector pages...'
                  : errorSummary ??
                    'Start writing, or press Recompile to typeset the document.'
              }
            />
          )
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
              const targetHighlight = highlightsByPage.get(page.pageNumber);
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
                    highlights={targetHighlight?.rects ?? []}
                    highlightNonce={targetHighlight?.nonce}
                    onPointerSync={onInverseSync ? handlePointerSync : undefined}
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