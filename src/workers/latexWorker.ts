/**
 * Teeex — Web Worker for real-time LaTeX parsing, diagnostics, and HTML draft rendering.
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
  requiredPackages: string[];
}

function extractPackages(content: string): string[] {
  const pkgs = new Set<string>();
  const matches = content.matchAll(/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]+)\}/g);
  for (const m of matches) {
    if (m[1]) {
      for (const name of m[1].split(',')) {
        const trimmed = name.trim();
        if (trimmed) pkgs.add(trimmed);
      }
    }
  }
  return Array.from(pkgs);
}

self.onmessage = (event: MessageEvent<ParseWorkerRequest>) => {
  const { requestId, content, files, isTex } = event.data;
  const t0 = performance.now();

  try {
    // Strip heavy base64 dataUrl properties from image files before passing to parser
    const lightweightFiles = files.map(f => f.dataUrl ? { ...f, dataUrl: undefined } : f);

    const diagnostics = isTex ? diagnoseLatex(content) : [];
    const parsedDoc = parseLatexDocument(content, lightweightFiles);
    const renderedHtml = renderLatexToHtml(content, lightweightFiles);
    const requiredPackages = isTex ? extractPackages(content) : [];
    const t1 = performance.now();
    const elapsed = t1 - t0;
    const durationMs = elapsed < 10 ? Number(elapsed.toFixed(1)) : Math.round(elapsed);

    self.postMessage({
      requestId,
      diagnostics,
      parsedDoc,
      renderedHtml,
      durationMs: Math.max(0.5, durationMs),
      requiredPackages,
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
        citations: [],
        isTwoColumn: false,
        documentClass: 'article',
      },
      renderedHtml: `<div class="latex-render-error"><p>Parse error: ${String(error)}</p></div>`,
      durationMs: Math.round(performance.now() - t0),
      requiredPackages: [],
    } satisfies ParseWorkerResponse);
  }
};