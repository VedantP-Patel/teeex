/**
 * Teeex — PDF rasterisation (Double-Buffered & Flicker-Free).
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

const CMAP_URL = '/pdfjs/cmaps/';
const STANDARD_FONT_URL = '/pdfjs/standard_fonts/';

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
    dummyTask.promise.catch(() => { });
    dummyTask.destroy().catch(() => { });
  } catch {
    // Non-fatal
  }
}

// Auto-prewarm when module is imported in browser
if (typeof window !== 'undefined') {
  setTimeout(prewarmPdfRenderer, 50);
}

export const CSS_PX_PER_PT = PixelsPerInch.PDF_TO_CSS_UNITS;
const MAX_CANVAS_PIXELS = 16_777_216;

export interface PageGeometry {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
}

export interface PdfLinkAnnotation {
  id: string;
  rect: [number, number, number, number]; // [left, top, width, height] in CSS pixels
  url?: string;
  dest?: string | any[];
  title?: string;
}

export function isSafeUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) return false;

  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return !trimmed.startsWith('//');
  }

  // Guard against scheme evasion with whitespace (e.g. "javascript :alert(1)")
  const noWhitespace = trimmed.replace(/[\s\x00-\x1f]+/g, '');
  if (/^[a-zA-Z0-9+.-]+:/.test(noWhitespace)) {
    const colonIndex = noWhitespace.indexOf(':');
    const scheme = noWhitespace.slice(0, colonIndex + 1).toLowerCase();
    return ['http:', 'https:', 'mailto:'].includes(scheme);
  }

  try {
    const parsed = new URL(trimmed, 'https://safe-base.internal');
    if (parsed.origin !== 'https://safe-base.internal') {
      return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
    }
    return !trimmed.includes(':');
  } catch {
    return false;
  }
}

export interface RenderPageOptions {
  canvas: HTMLCanvasElement;
  pageNumber: number;
  zoom: number;
  devicePixelRatio?: number;
}

function isCancellation(error: unknown): boolean {
  return error instanceof RenderingCancelledException;
}

export class PdfDocument {
  private readonly doc: PDFDocumentProxy;
  private readonly loadingTask: PDFDocumentLoadingTask;
  private readonly pages = new Map<number, PDFPageProxy>();
  private readonly tasks = new Map<number, RenderTask>();
  private readonly renderSeq = new Map<number, number>();
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

  private onGeometryUpdate?: (geometries: PageGeometry[]) => void;

  setOnGeometryUpdate(cb: (geometries: PageGeometry[]) => void): void {
    this.onGeometryUpdate = cb;
  }

  /**
   * Lazy geometry initialization (O(1) memory and time).
   * Reads Page 1 to establish default dimensions for all N pages without
   * eagerly instantiating proxies for remaining pages.
   */
  async geometry(): Promise<PageGeometry[]> {
    if (this.geometryCache) return this.geometryCache;

    const page1 = await this.page(1);
    const vp1 = page1.getViewport({ scale: CSS_PX_PER_PT });
    const defaultGeo: PageGeometry = {
      pageNumber: 1,
      width: vp1.width,
      height: vp1.height,
      rotation: vp1.rotation,
    };

    if (this.numPages === 1) {
      this.geometryCache = [defaultGeo];
      return this.geometryCache;
    }

    const initial: PageGeometry[] = Array.from({ length: this.numPages }, (_, idx) => ({
      pageNumber: idx + 1,
      width: defaultGeo.width,
      height: defaultGeo.height,
      rotation: defaultGeo.rotation,
    }));

    this.geometryCache = initial;
    return initial;
  }

  /**
   * Lazily resolves and updates geometry for a specific page when it enters the viewport.
   * If the page has non-default dimensions (e.g. landscape), updates the cache and triggers onGeometryUpdate.
   */
  async ensurePageGeometry(pageNumber: number): Promise<PageGeometry> {
    const geometries = await this.geometry();
    if (pageNumber < 1 || pageNumber > this.numPages || this.destroyed) {
      return geometries[Math.max(0, pageNumber - 1)] || geometries[0];
    }
    if (pageNumber === 1) return geometries[0];

    const current = geometries[pageNumber - 1];
    try {
      const page = await this.page(pageNumber);
      if (this.destroyed) return current;
      const vp = page.getViewport({ scale: CSS_PX_PER_PT });
      if (
        vp.width !== current.width ||
        vp.height !== current.height ||
        vp.rotation !== current.rotation
      ) {
        geometries[pageNumber - 1] = {
          pageNumber,
          width: vp.width,
          height: vp.height,
          rotation: vp.rotation,
        };
        if (this.onGeometryUpdate && !this.destroyed) {
          this.onGeometryUpdate([...geometries]);
        }
      }
    } catch {
      // Non-fatal, retain default
    }
    return geometries[pageNumber - 1];
  }

  /**
   * Double-buffered page rasterisation:
   * Renders onto an offscreen canvas first and copies the finished bitmap onto
   * the visible `canvas` in a single synchronous frame. This prevents canvas
   * clearing flashes on recompile/zoom and eliminates concurrent canvas usage errors.
   */
  async renderPage({
    canvas,
    pageNumber,
    zoom,
    devicePixelRatio = globalThis.devicePixelRatio || 1,
  }: RenderPageOptions): Promise<boolean> {
    if (this.destroyed) return false;

    const seq = (this.renderSeq.get(pageNumber) ?? 0) + 1;
    this.renderSeq.set(pageNumber, seq);

    await this.cancelPage(pageNumber);
    if (this.destroyed || this.renderSeq.get(pageNumber) !== seq) return false;

    const page = await this.page(pageNumber);
    if (this.destroyed || this.renderSeq.get(pageNumber) !== seq) return false;

    const viewport = page.getViewport({ scale: CSS_PX_PER_PT * zoom });

    const requested = devicePixelRatio;
    const area = viewport.width * viewport.height * requested * requested;
    const ratio =
      area > MAX_CANVAS_PIXELS
        ? Math.max(1, requested * Math.sqrt(MAX_CANVAS_PIXELS / area))
        : requested;

    const pixelWidth = Math.max(1, Math.floor(viewport.width * ratio));
    const pixelHeight = Math.max(1, Math.floor(viewport.height * ratio));

    // Render to an offscreen staging canvas so the visible canvas never blanks out
    const offscreen = document.createElement('canvas');
    offscreen.width = pixelWidth;
    offscreen.height = pixelHeight;
    const offscreenCtx = offscreen.getContext('2d', { alpha: false });
    if (!offscreenCtx) return false;

    const task = page.render({
      canvas: null,
      canvasContext: offscreenCtx,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    this.tasks.set(pageNumber, task);

    try {
      await task.promise;
      if (this.destroyed || this.renderSeq.get(pageNumber) !== seq) return false;

      // Atomically swap the completed frame onto the visible canvas
      const visibleCtx = canvas.getContext('2d', { alpha: false });
      if (!visibleCtx) return false;

      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      visibleCtx.drawImage(offscreen, 0, 0);

      return true;
    } catch (error) {
      if (isCancellation(error)) return false;
      throw error;
    } finally {
      if (this.tasks.get(pageNumber) === task) this.tasks.delete(pageNumber);
      // Release offscreen backing store memory immediately
      offscreen.width = 0;
      offscreen.height = 0;
    }
  }

  private async cancelPage(pageNumber: number): Promise<void> {
    const task = this.tasks.get(pageNumber);
    if (!task) return;
    this.tasks.delete(pageNumber);
    task.cancel();
    await task.promise.catch(() => undefined);
  }

  async renderTextLayer(
    pageNumber: number,
    zoom: number,
    container: HTMLElement,
  ): Promise<void> {
    if (this.destroyed) return;

    const page = await this.page(pageNumber);
    if (this.destroyed) return;
    const viewport = page.getViewport({ scale: CSS_PX_PER_PT * zoom });

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
      this.textLayers.delete(pageNumber);
    }
  }

  releaseTextLayer(pageNumber: number): void {
    const layer = this.textLayers.get(pageNumber);
    if (!layer) return;
    layer.cancel();
    this.textLayers.delete(pageNumber);
  }

  async annotations(pageNumber: number) {
    const page = await this.page(pageNumber);
    return page.getAnnotations({ intent: 'display' });
  }

  async resolveDestination(
    dest: string | unknown[],
  ): Promise<{ pageNumber: number; yPt?: number } | null> {
    if (this.destroyed) return null;
    try {
      const explicit =
        typeof dest === 'string'
          ? ((await this.doc.getDestination(dest)) as unknown[])
          : dest;
      if (!explicit || !Array.isArray(explicit)) return null;
      const pageRef = explicit[0];
      let pageIndex: number | null = null;
      if (typeof pageRef === 'object' && pageRef !== null) {
        pageIndex = await this.doc.getPageIndex(pageRef as never);
      } else if (typeof pageRef === 'number') {
        pageIndex = pageRef;
      }
      if (pageIndex === null || pageIndex < 0) return null;
      return {
        pageNumber: pageIndex + 1,
        yPt: typeof explicit[3] === 'number' ? (explicit[3] as number) : undefined,
      };
    } catch {
      return null;
    }
  }

  async getPageLinkAnnotations(
    pageNumber: number,
    zoom: number,
  ): Promise<PdfLinkAnnotation[]> {
    if (this.destroyed) return [];
    try {
      const page = await this.page(pageNumber);
      if (this.destroyed) return [];
      const rawAnnotations = await page.getAnnotations({ intent: 'display' });
      const viewport = page.getViewport({ scale: CSS_PX_PER_PT * zoom });
      const links: PdfLinkAnnotation[] = [];

      for (const annot of rawAnnotations) {
        if (annot.subtype !== 'Link' || !annot.rect) continue;
        const p1 = viewport.convertToViewportPoint(annot.rect[0], annot.rect[1]);
        const p2 = viewport.convertToViewportPoint(annot.rect[2], annot.rect[3]);
        const left = Math.min(p1[0], p2[0]);
        const top = Math.min(p1[1], p2[1]);
        const width = Math.max(2, Math.abs(p2[0] - p1[0]));
        const height = Math.max(2, Math.abs(p2[1] - p1[1]));

        links.push({
          id: String(annot.id || `${annot.rect.join('-')}`),
          rect: [left, top, width, height],
          url: typeof annot.url === 'string' ? annot.url : undefined,
          dest: annot.dest,
          title: typeof annot.title === 'string' ? annot.title : undefined,
        });
      }
      return links;
    } catch {
      return [];
    }
  }

  cleanupPage(pageNumber: number): void {
    const page = this.pages.get(pageNumber);
    if (!page) return;
    try {
      page.cleanup();
    } catch {
      // Non-fatal
    }
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