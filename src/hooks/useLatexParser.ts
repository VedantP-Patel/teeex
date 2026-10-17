/**
 * Teeex — React hook for structural LaTeX parsing and linting.
 * Offloads heavy AST extraction, transclusion expansion, and diagnostic linting
 * to a dedicated Web Worker (src/workers/latexParser.worker.ts).
 * Falls back gracefully to synchronous parsing if Web Workers are unavailable
 * (e.g., inside happy-dom / node test runners).
 */

import { useEffect, useRef, useState } from 'react';
import type { Diagnostic, LatexLabel, ParsedDocument, ProjectFile } from '../types/latex';
import {
  diagnoseLatex,
  extractLatexLabels,
  parseLatexDocument,
} from '../services/latexParser';
import type { ParseWorkerRequest, ParseWorkerResponse } from '../workers/latexParser.worker';

export interface UseLatexParserOptions {
  content: string;
  files: ProjectFile[];
  activeFileName?: string;
  /** Quiet period after last keystroke before parsing. Default: 180ms */
  debounceMs?: number;
}

export interface LatexParserResult {
  diagnostics: Diagnostic[];
  parsedDoc: ParsedDocument;
  labels: LatexLabel[];
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

function runSynchronousFallback(content: string, files: ProjectFile[], isTex: boolean): LatexParserResult {
  const t0 = performance.now();
  const diagnostics = isTex ? diagnoseLatex(content) : [];
  const parsedDoc = parseLatexDocument(content, files);
  const labels = extractLatexLabels(files);
  const elapsed = performance.now() - t0;
  const durationMs = elapsed < 10 ? Number(elapsed.toFixed(1)) : Math.round(elapsed);

  return {
    diagnostics,
    parsedDoc,
    labels,
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

  const [result, setResult] = useState<LatexParserResult>({
    diagnostics: [],
    parsedDoc: EMPTY_PARSED_DOC,
    labels: [],
    durationMs: 1,
    isParsing: true,
  });

  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextRequestIdRef = useRef<number>(1);
  const activeRequestIdRef = useRef<number | null>(null);
  const lastFileNameRef = useRef<string>(activeFileName);
  const isFirstRunRef = useRef<boolean>(true);

  // Initialize Web Worker with Vite ES module syntax if supported
  useEffect(() => {
    if (typeof Worker === 'undefined') return;

    try {
      const worker = new Worker(
        new URL('../workers/latexParser.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (event: MessageEvent<ParseWorkerResponse>) => {
        const data = event.data;
        if (!data || data.type !== 'parseResult') return;
        if (data.id !== activeRequestIdRef.current) return; // Discard stale/cancelled requests

        setResult({
          diagnostics: data.diagnostics,
          parsedDoc: data.parsedDoc,
          labels: data.labels,
          durationMs: data.durationMs,
          isParsing: false,
        });
      };

      worker.onerror = (err) => {
        console.warn('[useLatexParser] Worker execution failed, falling back to sync:', err);
      };

      workerRef.current = worker;
    } catch (err) {
      console.warn('[useLatexParser] Could not instantiate parser worker:', err);
      workerRef.current = null;
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
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
      const worker = workerRef.current;
      if (worker) {
        const reqId = ++nextRequestIdRef.current;
        activeRequestIdRef.current = reqId;
        const msg: ParseWorkerRequest = {
          id: reqId,
          type: 'parse',
          content,
          files,
          activeFileName,
        };
        worker.postMessage(msg);
      } else {
        // Synchronous fallback (happy-dom or unsupported worker)
        setResult(runSynchronousFallback(content, files, isTex));
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