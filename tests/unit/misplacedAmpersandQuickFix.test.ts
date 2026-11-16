// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseTexLog } from '../../src/services/texLog';
import { diagnoseLatex } from '../../src/services/latexParser';
import { useUnifiedDiagnostics, type UnifiedDiagnosticsResult } from '../../src/hooks/useUnifiedDiagnostics';
import type { ProjectFile } from '../../src/types/latex';

describe('Misplaced Alignment Tab (&) Quick-Fix & Diagnostics', () => {
  it('detects misplaced alignment tab error in compiler logs and generates suggestedFix', () => {
    const log = [
      '! Misplaced alignment tab character &.',
      '<argument> Educational &',
      '                Public Outreach',
      'l.496 \\section{Educational & Public Outreach}',
      "I can't figure out why you would want to use a tab mark",
      'here. If you just want an ampersand, the remedy is',
      "simple: Just type `I\\&' now.",
      '! ==> Fatal error occurred, no output PDF file produced!',
    ].join('\n');

    const result = parseTexLog(log);
    const diag = result.diagnostics.find((d) => d.code === 'syntax');

    expect(diag).toBeDefined();
    expect(diag!.line).toBe(496);
    expect(diag!.message).toContain('Misplaced alignment tab character &');
    expect(diag!.hint).toContain('reserved for table alignment');
    expect(diag!.suggestedFix).toBeDefined();
    expect(diag!.suggestedFix!.title).toBe('Escape ampersand (\\&)');
    expect(diag!.suggestedFix!.replacement).toBe('\\section{Educational \\& Public Outreach}');
    expect(diag!.suggestedFix!.startLine).toBe(496);
    expect(diag!.suggestedFix!.endLine).toBe(496);
  });

  it('AST parser flags unescaped ampersand in section titles with error and quick-fix', () => {
    const doc = [
      '\\documentclass{article}',
      '\\begin{document}',
      '\\section{Educational & Public Outreach}',
      'Some regular text here.',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const ampersandDiag = diags.find(
      (d) => d.rule === 'syntax/misplaced-alignment-tab' && d.line === 3
    );

    expect(ampersandDiag).toBeDefined();
    expect(ampersandDiag!.severity).toBe('error');
    expect(ampersandDiag!.message).toContain("In text and section headings, use '\\&'");
    expect(ampersandDiag!.suggestedFix).toBeDefined();
    expect(ampersandDiag!.suggestedFix!.title).toBe('Escape ampersand (\\&)');
    expect(ampersandDiag!.suggestedFix!.replacement).toBe(
      '\\section{Educational \\& Public Outreach}'
    );
  });

  it('AST parser allows legitimate ampersands inside tabular and align environments', () => {
    const doc = [
      '\\documentclass{article}',
      '\\usepackage{amsmath}',
      '\\begin{document}',
      '\\begin{tabular}{cc}',
      '  Col 1 & Col 2 \\\\',
      '\\end{tabular}',
      '\\begin{align}',
      '  x &= y + z \\\\',
      '\\end{align}',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const ampersandDiags = diags.filter(
      (d) => d.rule === 'syntax/misplaced-alignment-tab'
    );

    expect(ampersandDiags).toHaveLength(0);
  });

  it('AST parser flags unescaped ampersand in plain body text outside tables', () => {
    const doc = [
      '\\documentclass{article}',
      '\\begin{document}',
      'Research & Development is critical.',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const ampersandDiag = diags.find(
      (d) => d.rule === 'syntax/misplaced-alignment-tab' && d.line === 3
    );

    expect(ampersandDiag).toBeDefined();
    expect(ampersandDiag!.suggestedFix!.replacement).toBe(
      'Research \\& Development is critical.'
    );
  });

  it('applies 1-click quick-fix for ampersand replacing it with \\& on target line', async () => {
    let hookResult: UnifiedDiagnosticsResult | null = null;
    function TestHarness({
      compilerDiagnostics,
    }: {
      compilerDiagnostics: any[];
    }) {
      hookResult = useUnifiedDiagnostics({
        parserDiagnostics: [],
        compilerDiagnostics,
        activeFileName: 'main.tex',
      });
      return null;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const log = [
      '! Misplaced alignment tab character &.',
      '<argument> Educational &',
      '                Public Outreach',
      'l.3 \\section{Educational & Public Outreach}',
    ].join('\n');
    const { diagnostics } = parseTexLog(log);

    let files: ProjectFile[] = [
      {
        id: 'main.tex',
        name: 'main.tex',
        content: '\\documentclass{article}\n\\begin{document}\n\\section{Educational & Public Outreach}\n\\end{document}',
        type: 'tex',
        isEntry: true,
      },
    ];

    const updateFileContent = (fileId: string, newContent: string) => {
      files = files.map((f) => (f.id === fileId ? { ...f, content: newContent } : f));
    };

    await act(async () => {
      root.render(React.createElement(TestHarness, { compilerDiagnostics: diagnostics }));
    });

    expect(hookResult).not.toBeNull();
    const diagId = hookResult!.diagnostics[0].id;
    let ok = false;
    act(() => {
      ok = hookResult!.applyQuickFix(diagId, files, updateFileContent);
    });

    expect(ok).toBe(true);
    expect(files[0].content).toContain('\\section{Educational \\& Public Outreach}');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
