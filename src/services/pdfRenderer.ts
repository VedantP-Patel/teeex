/**
 * Teeex Studio — PDF.js Renderer Service
 *
 * Renders compiled PDF binary data (Uint8Array) directly onto HTML Canvas
 * elements for pixel-perfect, 100% Overleaf-parity previewing.
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker source using CDN or local worker for reliable async rendering
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
}

export interface RenderPageOptions {
  canvas: HTMLCanvasElement;
  pageNumber: number;
  scale?: number;
}

export interface PdfDocumentInfo {
  numPages: number;
  fingerprint: string;
}

export class PdfRendererService {
  private currentDoc: pdfjsLib.PDFDocumentProxy | null = null;
  private currentBytes: Uint8Array | null = null;

  async loadDocument(pdfBytes: Uint8Array): Promise<PdfDocumentInfo> {
    this.currentBytes = pdfBytes;
    const loadingTask = pdfjsLib.getDocument({
      data: pdfBytes,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
    });

    this.currentDoc = await loadingTask.promise;
    return {
      numPages: this.currentDoc.numPages,
      fingerprint: Array.isArray(this.currentDoc.fingerprints) ? (this.currentDoc.fingerprints[0] || '') : '',
    };
  }

  async renderPage({
    canvas,
    pageNumber,
    scale = 1.5,
  }: RenderPageOptions): Promise<{ width: number; height: number }> {
    if (!this.currentDoc) {
      throw new Error('No PDF document loaded.');
    }

    const page = await this.currentDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D canvas context');
    }

    // Set canvas dimensions according to viewport and devicePixelRatio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    ctx.save();
    ctx.scale(dpr, dpr);

    const renderContext = {
      canvasContext: ctx,
      viewport,
    };

    // @ts-expect-error pdfjs-dist types vary across minor versions
    await page.render(renderContext).promise;
    ctx.restore();

    return {
      width: viewport.width,
      height: viewport.height,
    };
  }

  getNumPages(): number {
    return this.currentDoc ? this.currentDoc.numPages : 0;
  }

  getCurrentBytes(): Uint8Array | null {
    return this.currentBytes;
  }

  destroy(): void {
    this.currentDoc = null;
    this.currentBytes = null;
  }
}

export const pdfRenderer = new PdfRendererService();
