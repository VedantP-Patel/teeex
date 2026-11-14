/// <reference lib="webworker" />
import type { Diagnostic, LatexLabel, ParsedDocument, ProjectFile } from '../types/latex';
import {
  diagnoseLatex,
  extractLatexLabels,
  parseLatexDocument,
} from '../services/latexParser';

export interface SyncFilesWorkerRequest {
  type: 'syncFiles';
  files: ProjectFile[];
}

export interface ParseWorkerRequest {
  id: number;
  type: 'parse';
  content: string;
  activeFileId?: string;
  activeFileName: string;
  files?: ProjectFile[];
}

export interface ParseWorkerResponse {
  id: number;
  type: 'parseResult';
  diagnostics: Diagnostic[];
  parsedDoc: ParsedDocument;
  labels: LatexLabel[];
  durationMs: number;
}

let cachedFiles: ProjectFile[] = [];

self.onmessage = (event: MessageEvent<ParseWorkerRequest | SyncFilesWorkerRequest>) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'syncFiles') {
    cachedFiles = data.files;
    return;
  }

  if (data.type !== 'parse') return;

  const { id, content, activeFileId, activeFileName } = data;
  if (data.files) {
    cachedFiles = data.files;
  } else if (cachedFiles.length > 0) {
    cachedFiles = cachedFiles.map((f) =>
      (activeFileId && f.id === activeFileId) || f.name === activeFileName
        ? { ...f, content }
        : f
    );
  }

  const t0 = performance.now();
  const isTex = activeFileName.endsWith('.tex');
  const diagnostics = isTex ? diagnoseLatex(content) : [];
  const parsedDoc = parseLatexDocument(content, cachedFiles);
  const labels = extractLatexLabels(cachedFiles);
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