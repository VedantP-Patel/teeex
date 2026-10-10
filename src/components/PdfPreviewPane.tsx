/**
 * Teeex Studio — Native PDF Canvas Preview Component
 *
 * Renders the authentic compiled LaTeX PDF directly using PDF.js.
 * Provides pixel-perfect visual parity with Overleaf and TeX Live.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileCheck,
  Download,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { pdfRenderer } from '../services/pdfRenderer';

interface Props {
  pdfBytes: Uint8Array | null;
  isCompiling: boolean;
  compileError?: string | null;
  onExportPdf?: () => void;
  documentTitle?: string;
}

export const PdfPreviewPane: React.FC<Props> = ({
  pdfBytes,
  isCompiling,
  compileError,
  onExportPdf,
  documentTitle = 'document',
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [numPages, setNumPages] = useState<number>(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<number>(1);
  const [isRendering, setIsRendering] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // Download compiled PDF directly
  const handleDownloadPdf = useCallback(() => {
    if (pdfBytes) {
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${documentTitle.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (onExportPdf) {
      onExportPdf();
    }
  }, [pdfBytes, onExportPdf, documentTitle]);

  // Load document and render pages when pdfBytes or zoom changes
  useEffect(() => {
    if (!pdfBytes || pdfBytes.length === 0) {
      setNumPages(0);
      return;
    }

    let isCancelled = false;

    async function loadAndRender() {
      setIsRendering(true);
      setRenderError(null);

      try {
        const info = await pdfRenderer.loadDocument(pdfBytes!);
        if (isCancelled) return;
        setNumPages(info.numPages);

        // Render each page to its corresponding canvas
        const scale = (zoom / 100) * 1.4; // 1.4 provides sharp retina rendering
        for (let pageNum = 1; pageNum <= info.numPages; pageNum++) {
          if (isCancelled) return;
          const canvas = canvasRefs.current.get(pageNum);
          if (canvas) {
            await pdfRenderer.renderPage({
              canvas,
              pageNumber: pageNum,
              scale,
            });
          }
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('[PdfPreviewPane] Render error:', err);
          setRenderError(err instanceof Error ? err.message : 'Failed to render PDF preview');
        }
      } finally {
        if (!isCancelled) {
          setIsRendering(false);
        }
      }
    }

    loadAndRender();

    return () => {
      isCancelled = true;
    };
  }, [pdfBytes, zoom]);

  // Track active page on scroll
  const handleScroll = useCallback(() => {
    if (!containerRef.current || numPages === 0) return;
    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const pageHeight = container.scrollHeight / numPages;
    const current = Math.min(numPages, Math.max(1, Math.floor(scrollTop / pageHeight) + 1));
    setActivePage(current);
  }, [numPages]);

  const scrollToPage = useCallback((pageNum: number) => {
    const canvas = canvasRefs.current.get(pageNum);
    if (canvas && containerRef.current) {
      canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      backgroundColor: 'var(--bg-app)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Sub-toolbar for PDF Preview */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 14px',
        backgroundColor: 'var(--bg-sidebar)',
        borderBottom: '1px solid var(--border-color)',
        fontSize: '0.8rem',
        userSelect: 'none',
        flexShrink: 0,
      }}>
        {/* Left: Page count & navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'var(--bg-card)',
            padding: '2px 8px',
            borderRadius: '4px',
            border: '1px solid var(--border-color)',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
          }}>
            <Layers size={13} style={{ color: 'var(--brand-primary)' }} />
            <span>Page {numPages > 0 ? activePage : 0} of {numPages}</span>
          </div>

          {numPages > 1 && (
            <div style={{ display: 'flex', gap: '2px' }}>
              <button
                onClick={() => scrollToPage(Math.max(1, activePage - 1))}
                disabled={activePage <= 1}
                style={{
                  padding: '3px 6px',
                  borderRadius: '3px',
                  background: 'none',
                  border: 'none',
                  cursor: activePage <= 1 ? 'not-allowed' : 'pointer',
                  opacity: activePage <= 1 ? 0.4 : 1,
                  color: 'var(--text-primary)',
                }}
                title="Previous Page"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => scrollToPage(Math.min(numPages, activePage + 1))}
                disabled={activePage >= numPages}
                style={{
                  padding: '3px 6px',
                  borderRadius: '3px',
                  background: 'none',
                  border: 'none',
                  cursor: activePage >= numPages ? 'not-allowed' : 'pointer',
                  opacity: activePage >= numPages ? 0.4 : 1,
                  color: 'var(--text-primary)',
                }}
                title="Next Page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Compilation status indicator */}
          {(isCompiling || isRendering) && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#38bdf8',
              fontSize: '0.75rem',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
            }}>
              <Loader2 size={13} className="animate-spin" />
              <span>{isCompiling ? 'Compiling with TeX Live WASM…' : 'Rendering PDF…'}</span>
            </div>
          )}
        </div>

        {/* Right: Zoom controls & Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}>
            <button
              onClick={() => setZoom(z => Math.max(50, z - 10))}
              style={{
                padding: '4px 8px',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
              title="Zoom Out"
            >
              <ZoomOut size={13} />
            </button>
            <span style={{
              fontSize: '0.75rem',
              padding: '0 6px',
              color: 'var(--text-secondary)',
              minWidth: '40px',
              textAlign: 'center',
            }}>
              {zoom}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(200, z + 10))}
              style={{
                padding: '4px 8px',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
              title="Zoom In"
            >
              <ZoomIn size={13} />
            </button>
            <button
              onClick={() => setZoom(100)}
              style={{
                padding: '4px 8px',
                background: 'none',
                border: 'none',
                borderLeft: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
              title="Reset Zoom (100%)"
            >
              <Maximize2 size={12} />
            </button>
          </div>

          <button
            onClick={handleDownloadPdf}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: 'var(--brand-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
            title="Download compiled native PDF"
          >
            <Download size={13} />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* Main canvas scroll container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px 16px',
          gap: '24px',
          backgroundColor: 'var(--bg-app)',
        }}
      >
        {compileError && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            padding: '12px 16px',
            maxWidth: '700px',
            width: '100%',
            color: '#f87171',
            fontSize: '0.82rem',
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Compilation Error</div>
              <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{compileError}</div>
            </div>
          </div>
        )}

        {renderError && (
          <div style={{
            color: '#f87171',
            fontSize: '0.85rem',
            padding: '16px',
            textAlign: 'center',
          }}>
            {renderError}
          </div>
        )}

        {numPages === 0 && !isCompiling && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: 'var(--text-secondary)',
            textAlign: 'center',
          }}>
            <FileCheck size={40} style={{ opacity: 0.4, marginBottom: '12px' }} />
            <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>No PDF compiled yet</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '4px' }}>
              Edit your LaTeX document or click Compile to typeset with pdfLaTeX WASM.
            </div>
          </div>
        )}

        {Array.from({ length: numPages }, (_, idx) => idx + 1).map((pageNum) => (
          <div
            key={pageNum}
            style={{
              position: 'relative',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
              borderRadius: '2px',
              backgroundColor: '#ffffff',
              transition: 'box-shadow 0.2s ease',
            }}
          >
            <canvas
              ref={(el) => {
                if (el) {
                  canvasRefs.current.set(pageNum, el);
                } else {
                  canvasRefs.current.delete(pageNum);
                }
              }}
              style={{
                display: 'block',
                borderRadius: '2px',
              }}
            />
            {/* Page number badge */}
            <div style={{
              position: 'absolute',
              bottom: '-20px',
              right: '0',
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              opacity: 0.6,
            }}>
              Page {pageNum}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
