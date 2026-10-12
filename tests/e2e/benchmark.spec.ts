import { test, expect } from '@playwright/test';

/**
 * Performance baselines.
 *
 * This is a measurement harness, not a pass/fail correctness test — it records
 * what the pipeline actually costs on this machine and writes the numbers to
 * docs/benchmarks.json so claims about speed can cite data instead of
 * impression. The only hard assertions are sanity floors (something compiled;
 * the heap did not run away), because a benchmark that fails the suite on a
 * slow CI box would just get deleted.
 *
 * Sample sizes are deliberately small (a few reps per size) to stay within a
 * practical runtime; p95 over 5 samples is a weak estimate and is labelled as
 * such in the output. The point is an honest first baseline, not a definitive
 * profile.
 *
 * Run explicitly:  npx playwright test tests/e2e/benchmark.spec.ts
 */

const DOCS = {
  small: String.raw`\documentclass[10pt]{article}
\begin{document}
\section{Small}
A single short paragraph of text.
\end{document}`,

  medium: String.raw`\documentclass[10pt]{article}
\usepackage{amsmath,lipsum}
\begin{document}
\section{Medium}
\lipsum[1-12]
\[ \int_0^1 x^2\,dx = \frac{1}{3} \qquad E = mc^2 \]
\lipsum[13-18]
\end{document}`,

  large: String.raw`\documentclass[10pt]{article}
\usepackage{amsmath,lipsum}
\begin{document}
${Array.from({ length: 8 }, (_, i) => `\\section{Section ${i + 1}}\n\\lipsum[1-10]`).join('\n\\newpage\n')}
\end{document}`,
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

function summarise(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples: samples.length,
    median: Math.round(quantile(sorted, 0.5)),
    p95: Math.round(quantile(sorted, 0.95)),
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
  };
}

test('measure compile latency, first-paint, outline latency and heap stability', async ({
  page,
}) => {
  test.setTimeout(600_000);

  await page.addInitScript(() => {
    localStorage.setItem(
      'teeex_auth_user',
      JSON.stringify({
        id: 'e2e-bench',
        email: 'bench@teeex.local',
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

  const results: Record<string, unknown> = {
    machine: 'local dev (see host); single Chromium worker',
    note: 'Small-sample baseline. p95 over few samples is indicative only.',
    capturedAt: new Date().toISOString(),
  };

  // --- cold start: page load through first painted page -----------------
  const editor = page.locator('textarea.editor-code-textarea').first();
  const preview = page.getByRole('document', { name: 'Compiled document preview' });
  const canvas = preview.locator('canvas').first();

  const t0 = Date.now();
  await page.goto('/');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.fill(DOCS.small);
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  results.coldStartToFirstPaintMs = Date.now() - t0;

  // --- compile latency by size (warm engine) ---------------------------
  // Measured from the moment the "Typesetting" status appears to the moment it
  // clears, i.e. pure compile + render, excluding the edit debounce. Driven by
  // the app's own isCompiling state, so it does not depend on guessing when a
  // canvas repainted.
  const busy = page.locator('.pdf-status-busy');
  const REPS = 4;
  const latency: Record<string, ReturnType<typeof summarise>> = {};

  const measureCompile = async (source: string, rep: number): Promise<number> => {
    const marked = source.replace('\\begin{document}', `\\begin{document}\n% rep ${rep}`);
    await editor.fill(marked);
    // Compile starts after the debounce; wait for the busy pill, then time
    // until it clears.
    await expect(busy).toBeVisible({ timeout: 30_000 });
    const start = Date.now();
    await expect(busy).toBeHidden({ timeout: 180_000 });
    return Date.now() - start;
  };

  for (const [size, source] of Object.entries(DOCS)) {
    const samples: number[] = [];
    for (let rep = 0; rep < REPS; rep++) {
      samples.push(await measureCompile(source, rep));
    }
    latency[size] = summarise(samples);
  }
  results.compileLatencyMs = latency;

  // --- outline latency: keystroke → draft outline paint -----------------
  // Switch to the Outline surface and measure how fast it reflects an edit.
  // This path is synchronous HTML, so it should be an order of magnitude below
  // a compile.
  const outlineTab = page.getByRole('tab', { name: 'Outline' });
  if (await outlineTab.count()) {
    await outlineTab.click();
    const outlineSamples: number[] = [];
    for (let rep = 0; rep < 5; rep++) {
      const token = `MARKER_${rep}_${Date.now()}`;
      const start = Date.now();
      await editor.fill(DOCS.small.replace('short paragraph', token));
      await expect(page.locator('.outline-body')).toContainText(token, { timeout: 30_000 });
      outlineSamples.push(Date.now() - start);
    }
    results.outlineLatencyMs = summarise(outlineSamples);
    await page.getByRole('tab', { name: 'PDF' }).click();
  }

  // --- heap stability across repeated compiles (leak check for C14) -----
  // The old viewer leaked a pdf.js document per compile. Compile the medium
  // doc several times and compare the JS heap before and after; a steadily
  // climbing heap would indicate documents are not being released.
  const heapReading = () =>
    page.evaluate(() => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return mem ? mem.usedJSHeapSize : 0;
    });

  // Settle, read, churn, read again.
  await editor.fill(DOCS.medium);
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  await page.waitForTimeout(500);
  if (globalThis.gc) globalThis.gc();
  const heapBefore = await heapReading();

  for (let i = 0; i < 6; i++) {
    await editor.fill(DOCS.medium.replace('\\begin{document}', `\\begin{document}\n% churn ${i}`));
    await expect(busy).toBeVisible({ timeout: 30_000 });
    await expect(busy).toBeHidden({ timeout: 180_000 });
  }
  await page.waitForTimeout(500);
  const heapAfter = await heapReading();

  results.heap = {
    available: heapBefore > 0,
    beforeMB: Math.round(heapBefore / 1e6),
    afterMB: Math.round(heapAfter / 1e6),
    deltaMB: Math.round((heapAfter - heapBefore) / 1e6),
    compiles: 6,
    note: 'performance.memory is coarse and GC-dependent; a large positive delta is a leak signal, not proof.',
  };

  // --- persist ----------------------------------------------------------
  const fs = await import('node:fs/promises');
  await fs.writeFile('docs/benchmarks.json', `${JSON.stringify(results, null, 2)}\n`);
  console.log('Benchmarks:\n', JSON.stringify(results, null, 2));

  // --- sanity floors (not performance thresholds) ----------------------
  expect(results.coldStartToFirstPaintMs as number).toBeGreaterThan(0);
  expect(latency.small.median).toBeGreaterThan(0);
  // If the heap doubled across six medium compiles, a document is leaking.
  if (results.heap && (results.heap as { available: boolean }).available) {
    const heap = results.heap as { beforeMB: number; deltaMB: number };
    expect(heap.deltaMB).toBeLessThan(Math.max(50, heap.beforeMB));
  }
});
