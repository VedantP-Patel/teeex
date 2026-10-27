import { describe, expect, it } from 'vitest';
import type { ProjectFile } from '../../src/types/latex';
import {
  detectBibliographyConfig,
  needsBibtex,
  needsMakeindex,
  resolveEntryFile,
  toEngineFiles,
} from '../../src/services/texProject';

function file(partial: Partial<ProjectFile> & { name: string }): ProjectFile {
  return {
    id: partial.id ?? partial.name,
    content: partial.content ?? '',
    type: partial.type ?? (partial.name.endsWith('.bib') ? 'bib' : 'tex'),
    ...partial,
  };
}

describe('resolveEntryFile', () => {
  it('prefers the explicitly marked entry', () => {
    const files = [
      file({ name: 'main.tex', content: '\\documentclass{article}' }),
      file({ name: 'paper.tex', content: '\\documentclass{article}', isEntry: true }),
    ];
    expect(resolveEntryFile(files)!.name).toBe('paper.tex');
  });

  it('falls back to main.tex by convention', () => {
    const files = [
      file({ name: 'sections/intro.tex', content: '\\section{Intro}' }),
      file({ name: 'main.tex', content: '\\documentclass{article}' }),
    ];
    expect(resolveEntryFile(files)!.name).toBe('main.tex');
  });

  it('finds the root by \\documentclass when nothing is marked', () => {
    // This is the case that matters: the open file is a fragment, and only the
    // root has a preamble, so only the root can compile.
    const files = [
      file({ name: 'sections/intro.tex', content: '\\section{Intro}\nText.' }),
      file({ name: 'thesis.tex', content: '\\documentclass[11pt]{report}\n' }),
    ];
    expect(resolveEntryFile(files)!.name).toBe('thesis.tex');
  });

  it('ignores a \\documentclass mentioned in a non-tex file', () => {
    const files = [
      file({ name: 'notes.md', content: '\\documentclass{article}', type: 'tex' }),
      file({ name: 'doc.tex', content: '\\documentclass{article}' }),
    ];
    expect(resolveEntryFile(files)!.name).toBe('doc.tex');
  });

  it('returns the only .tex file as a last resort', () => {
    const files = [file({ name: 'fragment.tex', content: 'Just text.' })];
    expect(resolveEntryFile(files)!.name).toBe('fragment.tex');
  });

  it('returns null when the project has no .tex file', () => {
    expect(resolveEntryFile([file({ name: 'refs.bib' })])).toBeNull();
    expect(resolveEntryFile([])).toBeNull();
  });
});

describe('toEngineFiles', () => {
  it('excludes the entry file, which is passed as the compile input', () => {
    const files = [
      file({ name: 'main.tex', content: '\\documentclass{article}' }),
      file({ name: 'sections/intro.tex', content: '\\section{Intro}' }),
    ];
    const paths = toEngineFiles(files, 'main.tex').map((f) => f.path);

    expect(paths).not.toContain('main.tex');
    expect(paths).toContain('sections/intro.tex');
  });

  it('passes image bytes as binary, not as a data URL string', () => {
    // A 1x1 PNG. Images carry bytes in dataUrl, with content empty — handing
    // TeX the empty content string means \includegraphics can never resolve.
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+mEWRAAAAAElFTkSuQmCC';
    const files = [
      file({ name: 'main.tex', content: '\\documentclass{article}' }),
      file({ name: 'figures/logo.png', content: '', type: 'image', dataUrl: png }),
    ];

    const emitted = toEngineFiles(files, 'main.tex');
    const image = emitted.find((f) => f.path.endsWith('logo.png'))!;

    expect(image.content).toBeInstanceOf(Uint8Array);
    expect((image.content as Uint8Array).byteLength).toBeGreaterThan(0);
    // PNG magic number.
    expect((image.content as Uint8Array)[1]).toBe(0x50);
  });

  it('also exposes an image under its basename for partial references', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const files = [
      file({ name: 'main.tex', content: '' }),
      file({ name: 'figures/logo.png', content: '', type: 'image', dataUrl: png }),
    ];

    const paths = toEngineFiles(files, 'main.tex').map((f) => f.path);
    // \includegraphics{logo} resolves by basename.
    expect(paths).toContain('logo.png');
    expect(paths).toContain('figures/logo.png');
  });

  it('emits each path at most once', () => {
    const files = [
      file({ name: 'main.tex', content: '' }),
      file({ name: 'refs.bib', content: '@book{a,title={T}}' }),
    ];
    const paths = toEngineFiles(files, 'main.tex').map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('needsBibtex', () => {
  it('is true only when a .bib exists and the document uses it', () => {
    const withBib = [file({ name: 'refs.bib', content: '' })];
    expect(needsBibtex(withBib, '\\bibliography{refs}')).toBe(true);
    expect(needsBibtex(withBib, '\\addbibresource{refs.bib}')).toBe(true);
  });

  it('is false with a .bib the document never references', () => {
    // Running BibTeX anyway emits "I found no \citation commands" into the log,
    // which would then surface as a diagnostic on a healthy document.
    const withBib = [file({ name: 'refs.bib', content: '' })];
    expect(needsBibtex(withBib, 'Plain text, no bibliography.')).toBe(false);
  });

  it('is false when the document cites but no .bib is present', () => {
    expect(needsBibtex([], '\\bibliography{refs}')).toBe(false);
  });
});

describe('detectBibliographyConfig', () => {
  it('detects standard bibliography with bib file present', () => {
    const withBib = [file({ name: 'refs.bib', content: '' })];
    const cfg = detectBibliographyConfig(withBib, '\\bibliography{refs}');
    expect(cfg.needed).toBe(true);
    expect(cfg.engine).toBe('bibtex');
    expect(cfg.hasBibFile).toBe(true);
    expect(cfg.usesBiblatex).toBe(false);
  });

  it('detects biblatex default (biber) and emits helpful warning without running bibtex8', () => {
    const withBib = [file({ name: 'refs.bib', content: '' })];
    const cfg = detectBibliographyConfig(withBib, '\\usepackage{biblatex}\n\\addbibresource{refs.bib}');
    expect(cfg.needed).toBe(false);
    expect(cfg.engine).toBe('biblatex-biber');
    expect(cfg.usesBiblatex).toBe(true);
    expect(cfg.warning).toContain('backend=bibtex');
  });

  it('allows biblatex when backend=bibtex is explicitly specified', () => {
    const withBib = [file({ name: 'refs.bib', content: '' })];
    const cfg = detectBibliographyConfig(withBib, '\\usepackage[backend=bibtex]{biblatex}\n\\addbibresource{refs.bib}');
    expect(cfg.needed).toBe(true);
    expect(cfg.engine).toBe('bibtex');
    expect(cfg.usesBiblatex).toBe(true);
  });

  it('returns needed: false when no bibliography directive or .bib is present', () => {
    const cfg = detectBibliographyConfig([], 'Simple article without citations.');
    expect(cfg.needed).toBe(false);
    expect(cfg.engine).toBe('none');
  });
});

describe('needsMakeindex', () => {
  it('detects index usage', () => {
    expect(needsMakeindex('\\makeindex\n\\printindex')).toBe(true);
    expect(needsMakeindex('No index here.')).toBe(false);
  });
});

