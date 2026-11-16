// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseTexLog } from '../../src/services/texLog';
import { diagnoseLatex } from '../../src/services/latexParser';

describe('Outer Par Mode (Nested Float) Quick-Fix & Diagnostics', () => {
  it('detects Not in outer par mode error in compiler logs and generates actionable syntax hint', () => {
    const log = [
      '! LaTeX Error: Not in outer par mode.',
      'See the LaTeX manual or LaTeX Companion for explanation.',
      'Type H <return> for immediate help.',
      '...',
      'l.655 \\begin{table*}[t]',
      "You've lost some text. Try typing <return> to proceed.",
      '! ==> Fatal error occurred, no output PDF file produced!',
    ].join('\n');

    const result = parseTexLog(log);
    const diag = result.diagnostics.find((d) => d.code === 'syntax');

    expect(diag).toBeDefined();
    expect(diag!.line).toBe(655);
    expect(diag!.message).toContain('Not in outer par mode');
    expect(diag!.hint).toContain('\\begin{table*}');
    expect(diag!.hint).toContain('cannot be nested inside another float');
  });

  it('AST parser flags nested float when float is inside strip environment', () => {
    const doc = [
      '\\documentclass{article}',
      '\\begin{document}',
      '\\begin{strip}',
      '  \\begin{table*}[t]',
      '    \\caption{Nested Table}',
      '  \\end{table*}',
      '\\end{strip}',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const floatDiag = diags.find(
      (d) => d.rule === 'syntax/not-in-outer-par-mode' && d.line === 4
    );

    expect(floatDiag).toBeDefined();
    expect(floatDiag!.message).toContain("Float '\\begin{table*}' cannot be nested inside '\\begin{strip}'");
    expect(floatDiag!.suggestedFix).toBeDefined();
    expect(floatDiag!.suggestedFix!.title).toBe('Close \\end{strip} before \\begin{table*}');
  });

  it('AST parser flags float placed inside itemize environment', () => {
    const doc = [
      '\\documentclass{article}',
      '\\begin{document}',
      '\\begin{itemize}',
      '  \\item Drone specs',
      '  \\begin{table}[htbp]',
      '    \\caption{Table inside list}',
      '  \\end{table}',
      '\\end{itemize}',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const floatDiag = diags.find(
      (d) => d.rule === 'syntax/not-in-outer-par-mode' && d.line === 5
    );

    expect(floatDiag).toBeDefined();
    expect(floatDiag!.message).toContain("Float '\\begin{table}' cannot be nested inside '\\begin{itemize}'");
    expect(floatDiag!.suggestedFix).toBeDefined();
    expect(floatDiag!.suggestedFix!.title).toBe('Close \\end{itemize} before \\begin{table}');
  });

  it('AST parser flags nested float when previous float was not closed', () => {
    const doc = [
      '\\documentclass{article}',
      '\\begin{document}',
      '\\begin{figure*}[t]',
      '  \\includegraphics{ckt.jpg}',
      '  \\caption{Circuit Diagram}',
      '\\begin{table*}[t]',
      '  \\caption{Results Table}',
      '\\end{table*}',
      '\\end{figure*}',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const floatDiag = diags.find(
      (d) => d.rule === 'syntax/not-in-outer-par-mode' && d.line === 6
    );

    expect(floatDiag).toBeDefined();
    expect(floatDiag!.severity).toBe('error');
    expect(floatDiag!.message).toContain("Float '\\begin{table*}' cannot be nested inside '\\begin{figure*}'");
    expect(floatDiag!.message).toContain('(opened on line 3)');
    expect(floatDiag!.suggestedFix).toBeDefined();
    expect(floatDiag!.suggestedFix!.title).toBe('Close \\end{figure*} before \\begin{table*}');
    expect(floatDiag!.suggestedFix!.replacement).toBe('\\end{figure*}\n\\begin{table*}[t]');
  });

  it('AST parser flags float placed inside center environment', () => {
    const doc = [
      '\\documentclass{article}',
      '\\begin{document}',
      '\\begin{center}',
      '  \\begin{table}[htbp]',
      '    \\caption{Nested Table}',
      '  \\end{table}',
      '\\end{center}',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const floatDiag = diags.find(
      (d) => d.rule === 'syntax/not-in-outer-par-mode' && d.line === 4
    );

    expect(floatDiag).toBeDefined();
    expect(floatDiag!.message).toContain("Float '\\begin{table}' cannot be nested inside '\\begin{center}'");
  });

  it('AST parser allows legitimate sequential floats in outer par mode', () => {
    const doc = [
      '\\documentclass{article}',
      '\\begin{document}',
      '\\begin{figure*}[t]',
      '  \\includegraphics{ckt.jpg}',
      '  \\caption{Circuit Diagram}',
      '\\end{figure*}',
      '\\begin{table*}[t]',
      '  \\caption{Results Table}',
      '\\end{table*}',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const floatDiags = diags.filter(
      (d) => d.rule === 'syntax/not-in-outer-par-mode'
    );

    expect(floatDiags).toHaveLength(0);
  });
});
