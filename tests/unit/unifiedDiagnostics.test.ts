// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Diagnostic as ParserDiagnostic, ProjectFile } from '../../src/types/latex';
import type { CompileDiagnostic } from '../../src/services/texLog';
import {
  useUnifiedDiagnostics,
  type UnifiedDiagnosticsResult,
} from '../../src/hooks/useUnifiedDiagnostics';

describe('Unified Diagnostics & Quick Fix Hook', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let hookResult: UnifiedDiagnosticsResult | null = null;

  function TestHarness({
    parserDiagnostics,
    compilerDiagnostics,
    activeFileName,
  }: {
    parserDiagnostics: ParserDiagnostic[];
    compilerDiagnostics: CompileDiagnostic[];
    activeFileName: string;
  }) {
    hookResult = useUnifiedDiagnostics({
      parserDiagnostics,
      compilerDiagnostics,
      activeFileName,
    });
    return null;
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    hookResult = null;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  const parserDiags: ParserDiagnostic[] = [
    {
      id: 'p1',
      line: 5,
      column: 1,
      severity: 'error',
      message: 'Environment opened on line 5 is never closed.',
      rule: 'syntax/unclosed-environment',
      rawLog: '! LaTeX Error: unclosed env',
      suggestedFix: {
        title: 'Insert \\end{itemize} at end',
        description: 'Close the unclosed itemize environment',
        replacement: '\\end{itemize}',
        startLine: 10,
        endLine: 10,
      },
    },
  ];

  const compilerDiags: CompileDiagnostic[] = [
    {
      id: 'c1',
      line: 12,
      severity: 'error',
      code: 'missing-package',
      message: "File `graphicx.sty' not found.",
      suggestedFix: {
        title: 'Add \\usepackage{graphicx}',
        description: 'Inserts package declaration in preamble.',
        replacement: '\\usepackage{graphicx}',
        startLine: 1,
        endLine: 1,
      },
      raw: '! LaTeX Error',
    },
  ];

  it('merges parser and compiler diagnostics with proper prioritization', async () => {
    await act(async () => {
      root.render(
        React.createElement(TestHarness, {
          parserDiagnostics: parserDiags,
          compilerDiagnostics: compilerDiags,
          activeFileName: 'main.tex',
        })
      );
    });

    expect(hookResult).not.toBeNull();
    expect(hookResult!.diagnostics).toHaveLength(2);
    expect(hookResult!.errorCount).toBe(2);
    expect(hookResult!.warningCount).toBe(0);
    // Compiler diag c1 line 12, parser diag p1 line 5 -> sorted by line: p1 then c1
    expect(hookResult!.diagnostics[0].id).toBe('p1');
    expect(hookResult!.diagnostics[1].id).toBe('c1');
  });

  it('applies 1-click quick fix for preamble packages right after documentclass', async () => {
    let files: ProjectFile[] = [
      {
        id: 'main.tex',
        name: 'main.tex',
        content: '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}',
        type: 'tex',
        isEntry: true,
      },
    ];

    const updateFileContent = (fileId: string, newContent: string) => {
      files = files.map((f) => (f.id === fileId ? { ...f, content: newContent } : f));
    };

    await act(async () => {
      root.render(
        React.createElement(TestHarness, {
          parserDiagnostics: [],
          compilerDiagnostics: compilerDiags,
          activeFileName: 'main.tex',
        })
      );
    });

    let ok = false;
    act(() => {
      ok = hookResult!.applyQuickFix('c1', files, updateFileContent);
    });

    expect(ok).toBe(true);
    expect(files[0].content).toContain('\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}');
  });
});
