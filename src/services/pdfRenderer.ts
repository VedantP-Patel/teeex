/**
 * Teeex — PDF rasterisation.
 *
 * Renders the compiled PDF that the TeX engine produced. This module is a
 * *viewer*, not a layout engine: it must paint exactly the bytes being shipped
 * and never reinterpret geometry.
 *
 * Three correctness requirements drive the design:
 *
 *  1. The worker and CMap/standard-font data must match the installed pdf.js
 *     exactly. Loading them from a CDN at a hardcoded, different version makes
 *     PDF.js throw on version mismatch and breaks CID font support. Everything
 *     here is resolved from the local install.
 *
 *  2. pdf.js transfers the input ArrayBuffer to its worker, which *detaches*
 *     it. The same bytes are handed to export, so the document is opened on a
 *     copy and the caller's buffer is left pristine.
 *
 *  3. Re-rendering a canvas while a previous RenderTask is live throws in
 *     pdf.js. Tasks are tracked per page and cancelled before being replaced.
 */

import {
  GlobalWorkerOptions,
  PixelsPerInch,
  RenderingCancelledException,
  TextLayer,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * CMaps and standard fonts are directory trees, so they cannot be imported as
 * URLs; `scripts/sync-pdfjs-assets.mjs` copies them from the installed
 * pdfjs-dist into public/ as part of the build.
 */
const CMAP_URL = '/pdfjs/cmaps/';
const STANDARD_FONT_URL = '/pdfjs/standard_fonts/';

/**
 * Primes the PDF.js Web Worker off the main thread at app boot time.
 * Eliminates 150-300ms worker spawn delay when the first PDF arrives.
 */
let isPrewarmed = false;
export function prewarmPdfRenderer(): void {
  if (isPrewarmed || typeof window === 'undefined') return;
  isPrewarmed = true;
  try {
    const dummyTask = getDocument({
      data: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
      cMapUrl: CMAP_URL,
      cMapPacked: true,
      standardFontDataUrl: STANDARD_FONT_URL,
    });
    dummyTask.promise.catch(() => {});
    dummyTask.destroy().catch(() => {});
  } catch {
    // Non-fatal
  }
}

/**
 * PDF user space is 72 units per inch; CSS reference pixels are 96 per inch.
 * Taken from pdf.js rather than written out, so the viewer and the library can
 * never disagree about the conversion.
 */
export const CSS_PX_PER_PT = PixelsPerInch.PDF_TO_CSS_UNITS;

/**
 * Upper bound on backing-store pixels per canvas. Browsers silently fail to
 * allocate beyond an implementation-defined area (notably ~16.7M on iOS), and
 * a blank page is far worse than a slightly softer one, so device pixel ratio
 * is reduced to fit rather than letting allocation fail.
 */
const MAX_CANVAS_PIXELS = 16_777_216;

export interface PageGeometry {
  pageNumber: number;
  /** CSS pixels at 100% zoom. */
  width: number;
  height: number;
  rotation: number;
}

export interface RenderPageOptions {
  canvas: HTMLCanvasElement;
  pageNumber: number;
  /** 1 = 100%. */
  zoom: number;
  devicePixelRatio?: number;
}

/** pdf.js signals a superseded render by rejecting with this, not an error. */
function isCancellation(error: unknown): boolean {
  return error instanceof RenderingCancelledException;
}

/**
 * One open PDF. Instances own worker-side resources and must be `destroy()`ed;
 * the previous implementation kept a module-level singleton that replaced its
 * document without releasing it, so every compile leaked a document into the
 * pdf.js worker for the lifetime of the tab.
 */
export class PdfDocument {
  private readonly doc: PDFDocumentProxy;
  private readonly loadingTask: PDFDocumentLoadingTask;
  private readonly pages = new Map<number, PDFPageProxy>();
  private readonly tasks = new Map<number, RenderTask>();
  private readonly textLayers = new Map<number, TextLayer>();
  private geometryCache: PageGeometry[] | null = null;
  private destroyed = false;

  readonly numPages: number;
  readonly fingerprint: string;

  private constructor(
    doc: PDFDocumentProxy,
    loadingTask: PDFDocumentLoadingTask,
  ) {
    this.doc = doc;
    this.loadingTask = loadingTask;
    this.numPages = doc.numPages;
    this.fingerprint = doc.fingerprints?.[0] ?? '';
  }

  static async open(bytes: Uint8Array): Promise<PdfDocument> {
    // Copy: getDocument detaches the buffer it is given, and these bytes are
    // also the export artifact.
    const owned = new Uint8Array(bytes.byteLength);
    owned.set(bytes);

    const loadingTask = getDocument({
      data: owned,
      cMapUrl: CMAP_URL,
      cMapPacked: true,
      standardFontDataUrl: STANDARD_FONT_URL,
    });

    const doc = await loadingTask.promise;

    return new PdfDocument(doc, loadingTask);
  }

  private async page(pageNumber: number): Promise<PDFPageProxy> {
    const cached = this.pages.get(pageNumber);
    if (cached) return cached;
    const page = await this.doc.getPage(pageNumber);
    this.pages.set(pageNumber, page);
    return page;
  }

  /**
   * Per-page dimensions, read from each page's own viewport.
   *
   * A PDF may mix page sizes and rotations — `\includepdf` of a landscape
   * figure, or a class that sets a different first page — so assuming a single
   * hardcoded page box (as the previous A4-only viewer did) misplaces every
   * subsequent page.
   */
  async geometry(): Promise<PageGeometry[]> {
    if (this.geometryCache) return this.geometryCache;

    const pages = await Promise.all(
      Array.from({ length: this.numPages }, (_, i) => this.page(i + 1)),
    );
    const out: PageGeometry[] = pages.map((page, idx) => {
      const viewport = page.getViewport({ scale: CSS_PX_PER_PT });
      return {
        pageNumber: idx + 1,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
      };
    });

    this.geometryCache = out;
    return out;
  }

  /**
   * Paints one page. Resolves `false` if the render was superseded or the
   * document was destroyed mid-flight; both are normal during fast scrolling
   * and zooming, and neither is an error.
   */
  async renderPage({
    canvas,
    pageNumber,
    zoom,
    devicePixelRatio = globalThis.devicePixelRatio || 1,
  }: RenderPageOptions): Promise<boolean> {
    if (this.destroyed) return false;

    await this.cancelPage(pageNumber);
    if (this.destroyed) return false;

    const page = await this.page(pageNumber);
    const viewport = page.getViewport({ scale: CSS_PX_PER_PT * zoom });

    // Clamp the backing store, then derive the ratio actually used so the
    // transform matches the allocation exactly.
    const requested = devicePixelRatio;
    const area = viewport.width * viewport.height * requested * requested;
    const ratio =
      area > MAX_CANVAS_PIXELS
        ? Math.max(1, requested * Math.sqrt(MAX_CANVAS_PIXELS / area))
        : requested;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return false;

    canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
    canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const task = page.render({
      canvas: null,
      canvasContext: context,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    this.tasks.set(pageNumber, task);

    try {
      await task.promise;
      return true;
    } catch (error) {
      if (isCancellation(error)) return false;
      throw error;
    } finally {
      if (this.tasks.get(pageNumber) === task) this.tasks.delete(pageNumber);
    }
  }

  private async cancelPage(pageNumber: number): Promise<void> {
    const task = this.tasks.get(pageNumber);
    if (!task) return;
    this.tasks.delete(pageNumber);
    task.cancel();
    // Awaiting the rejection guarantees the canvas is free before reuse.
    await task.promise.catch(() => undefined);
  }

  /**
   * Builds (or re-positions) the selectable text layer over a page.
   *
   * Uses pdf.js's own TextLayer rather than placing spans by hand: glyph
   * advance, rotation, and font-ascent correction all have to match the
   * rasterised output or selection drifts away from the visible text. On zoom
   * it calls `update()`, which re-positions the existing spans instead of
   * re-streaming the page's text.
   */
  async renderTextLayer(
    pageNumber: number,
    zoom: number,
    container: HTMLElement,
  ): Promise<void> {
    if (this.destroyed) return;

    const page = await this.page(pageNumber);
    const viewport = page.getViewport({ scale: CSS_PX_PER_PT * zoom });

    // pdf.js positions text spans relative to this custom property.
    container.style.setProperty('--scale-factor', String(viewport.scale));
    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;

    const existing = this.textLayers.get(pageNumber);
    if (existing) {
      existing.update({ viewport });
      return;
    }

    container.replaceChildren();
    const layer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport,
    });
    this.textLayers.set(pageNumber, layer);

    try {
      await layer.render();
    } catch {
      // A cancelled or failed text layer costs selection on one page; it must
      // never break rasterisation, which is the actual fidelity guarantee.
      this.textLayers.delete(pageNumber);
    }
  }

  /** Discards a page's text layer, e.g. when it scrolls far out of view. */
  releaseTextLayer(pageNumber: number): void {
    const layer = this.textLayers.get(pageNumber);
    if (!layer) return;
    layer.cancel();
    this.textLayers.delete(pageNumber);
  }

  /** Link and widget annotations, so PDF hyperlinks stay clickable. */
  async annotations(pageNumber: number) {
    const page = await this.page(pageNumber);
    return page.getAnnotations({ intent: 'display' });
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    for (const pageNumber of [...this.tasks.keys()]) {
      await this.cancelPage(pageNumber);
    }
    for (const layer of this.textLayers.values()) layer.cancel();
    this.textLayers.clear();
    for (const page of this.pages.values()) page.cleanup();
    this.pages.clear();

    await this.loadingTask.destroy();
  }
}
