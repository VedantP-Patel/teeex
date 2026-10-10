/**
 * Teeex Studio — useLatexCompiler Hook
 *
 * Automatically manages debounced WebAssembly compilation of LaTeX documents.
 * Keeps UI fluid while running genuine pdfLaTeX in the background.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ProjectFile } from '../types/latex';
import {
  latexCompiler,
  type WasmCompileResult,
  type CompilerEngineStatus,
} from '../services/latexCompiler';

export interface UseLatexCompilerOptions {
  code: string;
  files?: ProjectFile[];
  debounceMs?: number;
  autoCompile?: boolean;
}

export function useLatexCompiler({
  code,
  files = [],
  debounceMs = 700,
  autoCompile = true,
}: UseLatexCompilerOptions) {
  const [result, setResult] = useState<WasmCompileResult | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [engineStatus, setEngineStatus] = useState<CompilerEngineStatus>(latexCompiler.getStatus());
  const [downloadProgress, setDownloadProgress] = useState<number>(latexCompiler.getDownloadPercent());
  const [lastCompiledAt, setLastCompiledAt] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeRef = useRef(code);
  const filesRef = useRef(files);

  codeRef.current = code;
  filesRef.current = files;

  // Listen to engine status changes (e.g. package downloads)
  useEffect(() => {
    return latexCompiler.onStatusChange((status, progress) => {
      setEngineStatus(status);
      if (progress !== undefined) setDownloadProgress(progress);
    });
  }, []);

  // Primary compile execution
  const executeCompile = useCallback(async (forcedCode?: string, forcedFiles?: ProjectFile[]) => {
    const targetCode = forcedCode ?? codeRef.current;
    const targetFiles = forcedFiles ?? filesRef.current;

    if (!targetCode || !targetCode.trim()) return;

    const currentId = ++requestIdRef.current;
    setIsCompiling(true);

    try {
      const compileRes = await latexCompiler.compile(targetCode, targetFiles);
      // Discard results if a newer compile was triggered in the meantime
      if (currentId === requestIdRef.current) {
        setResult(compileRes);
        setLastCompiledAt(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.warn('[useLatexCompiler] compile error:', err);
    } finally {
      if (currentId === requestIdRef.current) {
        setIsCompiling(false);
      }
    }
  }, []);

  // Debounced auto-compilation when code changes
  useEffect(() => {
    if (!autoCompile) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      executeCompile();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [code, autoCompile, debounceMs, executeCompile]);

  return {
    result,
    isCompiling,
    engineStatus,
    downloadProgress,
    lastCompiledAt,
    triggerCompile: () => executeCompile(),
  };
}
