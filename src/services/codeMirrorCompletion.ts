import {
  type CompletionContext,
  type CompletionResult,
  type Completion,
  snippetCompletion,
} from '@codemirror/autocomplete';
import type { BibEntry } from './bibtexParser';
import { LATEX_SNIPPETS } from './latexSnippets';

/**
 * Creates a comprehensive LaTeX autocompletion source for CodeMirror 6.
 * Provides completions for:
 * 1. Citations: \cite{...} -> suggests available BibTeX entries with author/title metadata
 * 2. References: \ref{...}, \eqref{...}, \pageref{...} -> suggests document labels
 * 3. LaTeX Snippets & Environments: \begin{...}, \frac{}{}, figures, tables, etc.
 */
export function createLatexCompletionSource(bibEntries: BibEntry[] = [], labels: string[] = []) {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/\\?[a-zA-Z0-9_:*-]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

    const lineTextBefore = context.state.doc.sliceString(
      context.state.doc.lineAt(context.pos).from,
      context.pos
    );

    // 1. Check for \cite{ or \citep{ or \citet{ context
    const citeMatch = lineTextBefore.match(/\\cite[a-zA-Z*]*\{([^}]*)$/);
    if (citeMatch) {
      const citePrefix = citeMatch[1];
      const from = context.pos - citePrefix.length;

      const options: Completion[] = bibEntries.map((b) => ({
        label: b.key,
        detail: b.title ? (b.title.length > 40 ? `${b.title.slice(0, 37)}...` : b.title) : b.type,
        info: `${b.author ? `${b.author}\n` : ''}${b.year ? `(${b.year}) ` : ''}${b.title || ''}`,
        type: 'keyword',
        boost: 2,
      }));

      return {
        from,
        options,
        validFor: /^[a-zA-Z0-9_:.-]*$/,
      };
    }

    // 2. Check for \ref{ or \eqref{ or \pageref{ context
    const refMatch = lineTextBefore.match(/\\(?:eq|page)?ref\{([^}]*)$/);
    if (refMatch) {
      const refPrefix = refMatch[1];
      const from = context.pos - refPrefix.length;

      const options: Completion[] = labels.map((lbl) => ({
        label: lbl,
        detail: lbl.startsWith('eq:') ? 'Equation' : lbl.startsWith('fig:') ? 'Figure' : lbl.startsWith('tab:') ? 'Table' : 'Label',
        type: 'variable',
        boost: 2,
      }));

      return {
        from,
        options,
        validFor: /^[a-zA-Z0-9_:.-]*$/,
      };
    }

    // 3. LaTeX Snippets matching current trigger or command
    const options: Completion[] = [];

    for (const snip of LATEX_SNIPPETS) {
      const snippetComp = snippetCompletion(snip.template, {
        label: snip.label,
        detail: snip.description,
        type: snip.category === 'env' ? 'type' : snip.category === 'math' ? 'function' : 'text',
        boost: snip.category === 'env' ? 1.5 : 1,
      });

      options.push(snippetComp);
    }

    return {
      from: word.text.startsWith('\\') ? word.from : word.from,
      options,
      validFor: /^\\?[a-zA-Z0-9_:-]*$/,
    };
  };
}
