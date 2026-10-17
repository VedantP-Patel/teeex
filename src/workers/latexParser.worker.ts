/// <reference lib="webworker" />
import type { Diagnostic, LatexLabel, ParsedDocument, ProjectFile } from '../types/latex';
import {
  diagnoseLatex,
  extractLatexLabels,
  parseLatexDocument,
} from '../services/latexParser';

export interface ParseWorkerRequest {
  id: number;
  type: 'parse';
  content: string;
  files: ProjectFile[];
  activeFileName: string;
}

export interface ParseWorkerResponse {
  id: number;
  type: 'parseResult';
  diagnostics: Diagnostic[];
  parsedDoc: ParsedDocument;
  labels: LatexLabel[];
  durationMs: number;
}

self.onmessage = (event: MessageEvent<ParseWorkerRequest>) => {
  const data = event.data;
  if (!data || data.type !== 'parse') return;

  const { id, content, files, activeFileName } = data;
  const t0 = performance.now();
  const isTex = activeFileName.endsWith('.tex');
  const diagnostics = isTex ? diagnoseLatex(content) : [];
  const parsedDoc = parseLatexDocument(content, files);
  const labels = extractLatexLabels(files);
  const elapsed = performance.now() - t0;

  const response: ParseWorkerResponse = {
    id,
    type: 'parseResult',
    diagnostics,
    parsedDoc,
    labels,
    durationMs: Math.max(0.5, Number(elapsed.toFixed(1))),
  };

  self.postMessage(response);
};
