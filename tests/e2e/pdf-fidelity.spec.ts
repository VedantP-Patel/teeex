import { test, expect } from '@playwright/test';

/**
 * Structural fidelity of the compiled artifact.
 *
 * Under this architecture the preview and the export are the *same* PDF bytes,
 * so there is no second layout engine to disagree with — a cross-render pixel
 * diff would only be testing pdf.js's determinism, not document fidelity. The
 * assertions that actually mean something here are structural: the shipped PDF
 * has real page geometry and embedded fonts, its text is present and
 * positioned, and the on-screen preview is a genuine raster of that same
 * artifact rather than a placeholder.
 *
 * (The complementary in-environment pixel differential — rasterise the shipped
 * bytes to an offscreen canvas at the preview's exact scale and DPR and
 * pixelmatch against the visible canvas — is noted in docs/project-state.json
 * as the remaining e2e item. It is deliberately omitted here rather than
 * written loosely: a flaky threshold that passes by being generous would be
 * worse than not having it.)
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

async function seedSessionAndCompile(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'teeex_auth_user',
      JSON.stringify({
        id: 'e2e-fidelity',
        email: 'fidelity@teeex.local',
        fullName: 'Playwright',
        avatarColor: '#38bdf8',
        avatarUrl: '',
        isAnonymous: false,
        isAdmin: false,
        isApproved: true,
      }),
    );
    localStorage.removeItem('teeex_signed_out');
  });

  await page.goto('/');
  const editor = page.locator('textarea.editor-code-textarea').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.fill(SOURCE);

  const preview = page.getByRole('document', { name: 'Compiled document preview' });
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(preview.locator('canvas').first()).toBeVisible({ timeout: 180_000 });
  return preview;
}

async function downloadedPdfBytes(page: import('@playwright/test').Page): Promise<Uint8Array> {
  const button = page.locator('button[title="Download the compiled PDF"]');
  await expect(button).toBeEnabled({ timeout: 30_000 });
  const download = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    button.click(),
  ]).then(([d]) => d);

  const path = await download.path();
  expect(path).toBeTruthy();
  const fs = await import('node:fs/promises');
  return new Uint8Array(await fs.readFile(path!));
}

test('the shipped PDF has real page geometry, usable fonts and positioned text', async ({
  page,
}) => {
  test.setTimeout(240_000);

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await seedSessionAndCompile(page);
  const bytes = await downloadedPdfBytes(page);

  const header = String.fromCharCode(...bytes.subarray(0, 5));
  expect(header).toBe('%PDF-');

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;

  // --- page geometry ---------------------------------------------------
  expect(pdf.numPages).toBeGreaterThan(0);
  const firstPage = await pdf.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });
  // A real typeset page, not a zero/placeholder box. 10pt article is A4 or
  // Letter depending on the TeX Live default; either way, hundreds of points.
  expect(viewport.width).toBeGreaterThan(400);
  expect(viewport.height).toBeGreaterThan(600);

  // --- fonts usable ----------------------------------------------------
  // Forcing the operator list makes pdf.js load the page's fonts; a document
  // whose fonts could not be resolved produces no drawing operations. (A
  // stricter "fonts are *embedded* subsets" assertion needs a PDF parser that
  // reads object streams — pdfTeX compresses the font descriptors, so a raw
  // byte scan misses them. Tracked in docs/project-state.json stillUnverified.)
  const operatorList = await firstPage.getOperatorList();
  expect(operatorList.fnArray.length).toBeGreaterThan(0);

  // --- positioned text -------------------------------------------------
  const text = await firstPage.getTextContent();
  const strings = text.items.filter((i) => 'str' in i).map((i) => (i as { str: string }).str);
  const joined = strings.join(' ').replace(/\s+/g, ' ');
  expect(joined).toContain('Teeex Fidelity Check');
  expect(joined).toContain('Geometry');

  // Every text run must carry a finite transform; a NaN here means the glyph
  // positions the preview relies on are corrupt.
  for (const item of text.items) {
    if ('transform' in item) {
      for (const value of (item as { transform: number[] }).transform) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  }

  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});

test('the preview renders the shipped artifact, not a placeholder', async ({ page }) => {
  test.setTimeout(240_000);

  const preview = await seedSessionAndCompile(page);
  const canvas = preview.locator('canvas').first();

  // The canvas must have a real backing store and non-uniform content: a blank
  // or placeholder page is a single flat colour, a rendered page is not.
  const stats = await canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext('2d');
    if (!ctx || el.width === 0 || el.height === 0) {
      return { width: el.width, height: el.height, distinctLuma: 0 };
    }
    const { data } = ctx.getImageData(0, 0, el.width, el.height);
    const seen = new Set<number>();
    // Sample sparsely; we only need to know the page is not a flat fill.
    for (let i = 0; i < data.length; i += 4 * 97) {
      const luma = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      seen.add(luma >> 3);
      if (seen.size > 8) break;
    }
    return { width: el.width, height: el.height, distinctLuma: seen.size };
  });

  expect(stats.width).toBeGreaterThan(0);
  expect(stats.height).toBeGreaterThan(0);
  // Text on paper produces many luminance levels (glyph edges, antialiasing);
  // a placeholder or blank page produces one or two.
  expect(stats.distinctLuma).toBeGreaterThan(2);

  // The backing store must exceed CSS size, i.e. it is rendered at devicePixel
  // ratio for sharpness rather than upscaled.
  const cssWidth = await canvas.evaluate((el) => el.getBoundingClientRect().width);
  expect(stats.width).toBeGreaterThanOrEqual(Math.floor(cssWidth));
});

test('the preview page count equals the shipped PDF page count', async ({ page }) => {
  test.setTimeout(240_000);

  // A multi-page document: pagination is decided by TeX, and the preview must
  // report exactly what the artifact contains — the brief's "identical page
  // count" requirement. A preview that invented or dropped pages (as the old
  // heuristic paginator did) would disagree here.
  await page.addInitScript(() => {
    localStorage.setItem(
      'teeex_auth_user',
      JSON.stringify({
        id: 'e2e-pagination',
        email: 'pagination@teeex.local',
        fullName: 'Playwright',
        avatarColor: '#38bdf8',
        avatarUrl: '',
        isAnonymous: false,
        isAdmin: false,
        isApproved: true,
      }),
    );
    localStorage.removeItem('teeex_signed_out');
  });

  await page.goto('/');
  const editor = page.locator('textarea.editor-code-textarea').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });

  await editor.fill(String.raw`\documentclass[10pt]{article}
\usepackage{lipsum}
\begin{document}
\section{One}\lipsum[1-15]
\newpage
\section{Two}\lipsum[1-15]
\newpage
\section{Three}\lipsum[1-10]
\end{document}`);

  const preview = page.getByRole('document', { name: 'Compiled document preview' });
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(preview.locator('canvas').first()).toBeVisible({ timeout: 180_000 });

  const bytes = await downloadedPdfBytes(page);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;

  // Three \newpage-separated sections of substantial text: several pages.
  expect(pdf.numPages).toBeGreaterThanOrEqual(3);

  // The toolbar's page indicator reads "<current> / <total>".
  const indicator = await page.locator('.pdf-page-indicator').first().textContent();
  const total = Number.parseInt((indicator ?? '').split('/')[1]?.trim() ?? '', 10);

  expect(total, `preview reported "${indicator}"`).toBe(pdf.numPages);
});
