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
import type { CompileMode, ProjectFile } from '../types/latex';
import {
  texEngine,
  type CompileOutcome,
  type EngineId,
  type EngineStatus,
} from '../services/latexCompiler';
import { loadCompiledSnapshot } from '../services/pdfSnapshotCache';

export interface UseTexEngineOptions {
  files: ProjectFile[];
  engine?: EngineId;
  autoCompile?: boolean;
  debounceMs?: number;
  projectId?: string;
  compileMode?: CompileMode;
  citations?: string[];
}

export interface UseTexEngineResult {
  status: EngineStatus;
  /** Most recent successfully compiled PDF, retained across failures. */
  pdf: Uint8Array | null;
  /** Result of the latest compile that actually ran. */
  outcome: CompileOutcome | null;
  isCompiling: boolean;
  /** True when a keystroke has queued compilation and the debounce timer is counting down. */
  isDebouncing: boolean;
  /** Wall-clock time of the last TeX compilation in milliseconds. */
  durationMs: number | null;
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
  debounceMs,
  projectId,
  compileMode = 'fast',
  citations,
}: UseTexEngineOptions): UseTexEngineResult {
  const [status, setStatus] = useState<EngineStatus>(() => texEngine.getStatus());
  const [outcome, setOutcome] = useState<CompileOutcome | null>(null);
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [lastCompiledAt, setLastCompiledAt] = useState<number | null>(null);

  const filesRef = useRef(files);
  filesRef.current = files;

  const engineRef = useRef(engine);
  engineRef.current = engine;

  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const compileModeRef = useRef(compileMode);
  compileModeRef.current = compileMode;

  const citationsRef = useRef(citations);
  citationsRef.current = citations;

  /** Highest request id whose result we have accepted. */
  const acceptedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => texEngine.subscribe(setStatus), []);

  // Start the engine download immediately so it overlaps with the user's first
  // edits rather than blocking their first compile.
  useEffect(() => {
    texEngine.prewarm(engineRef.current);
  }, []);

  // Layer 1: Instant IndexedDB snapshot restoration (< 50ms) to eliminate cold-start wait
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void loadCompiledSnapshot(projectId).then((cached) => {
      if (active && cached && cached.pdf && cached.pdf.byteLength > 0) {
        setPdf((curr) => (curr ? curr : cached.pdf));
        if (cached.synctex && cached.synctex.byteLength > 0) {
          setOutcome((prev) => {
            if (prev) return prev;
            return {
              ok: true,
              pdf: cached.pdf,
              synctex: cached.synctex,
              log: 'Restored from local snapshot cache.',
              diagnostics: [],
              missingPackages: [],
              rerunRequired: false,
              entryPath: 'main.tex',
              engine: engineRef.current,
              durationMs: 0,
              requestId: 0,
              superseded: false,
            };
          });
        }
      }
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  const runCompile = useCallback(async () => {
    setIsDebouncing(false);
    setIsCompiling(true);
    try {
      const result = await texEngine.compile({
        files: filesRef.current,
        engine: engineRef.current,
        projectId: projectIdRef.current,
        compileMode: compileModeRef.current,
        citations: citationsRef.current,
        onIntermediateResult: ({ pdf: pass1Pdf }) => {
          // Pass-1 Instant Streaming: update active viewport PDF immediately!
          if (pass1Pdf && pass1Pdf.byteLength > 0) {
            setPdf(pass1Pdf);
          }
        },
      });

      if (result.superseded) return;
      // Guard against out-of-order resolution.
      if (result.requestId < acceptedRef.current) return;
      acceptedRef.current = result.requestId;

      setOutcome(result);
      const timestamp = Date.now();
      setLastCompiledAt(timestamp);
      if (typeof window !== 'undefined') {
        const win = window as unknown as {
          __teeexLastCompiledAt?: number;
          __teeexCompileCount?: number;
          __teeexLastOutcome?: CompileOutcome;
        };
        win.__teeexLastCompiledAt = timestamp;
        win.__teeexCompileCount = (win.__teeexCompileCount ?? 0) + 1;
        win.__teeexLastOutcome = result;
      }
      if (result.pdf && result.pdf.byteLength > 0) {
        setPdf(result.pdf);
      }
    } finally {
      setIsCompiling(false);
    }
  }, []);

  const fingerprint = useMemo(() => fingerprintFiles(files), [files]);

  // Ultra-responsive adaptive debounce for live editing:
  // Short docs: 250ms, medium: 380ms, large papers: 500ms.
  // Cuts up to 600ms of dead-time lag while preserving typing fluidity.
  const effectiveDebounceMs = useMemo(() => {
    if (debounceMs !== undefined) return debounceMs;
    const totalChars = files.reduce((acc, f) => acc + (f.content ? f.content.length : 0), 0);
    if (totalChars < 5000) return 250;
    if (totalChars < 25000) return 380;
    return 500;
  }, [debounceMs, files]);

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (!autoCompile) return;
    if (!fingerprint) return;

    // Immediately trigger compilation on initial mount without any debounce delay
    if (isInitialMount.current) {
      isInitialMount.current = false;
      setIsDebouncing(false);
      void runCompile();
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    setIsDebouncing(true);
    timerRef.current = setTimeout(() => {
      setIsDebouncing(false);
      void runCompile();
    }, effectiveDebounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fingerprint, autoCompile, effectiveDebounceMs, runCompile]);

  const isStale = Boolean(pdf) && Boolean(outcome) && !outcome!.ok;

  return {
    status,
    pdf,
    outcome,
    isCompiling,
    isDebouncing,
    durationMs: outcome?.durationMs ?? null,
    isStale,
    lastCompiledAt,
    compile: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsDebouncing(false);
      void runCompile();
    },
  };
}
