/**
 * Teeex — React binding for the TeX engine.
 *
 * Two behaviours here exist specifically to make real TeX compilation feel
 * usable, since a genuine pdfLaTeX pass costs seconds rather than milliseconds:
 *
 *  - The last successful PDF stays on screen while a new compile runs, and
 *    while a failing compile is being fixed. The preview never blanks, and a
 *    syntax error mid-edit does not destroy the user's view of their document.
 *
 *  - Compiles are keyed on a content fingerprint, so re-renders that do not
 *    change any file never trigger a recompile.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectFile } from '../types/latex';
import {
  texEngine,
  type CompileOutcome,
  type EngineId,
  type EngineStatus,
} from '../services/latexCompiler';

export interface UseTexEngineOptions {
  files: ProjectFile[];
  engine?: EngineId;
  autoCompile?: boolean;
  /**
   * Quiet period after the last edit before compiling. Tuned well above the
   * old 700 ms: with real TeX, a shorter window just queues work that the next
   * keystroke immediately supersedes.
   */
  debounceMs?: number;
}

export interface UseTexEngineResult {
  status: EngineStatus;
  /** Most recent successfully compiled PDF, retained across failures. */
  pdf: Uint8Array | null;
  /** Result of the latest compile that actually ran. */
  outcome: CompileOutcome | null;
  isCompiling: boolean;
  /** True when `pdf` predates `outcome` — i.e. the view is a last-good build. */
  isStale: boolean;
  lastCompiledAt: number | null;
  compile: () => void;
}

/**
 * Cheap rolling hash over everything the engine would read.
 *
 * Deliberately a hash rather than a concatenation: building a string of the
 * whole project on every render allocates megabytes for a large document, on
 * the keystroke path. FNV-1a over name + content + the fields that change what
 * gets mounted is enough to decide "did anything change", which is all this is
 * for. A collision would mean one skipped recompile, recoverable with the
 * Recompile button; the cost of being wrong is low and bounded.
 */
function mixHash(initialHash: number, text: string): number {
  let hash = initialHash;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash;
}

function fingerprintFiles(files: ProjectFile[]): string {
  let hash = 0x811c9dc5;

  for (const file of files) {
    hash = mixHash(hash, file.name);
    hash = mixHash(hash, file.content);
    hash = mixHash(hash, file.isEntry ? '\u0001' : '\u0002');
    // Figures hold their bytes in dataUrl; hashing a multi-megabyte base64
    // string per render is exactly what this function exists to avoid, so use
    // its length plus a short prefix as a replacement signal.
    if (file.dataUrl) {
      hash = mixHash(hash, String(file.dataUrl.length));
      hash = mixHash(hash, file.dataUrl.slice(0, 64));
    }
  }

  // Length guards against a hash collision between projects of different size.
  return `${files.length}:${(hash >>> 0).toString(36)}`;
}

export function useTexEngine({
  files,
  engine = 'pdflatex',
  autoCompile = true,
  debounceMs = 350,
}: UseTexEngineOptions): UseTexEngineResult {
  const [status, setStatus] = useState<EngineStatus>(() => texEngine.getStatus());
  const [outcome, setOutcome] = useState<CompileOutcome | null>(null);
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [lastCompiledAt, setLastCompiledAt] = useState<number | null>(null);

  const filesRef = useRef(files);
  filesRef.current = files;

  const engineRef = useRef(engine);
  engineRef.current = engine;

  /** Highest request id whose result we have accepted. */
  const acceptedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => texEngine.subscribe(setStatus), []);

  // Start the engine download immediately so it overlaps with the user's first
  // edits rather than blocking their first compile.
  useEffect(() => {
    texEngine.prewarm(engineRef.current);
  }, []);

  const runCompile = useCallback(async () => {
    setIsCompiling(true);
    try {
      const result = await texEngine.compile({
        files: filesRef.current,
        engine: engineRef.current,
      });

      if (result.superseded) return;
      // Guard against out-of-order resolution.
      if (result.requestId < acceptedRef.current) return;
      acceptedRef.current = result.requestId;

      setOutcome(result);
      setLastCompiledAt(Date.now());
      if (result.ok && result.pdf) {
        setPdf(result.pdf);
      }
    } finally {
      setIsCompiling(false);
    }
  }, []);

  const fingerprint = useMemo(() => fingerprintFiles(files), [files]);

  useEffect(() => {
    if (!autoCompile) return;
    if (!fingerprint) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void runCompile();
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fingerprint, autoCompile, debounceMs, runCompile]);

  const isStale = Boolean(pdf) && Boolean(outcome) && !outcome!.ok;

  return {
    status,
    pdf,
    outcome,
    isCompiling,
    isStale,
    lastCompiledAt,
    compile: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void runCompile();
    },
  };
}
