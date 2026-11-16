import { describe, expect, it } from 'vitest';
import { diagnoseLatex } from '../../src/services/latexParser';

describe('Trailing Content After \\end{document}', () => {
  it('flags trailing content after end document as a warning and provides quick-fix', () => {
    const doc = [
      '\\documentclass{article}',
      '\\begin{document}',
      'Hello world',
      '\\end{document}',
      '',
      '% Duplicate template pasted by mistake',
      '\\begin{document}',
      '\\end{strip}',
      '\\begin{table*}[t]',
      '\\end{table*}',
      '\\end{document}',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const trailingDiag = diags.find(d => d.rule === 'syntax/content-after-end-document');

    expect(trailingDiag).toBeDefined();
    expect(trailingDiag!.severity).toBe('warning');
    expect(trailingDiag!.message).toContain("Content found after '\\end{document}'");
    expect(trailingDiag!.suggestedFix).toBeDefined();
    expect(trailingDiag!.suggestedFix!.title).toBe('Remove trailing content after \\end{document}');
    expect(trailingDiag!.suggestedFix!.replacement).toBe(
      '\\documentclass{article}\n\\begin{document}\nHello world\n\\end{document}\n'
    );

    // Ensures no spurious mismatched-environment or not-in-outer-par-mode errors were reported for dead content
    const errorDiags = diags.filter(d => d.severity === 'error');
    expect(errorDiags).toHaveLength(0);
  });

  it('does not flag clean document without trailing content', () => {
    const doc = [
      '\\documentclass{article}',
      '\\begin{document}',
      'Clean document',
      '\\end{document}',
      '',
    ].join('\n');

    const diags = diagnoseLatex(doc);
    const trailingDiag = diags.find(d => d.rule === 'syntax/content-after-end-document');
    expect(trailingDiag).toBeUndefined();
  });
});
