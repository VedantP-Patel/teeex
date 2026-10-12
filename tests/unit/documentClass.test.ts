import { describe, expect, it } from 'vitest';
import {
  PAPER_FORMATS,
  applyDocumentClass,
  detectDocumentClass,
  formatResolutionNotice,
  isTwoColumnSource,
  setTwoColumn,
} from '../../src/services/paperFormats';
import { pdfFileName } from '../../src/services/pdfExporter';

describe('applyDocumentClass', () => {
  it('replaces the declared class', () => {
    const source = '\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}';
    const next = applyDocumentClass(source, 'ieee');

    expect(next).toContain('\\documentclass[journal]{IEEEtran}');
    expect(next).not.toContain('\\documentclass{article}');
  });

  it('preserves the body', () => {
    const source = '\\documentclass{article}\n\\begin{document}\nKeep me\n\\end{document}';
    expect(applyDocumentClass(source, 'acm')).toContain('Keep me');
  });

  it('adds the packages the class needs', () => {
    const source = '\\documentclass{article}\n\\begin{document}\n\\end{document}';
    const next = applyDocumentClass(source, 'ieee');

    for (const pkg of PAPER_FORMATS.ieee.packages) {
      expect(next).toContain(`\\usepackage{${pkg}}`);
    }
  });

  it('does not duplicate a package already loaded', () => {
    const source = [
      '\\documentclass{article}',
      '\\usepackage{amsmath}',
      '\\begin{document}',
      '\\end{document}',
    ].join('\n');

    const next = applyDocumentClass(source, 'ieee');
    expect(next.match(/\\usepackage\{amsmath\}/g)).toHaveLength(1);
  });

  it('recognises a package loaded in a grouped \\usepackage', () => {
    const source = [
      '\\documentclass{article}',
      '\\usepackage{amsmath,amssymb,graphicx}',
      '\\begin{document}',
      '\\end{document}',
    ].join('\n');

    const next = applyDocumentClass(source, 'ieee');
    expect(next).not.toContain('\\usepackage{amsmath}');
    expect(next).not.toContain('\\usepackage{graphicx}');
  });

  it('replaces a class that carries options', () => {
    const source = '\\documentclass[12pt,twoside]{report}\n\\begin{document}\n\\end{document}';
    const next = applyDocumentClass(source, 'standard');

    expect(next).toContain('\\documentclass[10pt,a4paper]{article}');
    expect(next).not.toContain('twoside');
  });

  it('leaves a document with no \\documentclass untouched', () => {
    // Guessing where a preamble should begin would silently restructure
    // someone's file; declining is the safer failure.
    const source = '\\section{Fragment}\nText only.';
    expect(applyDocumentClass(source, 'ieee')).toBe(source);
  });

  it('ignores a \\documentclass inside a comment', () => {
    const source = [
      '% \\documentclass{book} is the old setting',
      '\\documentclass{article}',
      '\\begin{document}',
      '\\end{document}',
    ].join('\n');

    const next = applyDocumentClass(source, 'ieee');
    // The commented line must survive verbatim.
    expect(next).toContain('% \\documentclass{book} is the old setting');
    expect(next).toContain('\\documentclass[journal]{IEEEtran}');
  });
});

describe('detectDocumentClass', () => {
  it('maps known classes', () => {
    expect(detectDocumentClass('\\documentclass{IEEEtran}')).toBe('ieee');
    expect(detectDocumentClass('\\documentclass[sigconf]{acmart}')).toBe('acm');
    expect(detectDocumentClass('\\documentclass{sn-jnl}')).toBe('nature');
    expect(detectDocumentClass('\\documentclass{article}')).toBe('standard');
  });

  it('treats a larger base size as a preprint layout', () => {
    expect(detectDocumentClass('\\documentclass[11pt]{article}')).toBe('arxiv');
  });

  it('returns null for an unrecognised class', () => {
    expect(detectDocumentClass('\\documentclass{beamer}')).toBeNull();
    expect(detectDocumentClass('no class here')).toBeNull();
  });
});

