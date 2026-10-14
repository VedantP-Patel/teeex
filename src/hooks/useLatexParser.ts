/**
 * Teeex — React hook for asynchronous LaTeX parsing and draft HTML compilation.
 */

import { useEffect, useRef, useState } from 'react';
import type { Diagnostic, ParsedDocument, ProjectFile } from '../types/latex';
import type { ParseWorkerRequest, ParseWorkerResponse } from '../workers/latexWorker';
import {
  diagnoseLatex,
  parseLatexDocument,
  renderLatexToHtml,
} from '../services/latexParser';

export interface UseLatexParserOptions {
  content: string;
  files: ProjectFile[];
  activeFileName?: string;
  /** Quiet period after last keystroke before sending parse job to worker. Default: 180ms */
  debounceMs?: number;
}

export interface LatexParserResult {
  diagnostics: Diagnostic[];
  parsedDoc: ParsedDocument;
  renderedHtml: string;
  durationMs: number;
  isParsing: boolean;
}

const EMPTY_PARSED_DOC: ParsedDocument = {
  title: '',
  authors: [],
  date: '',
  abstract: '',
  sections: [],
  mathBlocks: [],
  citations: [],
  isTwoColumn: false,
  documentClass: 'article',
};

function syncParse(content: string, files: ProjectFile[], isTex: boolean): LatexParserResult {
  const t0 = performance.now();
  const diagnostics = isTex ? diagnoseLatex(content) : [];
  const parsedDoc = parseLatexDocument(content, files);
  const renderedHtml = renderLatexToHtml(content, files);
  const elapsed = performance.now() - t0;
  const durationMs = elapsed < 10 ? Number(elapsed.toFixed(1)) : Math.round(elapsed);

  return {
    diagnostics,
    parsedDoc,
    renderedHtml,
    durationMs: Math.max(0.5, durationMs),
    isParsing: false,
  };
}

export function useLatexParser({
  content,
  files,
  activeFileName = 'main.tex',
  debounceMs = 180,
}: UseLatexParserOptions): LatexParserResult {
  const isTex = activeFileName.endsWith('.tex');

  // Lightweight initial state so mount never blocks the main UI thread
  const [result, setResult] = useState<LatexParserResult>({
    diagnostics: [],
    parsedDoc: EMPTY_PARSED_DOC,
    renderedHtml: '',
    durationMs: 1,
    isParsing: true,
  });

  const workerRef = useRef<Worker | null>(null);
  const nextRequestIdRef = useRef<number>(1);
  const acceptedRequestIdRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFileNameRef = useRef<string>(activeFileName);
  const isFirstRunRef = useRef<boolean>(true);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;

    try {
      const worker = new Worker(
        new URL('../workers/latexWorker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<ParseWorkerResponse>) => {
        const data = event.data;
        if (!data || data.requestId < acceptedRequestIdRef.current) {
          return;
        }

        acceptedRequestIdRef.current = data.requestId;
        setResult({
          diagnostics: data.diagnostics,
          parsedDoc: data.parsedDoc,
          renderedHtml: data.renderedHtml,
          durationMs: data.durationMs,
          isParsing: false,
        });
      };

      worker.onerror = (err) => {
        console.warn('[useLatexParser] Worker error, falling back to sync mode:', err);
      };

      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch (err) {
      console.warn('[useLatexParser] Could not instantiate Web Worker:', err);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const fileChanged = activeFileName !== lastFileNameRef.current;
    lastFileNameRef.current = activeFileName;

    const delay = isFirstRunRef.current || fileChanged ? 0 : debounceMs;
    isFirstRunRef.current = false;

    timerRef.current = setTimeout(() => {
      const requestId = ++nextRequestIdRef.current;

      const worker = workerRef.current;
      if (worker) {
        setResult((prev) => (prev.isParsing ? prev : { ...prev, isParsing: true }));
        // Only send files needed by the parser (or referenced images) to minimize structured clone overhead
        const request: ParseWorkerRequest = {
          requestId,
          content,
          files,
          isTex,
        };
        worker.postMessage(request);
      } else {
        const syncResult = syncParse(content, files, isTex);
        acceptedRequestIdRef.current = requestId;
        setResult(syncResult);
      }
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [content, files, activeFileName, isTex, debounceMs]);

  return result;
}