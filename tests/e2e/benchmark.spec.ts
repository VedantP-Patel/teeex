import { test, expect, type Page } from '@playwright/test';

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

import { openWorkspace, setEditorContent } from './fixtures';

test('measure compile latency, first-paint, structure outline latency and heap stability', async ({
  page,
}) => {
  test.setTimeout(600_000);

  const REPS = process.env.BENCHMARK_REPS ? parseInt(process.env.BENCHMARK_REPS, 10) : 4;
  const isConfiguredOrCi = Boolean(process.env.BENCHMARK_REPS || process.env.CI);

  const results: Record<string, unknown> = {
    machine: isConfiguredOrCi ? 'automated CI / baseline tracking' : 'local dev (see host); single Chromium worker',
    note: REPS >= 10
      ? `Statistically robust benchmark baseline (${REPS} repetitions/size).`
      : 'Small-sample baseline. p95 over few samples is indicative only.',
    capturedAt: new Date().toISOString(),
  };

  // --- cold start: page load through first painted page -----------------
  const preview = page.getByRole('document', { name: 'Compiled document preview' });
  const canvas = preview.locator('canvas').first();

  const t0 = Date.now();
  await openWorkspace(page, {
    id: 'e2e-bench',
    email: 'bench@teeex.local',
    fullName: 'Playwright',
  });
  await setEditorContent(page, DOCS.small);
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  results.coldStartToFirstPaintMs = Date.now() - t0;

  // --- compile latency by size (warm engine) ---------------------------
  const latency: Record<string, ReturnType<typeof summarise>> = {};

  const measureCompile = async (source: string, rep: number): Promise<number> => {
    const marked = source.replace('\\begin{document}', `\\begin{document}\n% rep ${rep}`);
    const countBefore = await page.evaluate(
      () => (window as unknown as { __teeexCompileCount?: number }).__teeexCompileCount ?? 0,
    );
    const start = Date.now();
    await setEditorContent(page, marked);
    await page.keyboard.press('ControlOrMeta+Enter');
    await page.waitForFunction(
      (prev) =>
        ((window as unknown as { __teeexCompileCount?: number }).__teeexCompileCount ?? 0) > prev,
      countBefore,
      { timeout: 180_000 },
    );
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

  // --- structure outline latency: edit -> React StructurePanel update ---
  const structureTab = page.getByRole('tab', { name: /Structure|Outline/i });
  if (await structureTab.count()) {
    await structureTab.click();
    const outlineSamples: number[] = [];
    for (let rep = 0; rep < 5; rep++) {
      const token = `MARKER_${rep}_${Date.now()}`;
      const start = Date.now();
      await setEditorContent(page, DOCS.small.replace('\\section{Small}', `\\section{${token}}`));
      await expect(page.locator('.structure-panel')).toContainText(token, { timeout: 30_000 });
      outlineSamples.push(Date.now() - start);
    }
    results.outlineLatencyMs = summarise(outlineSamples);
    await page.getByRole('tab', { name: 'PDF' }).click();
  }

  // --- heap stability across repeated compiles -------------------------
  const heapReading = () =>
    page.evaluate(() => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return mem ? mem.usedJSHeapSize : 0;
    });

  await setEditorContent(page, DOCS.medium);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  await page.waitForTimeout(500);
  const heapBefore = await heapReading();

  for (let i = 0; i < 6; i++) {
    const countBefore = await page.evaluate(
      () => (window as unknown as { __teeexCompileCount?: number }).__teeexCompileCount ?? 0,
    );
    await setEditorContent(page, DOCS.medium.replace('\\begin{document}', `\\begin{document}\n% churn ${i}`));
    await page.keyboard.press('ControlOrMeta+Enter');
    await page.waitForFunction(
      (prev) =>
        ((window as unknown as { __teeexCompileCount?: number }).__teeexCompileCount ?? 0) > prev,
      countBefore,
      { timeout: 180_000 },
    );
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

  const fs = await import('node:fs/promises');
  await fs.writeFile('docs/benchmarks.json', `${JSON.stringify(results, null, 2)}\n`);

  expect(results.coldStartToFirstPaintMs as number).toBeGreaterThan(0);
  expect(latency.small.median).toBeGreaterThan(0);
  if (results.heap && (results.heap as { available: boolean }).available) {
    const heap = results.heap as { beforeMB: number; deltaMB: number };
    expect(heap.deltaMB).toBeLessThan(Math.max(50, heap.beforeMB));
  }
});