describe('setTwoColumn', () => {
  it('adds the option to a class with none', () => {
    expect(setTwoColumn('\\documentclass{article}', true)).toBe(
      '\\documentclass[twocolumn]{article}',
    );
  });

  it('appends to existing options without disturbing them', () => {
    expect(setTwoColumn('\\documentclass[11pt,a4paper]{article}', true)).toBe(
      '\\documentclass[11pt,a4paper,twocolumn]{article}',
    );
  });

  it('removes the option and drops an empty bracket group', () => {
    expect(setTwoColumn('\\documentclass[twocolumn]{article}', false)).toBe(
      '\\documentclass{article}',
    );
  });

  it('keeps other options when removing twocolumn', () => {
    expect(setTwoColumn('\\documentclass[11pt,twocolumn]{article}', false)).toBe(
      '\\documentclass[11pt]{article}',
    );
  });

  it('states onecolumn explicitly for classes that default to two', () => {
    // Omitting `twocolumn` is not enough for IEEEtran, which is two-column by
    // default; the opposite option has to be set.
    expect(setTwoColumn('\\documentclass[journal]{IEEEtran}', false)).toBe(
      '\\documentclass[journal,onecolumn]{IEEEtran}',
    );
  });

  it('never accumulates contradictory options', () => {
    let source = '\\documentclass[onecolumn]{article}';
    source = setTwoColumn(source, true);
    expect(source).toBe('\\documentclass[twocolumn]{article}');
    source = setTwoColumn(source, false);
    expect(source).toBe('\\documentclass{article}');
  });

  it('is a no-op without a \\documentclass', () => {
    expect(setTwoColumn('\\section{x}', true)).toBe('\\section{x}');
  });
});

describe('isTwoColumnSource', () => {
  it('reads an explicit option', () => {
    expect(isTwoColumnSource('\\documentclass[twocolumn]{article}')).toBe(true);
    expect(isTwoColumnSource('\\documentclass{article}')).toBe(false);
  });

  it('knows IEEEtran is two-column by default', () => {
    expect(isTwoColumnSource('\\documentclass[journal]{IEEEtran}')).toBe(true);
    expect(isTwoColumnSource('\\documentclass[journal,onecolumn]{IEEEtran}')).toBe(false);
  });

  it('does not mistake a substring for the option', () => {
    expect(isTwoColumnSource('\\documentclass[nottwocolumnish]{article}')).toBe(false);
  });
});

describe('formatResolutionNotice', () => {
  it('warns for presets whose class pulls a heavy dependency tree', () => {
    // acmart and sn-jnl are not in the bundled set and were not seen to compile
    // within a practical time; the user must be told before their document is
    // rewritten to one.
    expect(formatResolutionNotice('acm')).toContain('acmart');
    expect(formatResolutionNotice('nature')).toContain('sn-jnl');
  });

  it('stays silent for bundled and confirmed presets', () => {
    // No caveat to raise — a notice here would just be noise.
    expect(formatResolutionNotice('standard')).toBeNull();
    expect(formatResolutionNotice('arxiv')).toBeNull();
    expect(formatResolutionNotice('ieee')).toBeNull();
  });

  it('every preset declares a resolution confidence', () => {
    for (const id of Object.keys(PAPER_FORMATS) as (keyof typeof PAPER_FORMATS)[]) {
      expect(['bundled', 'remote-verified', 'remote-heavy']).toContain(
        PAPER_FORMATS[id].resolution,
      );
    }
  });
});

describe('pdfFileName', () => {
  it('replaces whitespace and keeps the name readable', () => {
    expect(pdfFileName('Neural Quantum State Tomography')).toBe(
      'Neural_Quantum_State_Tomography.pdf',
    );
  });

  it('strips characters that are invalid in file names', () => {
    expect(pdfFileName('A/B:C*D?"<>|E')).toBe('ABCDE.pdf');
  });

  it('falls back to a usable name when nothing survives', () => {
    expect(pdfFileName('///')).toBe('document.pdf');
    expect(pdfFileName('')).toBe('document.pdf');
  });

  it('collapses runs of underscores and trims edges', () => {
    expect(pdfFileName('  spaced   out  ')).toBe('spaced_out.pdf');
  });

  it('bounds the length', () => {
    expect(pdfFileName('x'.repeat(400)).length).toBeLessThanOrEqual(124);
  });
});
