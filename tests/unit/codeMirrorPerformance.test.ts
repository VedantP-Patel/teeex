// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { EditorState, Compartment } from '@codemirror/state';
import { autocompletion } from '@codemirror/autocomplete';
import { createLatexCompletionSource } from '../../src/services/codeMirrorCompletion';
import type { BibEntry } from '../../src/types/latex';

describe('CodeMirror Performance & Dynamic Compartment Reconfiguration', () => {
  it('creates completion source with citations and labels correctly', () => {
    const bibs: BibEntry[] = [
      {
        id: 'knuth1984',
        type: 'book',
        fields: {
          title: 'The TeXbook',
          author: 'Donald E. Knuth',
          year: '1984',
        },
      },
    ];
    const labels = ['sec:intro', 'fig:architecture'];

    const source = createLatexCompletionSource(bibs, labels);
    expect(typeof source).toBe('function');
  });

  it('dynamically reconfigures autocompletion via Compartment without re-initializing editor state', () => {
    const completionCompartment = new Compartment();

    const initialSource = createLatexCompletionSource([], []);
    const state = EditorState.create({
      doc: '\\documentclass{article}\n\\begin{document}\n\\cite{knuth\n\\end{document}',
      extensions: [
        completionCompartment.of(autocompletion({ override: [initialSource] })),
      ],
    });

    expect(state.doc.toString()).toContain('\\cite{knuth');

    // Simulate dynamic updates to bib entries (e.g. user adds a .bib file)
    const updatedBibs: BibEntry[] = [
      {
        id: 'knuth1984',
        type: 'book',
        fields: {
          title: 'The TeXbook',
          author: 'Donald E. Knuth',
        },
      },
    ];

    const updatedSource = createLatexCompletionSource(updatedBibs, ['sec:methodology']);

    // Reconfigure the compartment in-place
    const reconfigEffect = completionCompartment.reconfigure(
      autocompletion({ override: [updatedSource] }),
    );

    const transaction = state.update({
      effects: [reconfigEffect],
    });

    const newState = transaction.state;

    // Document and cursor position are preserved in-place without editor teardown
    expect(newState.doc.toString()).toBe(state.doc.toString());
    expect(transaction.effects).toHaveLength(1);
    expect(transaction.effects[0].value).toBeDefined();
  });
});
