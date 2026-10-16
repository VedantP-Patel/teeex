/**
 * Teeex — React hook for structural LaTeX parsing and linting.
 */

import { useEffect, useRef, useState } from 'react';
import type { Diagnostic, LatexLabel, ParsedDocument, ProjectFile } from '../types/latex';
import {
  diagnoseLatex,
  extractLatexLabels,
  parseLatexDocument,
} from '../services/latexParser';

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

function runStructuralParse(content: string, files: ProjectFile[], isTex: boolean): LatexParserResult {
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

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFileNameRef = useRef<string>(activeFileName);
  const isFirstRunRef = useRef<boolean>(true);

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
      setResult(runStructuralParse(content, files, isTex));
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