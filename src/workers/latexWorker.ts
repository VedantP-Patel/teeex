/**
 * Teeex — Web Worker for real-time LaTeX parsing, diagnostics, and HTML draft rendering.
 *
 * Runs diagnoseLatex, parseLatexDocument, and renderLatexToHtml completely off
 * the main browser thread. This ensures editor typing remains butter-smooth
 * (0ms main thread blocking) regardless of document complexity or KaTeX formulas.
 */

import {
  diagnoseLatex,
  parseLatexDocument,
  renderLatexToHtml,
} from '../services/latexParser';
import type { Diagnostic, ParsedDocument, ProjectFile } from '../types/latex';

export interface ParseWorkerRequest {
  requestId: number;
  content: string;
  files: ProjectFile[];
  isTex: boolean;
}

export interface ParseWorkerResponse {
  requestId: number;
  diagnostics: Diagnostic[];
  parsedDoc: ParsedDocument;
  renderedHtml: string;
  durationMs: number;
}

self.onmessage = (event: MessageEvent<ParseWorkerRequest>) => {
  const { requestId, content, files, isTex } = event.data;
  const t0 = performance.now();

  try {
    const diagnostics = isTex ? diagnoseLatex(content) : [];
    const parsedDoc = parseLatexDocument(content, files);
    const renderedHtml = renderLatexToHtml(content, files);
    const t1 = performance.now();
    const elapsed = t1 - t0;
    const durationMs = elapsed < 10 ? Number(elapsed.toFixed(1)) : Math.round(elapsed);

    self.postMessage({
      requestId,
      diagnostics,
      parsedDoc,
      renderedHtml,
      durationMs: Math.max(0.5, durationMs),
    } satisfies ParseWorkerResponse);
  } catch (error) {
    console.error('[latexWorker] Error parsing LaTeX:', error);
    self.postMessage({
      requestId,
      diagnostics: [
        {
          id: `worker-err-${Date.now()}`,
          line: 1,
          column: 1,
          severity: 'error',
          message: error instanceof Error ? error.message : 'Parser worker error',
          rule: 'parser-internal',
        },
      ],
      parsedDoc: {
        title: '',
        authors: [],
        date: '',
        abstract: '',
        sections: [],
        mathBlocks: [],
        isTwoColumn: false,
        documentClass: 'article',
      },
      renderedHtml: `<div class="latex-render-error"><p>Parse error: ${String(error)}</p></div>`,
      durationMs: Math.round(performance.now() - t0),
    } satisfies ParseWorkerResponse);
  }
};
