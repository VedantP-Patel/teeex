import { describe, expect, it } from 'vitest';
import { parseTexLog, unwrapLogLines } from '../../src/services/texLog';

/**
 * Log excerpts here are shaped like real pdfTeX output, including its
 * 79-column wrapping and unbalanced parentheses, because those are precisely
 * the properties that break naive parsers.
 */

describe('unwrapLogLines', () => {
  it('rejoins a message TeX wrapped at the print width', () => {
    const wrapped = `${'a'.repeat(79)}tail`;
    expect(unwrapLogLines(wrapped.replace('tail', '\ntail'))).toEqual([
      `${'a'.repeat(79)}tail`,
    ]);
  });

  it('does not join when the next line starts a new record', () => {
    const log = `${'a'.repeat(79)}\n! Undefined control sequence.`;
    expect(unwrapLogLines(log)).toEqual([
      'a'.repeat(79),
      '! Undefined control sequence.',
    ]);
  });

  it('leaves short lines alone', () => {
    expect(unwrapLogLines('one\ntwo\nthree')).toEqual(['one', 'two', 'three']);
  });

  it('normalises CRLF', () => {
    expect(unwrapLogLines('one\r\ntwo')).toEqual(['one', 'two']);
  });
});

describe('parseTexLog — errors', () => {
  it('extracts message, line and source context', () => {
    const log = [
      'This is pdfTeX, Version 3.141592653',
      '(./main.tex',
      'LaTeX2e <2026-06-01>',
      '! Undefined control sequence.',
      'l.42 \\includegrafics',
      '                    {figure.png}',
      '?',
    ].join('\n');

    const { diagnostics } = parseTexLog(log, { root: 'main.tex' });
    const error = diagnostics.find((d) => d.severity === 'error');

    expect(error).toBeDefined();
    expect(error!.message).toBe('Undefined control sequence.');
    expect(error!.line).toBe(42);
    expect(error!.code).toBe('undefined-control-sequence');
    // The hint must name the actual offending macro, read off the context.
    expect(error!.hint).toContain('\\includegrafics');
  });

  it('classifies a missing .sty as a resolvable package', () => {
    const log = [
      '(./main.tex',
      "! LaTeX Error: File `IEEEtran.cls' not found.",
      'l.1 \\documentclass{IEEEtran}',
    ].join('\n');

    const { diagnostics, missingPackages, missingFiles } = parseTexLog(log);

    // A .cls is not a .sty, so it is reported as a missing file, not a package.
    expect(missingPackages).toEqual([]);
    expect(missingFiles).toContain('IEEEtran.cls');
    expect(diagnostics[0].code).toBe('missing-file');
  });

  it('names the package for a missing .sty', () => {
    const log = "! LaTeX Error: File `xcolor.sty' not found.";
    const { missingPackages, diagnostics } = parseTexLog(log);

    expect(missingPackages).toEqual(['xcolor']);
    expect(diagnostics[0].code).toBe('missing-package');
    expect(diagnostics[0].hint).toContain('xcolor');
  });

  it('distinguishes a missing graphic from a missing package', () => {
    const log = "! LaTeX Error: File `figures/plot.pdf' not found.";
    const { diagnostics, missingFiles } = parseTexLog(log);

    expect(diagnostics[0].code).toBe('missing-graphic');
    expect(diagnostics[0].hint).toContain('includegraphics');
    expect(missingFiles).toEqual(['figures/plot.pdf']);
  });

  it('marks an emergency stop as fatal', () => {
    const log = ['! Emergency stop.', 'l.9 \\end{documnet}'].join('\n');
    const { diagnostics, fatal } = parseTexLog(log);

    expect(fatal).toBe(true);
    expect(diagnostics[0].code).toBe('fatal');
  });

  it('flags a no-output run as fatal even without a bang line', () => {
    const log = '!  ==> Fatal error occurred, no output PDF file produced!';
    expect(parseTexLog(log).fatal).toBe(true);
  });

  it('classifies brace and math delimiter mistakes as syntax', () => {
    for (const message of [
      '! Missing $ inserted.',
      '! Extra }, or forgotten $.',
      '! Missing } inserted.',
      '! Paragraph ended before \\textbf was complete.',
    ]) {
      const { diagnostics } = parseTexLog(message);
      expect(diagnostics[0].code, message).toBe('syntax');
    }
  });
});

