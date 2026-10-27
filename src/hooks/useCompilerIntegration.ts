import { useState, useEffect, useMemo, useCallback } from 'react';
import type { CompileMode, CompileState, ProjectFile } from '../types/latex';
import type { EngineId } from '../services/latexCompiler';
import { useTexEngine } from './useTexEngine';
import { setCompilerState } from '../stores/compilerStore';
import { parseBibtex, type BibEntry } from '../services/bibtexParser';
import {
  parseSyncTex,
  forwardSync,
  normaliseTexPath,
  type SyncTexIndex,
  type ForwardMatch,
} from '../services/synctex';

interface UseCompilerIntegrationOptions {
  files: ProjectFile[];
  projectId: string;
  activeFileName?: string;
  liveDurationMs?: number;
  onJumpToFileLine?: (fileId: string, line: number) => void;
  onToast?: (message: string) => void;
}

export function useCompilerIntegration({
  files,
  projectId,
  activeFileName = 'main.tex',
  liveDurationMs = 14,
  onJumpToFileLine,
  onToast,
}: UseCompilerIntegrationOptions) {
  // Engine selection (Finding 3)
  const [selectedEngine, setSelectedEngineState] = useState<EngineId>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('teeex_engine') as EngineId;
      if (saved === 'pdflatex' || saved === 'xelatex' || saved === 'lualatex') {
        return saved;
      }
    }
    return 'pdflatex';
  });

  const setSelectedEngine = useCallback((engine: EngineId) => {
    try {
      localStorage.setItem('teeex_engine', engine);
    } catch {}
    setSelectedEngineState(engine);
    if (onToast) {
      const labels: Record<EngineId, string> = {
        pdflatex: 'pdfLaTeX (Standard)',
        xelatex: 'XeLaTeX (Unicode/OpenType)',
        lualatex: 'LuaLaTeX (LuaHBTeX Modern)',
      };
      onToast(`Switched TeX engine to ${labels[engine] || engine}`);
    }
  }, [onToast]);

  // Compile mode
  const [compileMode, setCompileMode] = useState<CompileMode>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('teeex_compile_mode') as CompileMode;
      if (saved === 'fast' || saved === 'publication') return saved;
    }
    return 'fast';
  });

  const handleToggleCompileMode = useCallback((mode: CompileMode) => {
    try {
      localStorage.setItem('teeex_compile_mode', mode);
    } catch {}
    setCompileMode(mode);
  }, []);

  // Aggregated citations from .tex and .bib files
  const citations = useMemo(() => {
    const keys = new Set<string>();
    const citeRegex = /\\(?:cite|citep|citet|parencite|textcite|autocite)\s*(?:\[[^\]]*\])*\s*\{([^}]+)\}/g;
    for (const f of files) {
      if (f.name.endsWith('.tex')) {
        for (const m of f.content.matchAll(citeRegex)) {
          for (const k of m[1].split(',')) {
            const trimmed = k.trim();
            if (trimmed) keys.add(trimmed);
          }
        }
      } else if (f.name.endsWith('.bib') || f.type === 'bib') {
        const parsed = parseBibtex(f.content);
        for (const entry of parsed) {
          if (entry.key) keys.add(entry.key);
        }
      }
    }
    return Array.from(keys);
  }, [files]);

  // Multi-file BibTeX parsed entries
  const bibEntries = useMemo<BibEntry[]>(() => {
    const bibFiles = files.filter(f => f.name.endsWith('.bib') && f.content?.trim());
    if (bibFiles.length === 0) return [];

    const entriesMap = new Map<string, BibEntry>();
    for (const bf of bibFiles) {
      const parsed = parseBibtex(bf.content);
      for (const entry of parsed) {
        if (!entriesMap.has(entry.key)) {
          entriesMap.set(entry.key, entry);
        }
      }
    }
    return Array.from(entriesMap.values());
  }, [files]);

  // Invoking the TeX engine hook
  const texEngineView = useTexEngine({
    files,
    projectId,
    compileMode,
    citations,
    engine: selectedEngine,
  });

  // Sync outcome to compilerStore
  useEffect(() => {
    setCompilerState({
      status: texEngineView.status,
      pdfBytes: texEngineView.pdf,
      synctex: texEngineView.outcome?.synctex ?? null,
      diagnostics: texEngineView.outcome?.diagnostics ?? [],
      log: texEngineView.outcome?.log ?? '',
      isCompiling: texEngineView.isCompiling,
      durationMs: texEngineView.durationMs ?? undefined,
    });
  }, [
    texEngineView.status,
    texEngineView.pdf,
    texEngineView.outcome,
    texEngineView.isCompiling,
    texEngineView.durationMs,
  ]);

  // Reactive CompileState object for UI consumers (Navbar, Dock, DeskPet)
  const [compileState, setCompileState] = useState<CompileState>({
    status: 'success',
    durationMs: 14,
    timestamp: 'Initial',
    errorCount: 0,
    warningCount: 0,
    rawLogs: ['Output written on main.pdf (1 page, 38402 bytes).'],
  });

  useEffect(() => {
    if (texEngineView.isCompiling) {
      queueMicrotask(() => {
        setCompileState(prev => (prev.status === 'compiling' ? prev : { ...prev, status: 'compiling', isDebouncing: false }));
      });
      return;
    }

    if (texEngineView.isDebouncing) {
      queueMicrotask(() => {
        setCompileState(prev => (prev.isDebouncing ? prev : { ...prev, isDebouncing: true }));
      });
      return;
    }

    const outcome = texEngineView.outcome;
    queueMicrotask(() => {
      if (!outcome) {
        setCompileState(prev => ({
          ...prev,
          durationMs: liveDurationMs,
          isDebouncing: false,
        }));
        return;
      }

      setCompileState({
        status: outcome.ok ? 'success' : 'error',
        durationMs: liveDurationMs,
        pdfDurationMs: outcome.durationMs,
        isDebouncing: false,
        errorCount: outcome.diagnostics.filter(d => d.severity === 'error').length,
        warningCount: outcome.diagnostics.filter(d => d.severity === 'warning').length,
        timestamp: texEngineView.lastCompiledAt
          ? new Date(texEngineView.lastCompiledAt).toLocaleTimeString()
          : 'Just now',
        rawLogs: outcome.log ? outcome.log.split(/\r?\n/).filter(Boolean) : [],
        compileMode: outcome.compileMode ?? compileMode,
      });
    });
  }, [
    texEngineView.isCompiling,
    texEngineView.isDebouncing,
    texEngineView.outcome,
    texEngineView.lastCompiledAt,
    liveDurationMs,
    compileMode,
  ]);

  const triggerCompile = useCallback(() => {
    setCompileState(prev => ({ ...prev, status: 'compiling' }));
    texEngineView.compile();
  }, [texEngineView]);

  // SyncTeX Index
  const [syncTexIndex, setSyncTexIndex] = useState<SyncTexIndex | null>(null);
  useEffect(() => {
    const synctex = texEngineView.outcome?.synctex;
    if (!synctex) return;

    let cancelled = false;
    void parseSyncTex(synctex)
      .then(index => {
        if (!cancelled) setSyncTexIndex(index);
      })
      .catch(() => {
        if (!cancelled) setSyncTexIndex(null);
      });

    return () => {
      cancelled = true;
    };
  }, [texEngineView.outcome?.synctex]);

  // Forward target tracking
  const [forwardTargetLine, setForwardTargetLine] = useState<{ line: number; nonce: number } | null>(null);

  const forwardTarget = useMemo<ForwardMatch | null>(() => {
    if (!syncTexIndex || !forwardTargetLine) return null;
    return forwardSync(syncTexIndex, activeFileName, forwardTargetLine.line, forwardTargetLine.nonce);
  }, [syncTexIndex, forwardTargetLine, activeFileName]);

  const handleInverseSync = useCallback(
    (file: string, line: number) => {
      const cleanFile = normaliseTexPath(file);
      const target =
        files.find(f => f.name === file) ??
        files.find(f => normaliseTexPath(f.name) === cleanFile) ??
        files.find(f => f.name.endsWith(`/${cleanFile}`) || cleanFile.endsWith(`/${f.name}`)) ??
        files.find(f => {
          const fBase = f.name.split('/').pop()?.replace(/\.[^/.]+$/, '');
          const cleanBase = cleanFile.split('/').pop()?.replace(/\.[^/.]+$/, '');
          return fBase && cleanBase && fBase === cleanBase;
        }) ??
        files.find(f => f.isEntry || f.name === 'main.tex');

      if (target && onJumpToFileLine) {
        onJumpToFileLine(target.id, line);
        if (onToast) onToast(`Jumped to line ${line} in ${target.name}`);
      }
    },
    [files, onJumpToFileLine, onToast]
  );

  const engineErrorSummary = useMemo(() => {
    const outcome = texEngineView.outcome;
    if (!outcome || outcome.ok) return null;
    const firstError = outcome.diagnostics.find(d => d.severity === 'error');
    if (!firstError) return null;
    const where = firstError.line ? ` (${firstError.file ?? ''}:${firstError.line})` : '';
    return `${firstError.message}${where}`;
  }, [texEngineView.outcome]);

  return {
    selectedEngine,
    setSelectedEngine,
    compileMode,
    setCompileMode: handleToggleCompileMode,
    compileState,
    setCompileState,
    texEngineView,
    triggerCompile,
    syncTexIndex,
    forwardTarget,
    forwardTargetLine,
    setForwardTargetLine,
    handleInverseSync,
    engineErrorSummary,
    citations,
    bibEntries,
  };
}
