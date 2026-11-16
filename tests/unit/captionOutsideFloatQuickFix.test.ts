// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseTexLog } from '../../src/services/texLog';
import { diagnoseLatex } from '../../src/services/latexParser';
import { useUnifiedDiagnostics, type UnifiedDiagnosticsResult } from '../../src/hooks/useUnifiedDiagnostics';
import type { ProjectFile } from '../../src/types/latex';

describe('Caption Outside Float Quick-Fix & Diagnostics', () => {
  it('detects \\caption outside float error in compiler logs and generates suggestedFix', () => {
    const log = [
      '! Package caption Error: \\caption outside float.',
      'See the caption package documentation for explanation.',
      'Type H <return> for immediate help.',
      '...',
      'l.519 \\caption',
      '              {Drone Chassis}',
      'If you do not understand this error, please take a closer look',
      "! ==> Fatal error occurred, no output PDF file produced!",
    ].join('\n');

    const result = parseTexLog(log);
    const diag = result.diagnostics.find((d) => d.code === 'syntax');

    expect(diag).toBeDefined();
    expect(diag!.line).toBe(519);
    expect(diag!.message).toContain('\\caption outside float');
    expect(diag!.hint).toContain('\\captionof{figure}{...}');
    expect(diag!.suggestedFix).toBeDefined();
    expect(diag!.suggestedFix!.title).toBe('Change to \\captionof{figure}{...}');
    expect(diag!.suggestedFix!.replacement).toBe('\\captionof{figure}{Drone Chassis}');
    expect(diag!.suggestedFix!.startLine).toBe(519);
    expect(diag!.suggestedFix!.endLine).toBe(519);
  });

  it('detects \\caption outside float for tables in compiler logs and generates \\captionof{table}{...} suggestedFix', () => {
    const log = [
      '! Package caption Error: \\caption outside float.',
      'See the caption package documentation for explanation.',
      'Type H <return> for immediate help.',
      '...',
      'l.649 \\caption',
      '              {List of Drone Components with Descriptions and Quantities.}',
      '! ==> Fatal error occurred, no output PDF file produced!',
    ].join('\n');

    const result = parseTexLog(log);
    const diag = result.diagnostics.find((d) => d.code === 'syntax');

    expect(diag).toBeDefined();
    expect(diag!.line).toBe(649);
    expect(diag!.hint).toContain('\\captionof{table}{...}');
    expect(diag!.suggestedFix).toBeDefined();
    expect(diag!.suggestedFix!.title).toBe('Change to \\captionof{table}{...}');
    expect(diag!.suggestedFix!.replacement).toBe('\\captionof{table}{List of Drone Components with Descriptions and Quantities.}');
  });

  it('AST parser detects table context and flags \\caption outside float with \\captionof{table}{...} quick-fix', () => {
    const doc = [
      '\\documentclass{article}',
      '\\usepackage{caption,tabularx}',
      '\\begin{document}',
      '\\begin{strip}',
      '  \\caption{List of Drone Components}',
      '  \\begin{tabularx}{\\textwidth}{|c|X|}',
      '    1 & Pixhawk \\\\',
      '  \\end{tabularx}',
      '\\end{strip}',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const captionDiag = diags.find(
      (d) => d.rule === 'syntax/caption-outside-float' && d.line === 5
    );

    expect(captionDiag).toBeDefined();
    expect(captionDiag!.severity).toBe('error');
    expect(captionDiag!.message).toContain('\\captionof{table}{...}');
    expect(captionDiag!.suggestedFix).toBeDefined();
    expect(captionDiag!.suggestedFix!.title).toBe('Change to \\captionof{table}{...}');
    expect(captionDiag!.suggestedFix!.replacement).toBe('  \\captionof{table}{List of Drone Components}');
  });

  it('AST parser flags \\caption outside float with error and quick-fix', () => {
    const doc = [
      '\\documentclass{article}',
      '\\usepackage{caption}',
      '\\begin{document}',
      '\\begin{center}',
      '  \\includegraphics{image2.png}',
      '  \\caption{Drone Chassis}',
      '\\end{center}',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const captionDiag = diags.find(
      (d) => d.rule === 'syntax/caption-outside-float' && d.line === 6
    );

    expect(captionDiag).toBeDefined();
    expect(captionDiag!.severity).toBe('error');
    expect(captionDiag!.message).toContain('\\caption outside float');
    expect(captionDiag!.suggestedFix).toBeDefined();
    expect(captionDiag!.suggestedFix!.title).toBe('Change to \\captionof{figure}{...}');
    expect(captionDiag!.suggestedFix!.replacement).toBe('  \\captionof{figure}{Drone Chassis}');
  });

  it('AST parser allows \\caption inside figure and table environments', () => {
    const doc = [
      '\\documentclass{article}',
      '\\begin{document}',
      '\\begin{figure}[htbp]',
      '  \\centering',
      '  \\includegraphics{drone.jpg}',
      '  \\caption{Drone in Flight}',
      '\\end{figure}',
      '\\begin{table}[htbp]',
      '  \\caption{Test Table}',
      '\\end{table}',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const captionDiags = diags.filter(
      (d) => d.rule === 'syntax/caption-outside-float'
    );

    expect(captionDiags).toHaveLength(0);
  });

  it('AST parser allows \\captionof outside float environments', () => {
    const doc = [
      '\\documentclass{article}',
      '\\usepackage{caption}',
      '\\begin{document}',
      '\\begin{center}',
      '  \\includegraphics{image2.png}',
      '  \\captionof{figure}{Drone Chassis}',
      '\\end{center}',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const captionDiags = diags.filter(
      (d) => d.rule === 'syntax/caption-outside-float'
    );

    expect(captionDiags).toHaveLength(0);
  });

  it('applies 1-click quick-fix converting \\caption to \\captionof{figure} on target line', async () => {
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
      '! Package caption Error: \\caption outside float.',
      'l.5 \\caption{Drone Chassis}',
    ].join('\n');
    const { diagnostics } = parseTexLog(log);

    let files: ProjectFile[] = [
      {
        id: 'main.tex',
        name: 'main.tex',
        content: '\\documentclass{article}\n\\usepackage{caption}\n\\begin{document}\n\\begin{center}\n\\caption{Drone Chassis}\n\\end{center}\n\\end{document}',
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
    expect(files[0].content).toContain('\\captionof{figure}{Drone Chassis}');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