describe('parseTexLog — file attribution', () => {
  it('blames the file TeX was reading, not the root', () => {
    const log = [
      '(./main.tex',
      'LaTeX2e <2026-06-01>',
      '(./sections/intro.tex',
      '! Undefined control sequence.',
      'l.12 \\badmacro',
    ].join('\n');

    const { diagnostics } = parseTexLog(log, { root: 'main.tex' });
    expect(diagnostics[0].file).toBe('sections/intro.tex');
  });

  it('returns to the parent file after a close paren', () => {
    const log = [
      '(./main.tex',
      '(./sections/intro.tex',
      ')',
      '! Undefined control sequence.',
      'l.80 \\oops',
    ].join('\n');

    expect(parseTexLog(log, { root: 'main.tex' }).diagnostics[0].file).toBe(
      'main.tex',
    );
  });

  it('survives unbalanced parens in prose without desynchronising', () => {
    const log = [
      '(./main.tex',
      'Some package says (this is fine) and ) stray',
      '! Undefined control sequence.',
      'l.5 \\x',
    ].join('\n');

    // A stray ')' must not pop past the root and strand later diagnostics.
    expect(parseTexLog(log, { root: 'main.tex' }).diagnostics[0].file).toBe(
      'main.tex',
    );
  });

  it('records which files were read', () => {
    const log = ['(./main.tex', '(./sections/a.tex', ')', '(./sections/b.tex', ')'].join(
      '\n',
    );
    expect(parseTexLog(log, { root: 'main.tex' }).filesRead).toEqual([
      'main.tex',
      'sections/a.tex',
      'sections/b.tex',
    ]);
  });
});

describe('parseTexLog — warnings', () => {
  it('reads undefined citations and their input line', () => {
    const log =
      "LaTeX Warning: Citation `knuth1984' on page 1 undefined on input line 55.";
    const { diagnostics } = parseTexLog(log);

    expect(diagnostics[0].code).toBe('missing-citation');
    expect(diagnostics[0].line).toBe(55);
    expect(diagnostics[0].severity).toBe('warning');
  });

  it('reads undefined references', () => {
    const log =
      "LaTeX Warning: Reference `fig:overview' on page 2 undefined on input line 91.";
    const { diagnostics } = parseTexLog(log);

    expect(diagnostics[0].code).toBe('missing-reference');
    expect(diagnostics[0].line).toBe(91);
  });

  it('reports a rerun request as info, not a problem', () => {
    const log =
      'LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.';
    const { diagnostics, rerunRequired } = parseTexLog(log);

    expect(rerunRequired).toBe(true);
    expect(diagnostics[0].severity).toBe('info');
  });

  it('attributes package warnings to the package', () => {
    const log = 'Package hyperref Warning: Token not allowed on input line 3.';
    const { diagnostics } = parseTexLog(log);

    expect(diagnostics[0].message).toContain('[hyperref]');
    expect(diagnostics[0].line).toBe(3);
  });

  it('joins a warning continued on an indented line', () => {
    const log = [
      "LaTeX Warning: Citation `a1' on page 1 undefined",
      "                (hyperref)   on input line 77.",
    ].join('\n');

    const { diagnostics } = parseTexLog(log);
    expect(diagnostics[0].line).toBe(77);
  });

  it('flags font substitution, which silently changes appearance', () => {
    const log =
      'LaTeX Font Warning: Font shape `OT1/cmr/bx/sc undefined on input line 4.';
    const { diagnostics } = parseTexLog(log);

    expect(diagnostics[0].code).toBe('font-substitution');
  });
});

describe('parseTexLog — bad boxes and glyphs', () => {
  it('captures an overfull hbox and its line range', () => {
    const log =
      'Overfull \\hbox (15.47pt too wide) in paragraph at lines 23--25';
    const { diagnostics } = parseTexLog(log);

    expect(diagnostics[0].code).toBe('overfull-box');
    expect(diagnostics[0].line).toBe(23);
    expect(diagnostics[0].endLine).toBe(25);
    expect(diagnostics[0].message).toContain('15.47pt too wide');
  });

  it('captures an underfull hbox', () => {
    const log = 'Underfull \\hbox (badness 10000) in paragraph at lines 30--31';
    const { diagnostics } = parseTexLog(log);

    expect(diagnostics[0].code).toBe('underfull-box');
    expect(diagnostics[0].line).toBe(30);
  });

  it('reports a missing glyph, which drops a character from the output', () => {
    const log = 'Missing character: There is no 中 (U+4E2D) in font cmr10!';
    const { diagnostics } = parseTexLog(log);

    expect(diagnostics[0].code).toBe('missing-glyph');
    expect(diagnostics[0].message).toContain('cmr10');
  });
});

describe('parseTexLog — missing inputs', () => {
  it('treats a skipped \\input as a warning with an actionable hint', () => {
    const log = ['(./main.tex', 'No file sections/results.tex.'].join('\n');
    const { diagnostics, missingFiles } = parseTexLog(log, { root: 'main.tex' });

    expect(missingFiles).toContain('sections/results.tex');
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].code).toBe('missing-file');
  });
});

describe('parseTexLog — resilience', () => {
  it('returns an empty result for an empty log rather than throwing', () => {
    const result = parseTexLog('');
    expect(result.diagnostics).toEqual([]);
    expect(result.fatal).toBe(false);
  });

  it('assigns every diagnostic a distinct id', () => {
    const log = [
      '! Undefined control sequence.',
      'l.1 \\a',
      '! Undefined control sequence.',
      'l.2 \\b',
      'Overfull \\hbox (1.0pt too wide) in paragraph at lines 3--4',
    ].join('\n');

    const ids = parseTexLog(log).diagnostics.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
