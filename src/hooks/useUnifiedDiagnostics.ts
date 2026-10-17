/**
 * Teeex — Unified Diagnostics Hook.
 * Merges high-speed AST parser diagnostics (from Web Worker) with
 * authoritative TeX log compiler diagnostics (from pdfTeX / busytex).
 * Normalizes severities, deduplicates matching issues, and provides
 * a 1-click quick-fix applicator that modifies the target project file.
 */

import { useMemo, useCallback } from 'react';
import type { Diagnostic as ParserDiagnostic, ProjectFile } from '../types/latex';
import type { CompileDiagnostic, DiagnosticSuggestedFix } from '../services/texLog';

export interface UnifiedDiagnostic {
  id: string;
  source: 'parser' | 'compiler';
  severity: 'error' | 'warning' | 'info';
  code?: string;
  message: string;
  file?: string;
  line?: number;
  endLine?: number;
  column?: number;
  context?: string;
  hint?: string;
  suggestedFix?: DiagnosticSuggestedFix;
}

export interface UseUnifiedDiagnosticsOptions {
  parserDiagnostics?: ParserDiagnostic[];
  compilerDiagnostics?: CompileDiagnostic[];
  activeFileName?: string;
}

export interface UnifiedDiagnosticsResult {
  diagnostics: UnifiedDiagnostic[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  applyQuickFix: (
    diagnosticId: string,
    files: ProjectFile[],
    updateFileContent: (fileId: string, newContent: string) => void
  ) => boolean;
}

export function useUnifiedDiagnostics({
  parserDiagnostics = [],
  compilerDiagnostics = [],
  activeFileName = 'main.tex',
}: UseUnifiedDiagnosticsOptions): UnifiedDiagnosticsResult {
  const diagnostics = useMemo<UnifiedDiagnostic[]>(() => {
    const list: UnifiedDiagnostic[] = [];
    const seenSignatures = new Set<string>();

    // 1. Authoritative TeX compiler diagnostics
    for (const c of compilerDiagnostics) {
      const sig = `${c.file || activeFileName}:${c.line || 0}:${c.code || c.message}`;
      seenSignatures.add(sig);

      list.push({
        id: c.id,
        source: 'compiler',
        severity: c.severity,
        code: c.code,
        message: c.message,
        file: c.file || activeFileName,
        line: c.line,
        endLine: c.endLine,
        context: c.context,
        hint: c.hint,
        suggestedFix: c.suggestedFix,
      });
    }

    // 2. High-speed AST parser diagnostics (suppress duplicates on same file & line)
    for (const p of parserDiagnostics) {
      const targetFile = activeFileName;
      const sig1 = `${targetFile}:${p.line}:${p.rule}`;
      const sig2 = `${targetFile}:${p.line}:syntax`;
      if (seenSignatures.has(sig1) || seenSignatures.has(sig2)) continue;

      let fix: DiagnosticSuggestedFix | undefined;
      if (p.suggestedFix) {
        fix = {
          title: p.suggestedFix.title,
          description: p.suggestedFix.description || '',
          replacement: p.suggestedFix.replacement,
          startLine: p.suggestedFix.startLine ?? p.line,
          endLine: p.suggestedFix.endLine ?? p.line,
        };
      }

      list.push({
        id: p.id,
        source: 'parser',
        severity: p.severity,
        code: p.rule,
        message: p.message,
        file: targetFile,
        line: p.line,
        column: p.column,
        hint: p.rawLog,
        suggestedFix: fix,
      });
    }

    // Sort by severity (error > warning > info) and then by line number
    const severityWeight = { error: 0, warning: 1, info: 2 };
    return list.sort((a, b) => {
      const sw = severityWeight[a.severity] - severityWeight[b.severity];
      if (sw !== 0) return sw;
      return (a.line || 0) - (b.line || 0);
    });
  }, [parserDiagnostics, compilerDiagnostics, activeFileName]);

  const errorCount = useMemo(() => diagnostics.filter((d) => d.severity === 'error').length, [diagnostics]);
  const warningCount = useMemo(() => diagnostics.filter((d) => d.severity === 'warning').length, [diagnostics]);
  const infoCount = useMemo(() => diagnostics.filter((d) => d.severity === 'info').length, [diagnostics]);

  const applyQuickFix = useCallback(
    (
      diagnosticId: string,
      files: ProjectFile[],
      updateFileContent: (fileId: string, newContent: string) => void
    ): boolean => {
      const diag = diagnostics.find((d) => d.id === diagnosticId);
      if (!diag || !diag.suggestedFix) return false;

      const fix = diag.suggestedFix;
      const targetFileName = diag.file || activeFileName;
      const targetFile =
        files.find((f) => f.name === targetFileName || f.id === targetFileName) ||
        files.find((f) => f.name.endsWith(targetFileName)) ||
        files[0];

      if (!targetFile || typeof targetFile.content !== 'string') return false;

      const lines = targetFile.content.split('\n');
      const startIdx = Math.max(0, fix.startLine - 1);
      const endIdx = Math.min(lines.length - 1, fix.endLine - 1);

      // If replacement starts with a preamble package insert (e.g. \usepackage{...})
      if (fix.startLine === 1 && fix.endLine === 1 && fix.replacement.startsWith('\\usepackage')) {
        // Find documentclass line
        const docClassIdx = lines.findIndex((l) => /\\documentclass/.test(l));
        if (docClassIdx >= 0) {
          lines.splice(docClassIdx + 1, 0, fix.replacement);
        } else {
          lines.unshift(fix.replacement);
        }
      } else {
        // Standard line range replacement
        lines.splice(startIdx, endIdx - startIdx + 1, fix.replacement);
      }

      updateFileContent(targetFile.id, lines.join('\n'));
      return true;
    },
    [diagnostics, activeFileName]
  );

  return {
    diagnostics,
    errorCount,
    warningCount,
    infoCount,
    applyQuickFix,
  };
}
