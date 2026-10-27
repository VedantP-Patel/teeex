// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { foldable } from '@codemirror/language';
import { latexFoldService } from '../../src/hooks/useLatexExtensions';
import { parseBibtex } from '../../src/services/bibtexParser';
import type { ProjectFile } from '../../src/types/latex';

describe('Phase 3: CodeMirror LaTeX Folding & Multi-File BibTeX', () => {
  it('correctly folds balanced \\begin{...} and \\end{...} LaTeX environments', () => {
    const doc = [
      '\\documentclass{article}',
      '\\begin{document}',
      '\\begin{equation}',
      '  E = mc^2',
      '\\end{equation}',
      '\\end{document}',
    ].join('\n');

    const state = EditorState.create({
      doc,
      extensions: [latexFoldService],
    });

    // Check fold on line 3 (\begin{equation})
    const eqLine = state.doc.line(3);
    const foldRange = foldable(state, eqLine.from, eqLine.to);

    expect(foldRange).toBeDefined();
    expect(foldRange).not.toBeNull();
    // Fold should start after \begin{equation} and end at \end{equation}
    expect(foldRange?.from).toBe(eqLine.from + '\\begin{equation}'.length);
    expect(foldRange?.to).toBe(state.doc.line(5).from + state.doc.line(5).text.indexOf('\\end{equation}'));
  });

  it('aggregates and deduplicates citations across multiple .bib files', () => {
    const bibFile1: ProjectFile = {
      id: 'main.bib',
      name: 'main.bib',
      type: 'bib',
      content: `@article{knuth1984,
  author = {Knuth, Donald E.},
  title = {Literate Programming},
  year = {1984}
}`,
    };

    const bibFile2: ProjectFile = {
      id: 'quantum.bib',
      name: 'quantum.bib',
      type: 'bib',
      content: `@article{shor1994,
  author = {Shor, Peter W.},
  title = {Algorithms for quantum computation},
  year = {1994}
}
@article{knuth1984,
  author = {Knuth, Donald E.},
  title = {Literate Programming Duplicate},
  year = {1984}
}`,
    };

    const allBibFiles = [bibFile1, bibFile2];
    const entriesMap = new Map();
    for (const bf of allBibFiles) {
      const parsed = parseBibtex(bf.content);
      for (const entry of parsed) {
        if (!entriesMap.has(entry.key)) {
          entriesMap.set(entry.key, entry);
        }
      }
    }
    const aggregated = Array.from(entriesMap.values());

    expect(aggregated.length).toBe(2);
    expect(aggregated.map(e => e.key)).toEqual(['knuth1984', 'shor1994']);
    expect(aggregated.find(e => e.key === 'shor1994')?.title).toContain('Algorithms for quantum computation');
  });
});
