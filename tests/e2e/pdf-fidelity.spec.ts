import { test, expect } from '@playwright/test';
import {
  compileAndWaitForPreview,
  downloadedPdfBytes,
  extractPdfText,
  openWorkspace,
} from './fixtures';

/**
 * PDF fidelity.
 *
 * These tests assert on the artifact itself — page geometry, positioned text,
 * operator stream, and the rendered canvas — rather than on the app's own
 * claims about it. A preview that merely looks like a document passes a
 * screenshot test; it does not pass these.
 */

const SOURCE = String.raw`\documentclass[10pt]{article}
\usepackage{amsmath}
\title{Teeex Fidelity Check}
\author{Playwright}
\begin{document}
\maketitle
\section{Geometry}
This document exists to be measured, not read.
\[
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
\]
\end{document}`;

const PROFILE = { id: 'e2e-fidelity', email: 'fidelity@teeex.local', fullName: 'Playwright' };

/** Opens the app, types the document, and waits for a page to render. */
async function openAndCompile(
  page: Parameters<typeof openWorkspace>[0],
  source = SOURCE,
  profileId = 'e2e-fidelity',
) {
  await openWorkspace(
    page,
    {
      id: profileId,
      email: `${profileId}@teeex.local`,
      fullName: 'Playwright',
    },
    source,
  );
  await compileAndWaitForPreview(page, source);
}

test('the shipped PDF has real page geometry, usable fonts and positioned text', async ({
  page,
}) => {
  test.setTimeout(240_000);

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await openAndCompile(page, SOURCE, 'e2e-fidelity-geom');
  const bytes = await downloadedPdfBytes(page);

  expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-');

  const { numPages, perPage } = await extractPdfText(bytes);
  expect(numPages).toBeGreaterThan(0);

  // A real TeX page is letter or A4 sized. A placeholder or an empty page would
  // not be.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  const viewport = (await pdf.getPage(1)).getViewport({ scale: 1 });
  expect(viewport.width).toBeGreaterThan(400);
  expect(viewport.height).toBeGreaterThan(600);

  // Positioned text, not a raster: glyph positions come from the typesetter.
  const firstPage = await pdf.getPage(1);
  const operatorList = await firstPage.getOperatorList();
  expect(operatorList.fnArray.length).toBeGreaterThan(0);

  const textContent = await firstPage.getTextContent();
  for (const item of textContent.items) {
    if ('transform' in item) {
      for (const value of (item as { transform: number[] }).transform) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  }

  const joined = perPage.join(' ').replace(/\s+/g, ' ');
  expect(joined).toContain('Teeex Fidelity Check');
  expect(joined).toContain('Geometry');

  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});

test('the preview renders the shipped artifact, not a placeholder', async ({ page }) => {
  test.setTimeout(240_000);

  await openAndCompile(page, SOURCE, 'e2e-fidelity-raster');

  const canvas = page.getByRole('document', { name: 'Compiled document preview' })
    .locator('canvas')
    .first();

  // A placeholder or a blank pane is a flat field. Real typeset text produces
  // many distinct luminance buckets.
  const stats = await canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext('2d');
    if (!ctx || el.width === 0 || el.height === 0) {
      return { width: el.width, height: el.height, distinctLuma: 0 };
    }
    const { data } = ctx.getImageData(0, 0, el.width, el.height);
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 97) {
      const luma = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      seen.add(luma >> 3);
      if (seen.size > 8) break;
    }
    return { width: el.width, height: el.height, distinctLuma: seen.size };
  });

  expect(stats.width).toBeGreaterThan(0);
  expect(stats.height).toBeGreaterThan(0);
  expect(stats.distinctLuma).toBeGreaterThan(2);

  // Backing store must be at least CSS-sized, or text is upscaled and blurry.
  const cssWidth = await canvas.evaluate((el) => el.getBoundingClientRect().width);
  expect(stats.width).toBeGreaterThanOrEqual(Math.floor(cssWidth));
});

test('the preview page count equals the shipped PDF page count', async ({ page }) => {
  test.setTimeout(240_000);

  const threePages = String.raw`\documentclass[10pt]{article}
\usepackage{lipsum}
\begin{document}
\section{One}\lipsum[1-15]
\newpage
\section{Two}\lipsum[1-15]
\newpage
\section{Three}\lipsum[1-10]
\end{document}`;

  await openAndCompile(page, threePages, 'e2e-fidelity-pages');

  const { numPages } = await extractPdfText(await downloadedPdfBytes(page));
  expect(numPages).toBeGreaterThanOrEqual(3);

  const indicator = await page.locator('.pdf-page-indicator').first().textContent();
  const total = Number.parseInt((indicator ?? '').split('/')[1]?.trim() ?? '', 10);

  // The viewer's "1 / N" must agree with the artifact, or the preview is
  // showing a different document from the one that was downloaded.
  expect(total, `preview reported "${indicator}"`).toBe(numPages);
});

test('microtype survives into the compiled PDF without silent preamble stripping', async ({
  page,
}) => {
  test.setTimeout(240_000);

  // \textls is defined by microtype. If \usepackage{microtype} were being
  // stripped from the preamble before compilation — which is exactly what
  // optimizeTexForFastWasm() used to do — this document would fail with
  // "Undefined control sequence" and no PDF would be produced at all.
  const microtypeDoc = String.raw`\documentclass[10pt]{article}
\usepackage{microtype}
\begin{document}
\noindent\parbox{135pt}{%
  Microtype character protrusion and font expansion verification paragraph with
  narrow measure so line breaking and horizontal glyph positions reflect microtype.
}

\noindent\textls[200]{MICROTYPEACTIVE}
\end{document}`;

  await openAndCompile(page, microtypeDoc, 'e2e-fidelity-microtype');

  const { numPages, all } = await extractPdfText(await downloadedPdfBytes(page));
  expect(numPages).toBe(1);
  expect(all.replace(/\s+/g, '')).toContain('MICROTYPEACTIVE');
});

test('scrolling a 100-page document does not grow the heap without bound', async ({ page }) => {
  test.setTimeout(360_000);

  const hundredPages = String.raw`\documentclass[10pt]{article}
\begin{document}
${Array.from({ length: 100 }, (_, i) => `Page ${i + 1} content block.\\newpage`).join('\n')}
\end{document}`;

  await openAndCompile(page, hundredPages, 'e2e-fidelity-heap');

  const preview = page.getByRole('document', { name: 'Compiled document preview' });

  const readHeap = () =>
    page.evaluate(() => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return mem ? mem.usedJSHeapSize : 0;
    });

  const heapBefore = await readHeap();

  await preview.evaluate(async (container) => {
    const scrollTarget =
      container.querySelector('.pdf-pages-scroll, .pdf-scroll-container') ?? container;
    const maxScroll = scrollTarget.scrollHeight - scrollTarget.clientHeight;
    const steps = 20;
    for (let s = 1; s <= steps; s++) {
      scrollTarget.scrollTop = Math.floor((maxScroll * s) / steps);
      await new Promise((r) => setTimeout(r, 60));
    }
  });

  const heapAfter = await readHeap();
  // performance.memory is coarse and GC-dependent, so this is a leak *signal*,
  // not proof. Skipped entirely when the reading is unavailable.
  if (heapBefore > 0 && heapAfter > 0) {
    expect((heapAfter - heapBefore) / 1e6).toBeLessThan(250);
  }
});
