import { useMemo } from 'react';
import { Compartment, type Extension, Prec } from '@codemirror/state';
import {
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
  EditorView,
} from '@codemirror/view';
import { foldGutter, foldService, bracketMatching, indentOnInput } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintGutter } from '@codemirror/lint';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { latex } from 'codemirror-lang-latex';

import type { SyntaxTheme } from '../services/syntaxHighlighter';
import type { BibEntry } from '../services/bibtexParser';
import { createEditorTheme } from '../services/codeMirrorThemes';
import { createLatexCompletionSource } from '../services/codeMirrorCompletion';
import { peerDecorationsField } from './usePeerDecorations';

export const latexFoldService = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  const text = line.text;
  const beginMatch = text.match(/\\begin\{([^}]+)\}/);
  if (beginMatch) {
    const env = beginMatch[1];
    const endTag = `\\end{${env}}`;
    let depth = 1;
    for (let i = line.number + 1; i <= state.doc.lines; i++) {
      const nextLine = state.doc.line(i);
      if (nextLine.text.includes(`\\begin{${env}}`)) depth++;
      if (nextLine.text.includes(endTag)) {
        depth--;
        if (depth === 0) {
          const from = line.from + text.indexOf(beginMatch[0]) + beginMatch[0].length;
          const to = nextLine.from + nextLine.text.indexOf(endTag);
          if (to > from) {
            return { from, to };
          }
        }
      }
    }
  }
  return null;
});

export interface UseLatexExtensionsOptions {
  theme: SyntaxTheme;
  isLight: boolean;
  bibEntries?: BibEntry[];
  labels?: string[];
  readOnly?: boolean;
  onCompileShortcut?: () => void;
  onForwardSync?: (line: number) => void;
  onOpenCommandPalette?: () => void;
  onSaveShortcut?: () => void;
}

export const themeCompartment = new Compartment();
export const readOnlyCompartment = new Compartment();
export const completionCompartment = new Compartment();


/**
 * Hook to assemble all core CodeMirror 6 extensions.
 */
export function useLatexExtensions({
  theme,
  isLight,
  bibEntries = [],
  labels = [],
  readOnly = false,
  onCompileShortcut,
  onForwardSync,
  onOpenCommandPalette,
  onSaveShortcut,
}: UseLatexExtensionsOptions): Extension[] {
  return useMemo(() => {
    const compileKeymap = onCompileShortcut
      ? keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onCompileShortcut();
              return true;
            },
          },
        ])
      : [];

    const commandKeymap = onOpenCommandPalette
      ? keymap.of([
          {
            key: 'Mod-k',
            run: () => {
              onOpenCommandPalette();
              return true;
            },
          },
        ])
      : [];

    const saveKeymap = onSaveShortcut
      ? keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              onSaveShortcut();
              return true;
            },
          },
        ])
      : [];

    const forwardSyncKeymap = onForwardSync
      ? keymap.of([
          {
            key: 'Ctrl-Alt-j',
            run: (view) => {
              const line = view.state.doc.lineAt(view.state.selection.main.head).number;
              onForwardSync(line);
              return true;
            },
          },
        ])
      : [];

    const forwardSyncClickExtension = onForwardSync
      ? EditorView.domEventHandlers({
          click(event, view) {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos !== null) {
              const line = view.state.doc.lineAt(pos).number;
              onForwardSync(line);
            }
          },
        })
      : [];

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      latexFoldService,
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      closeBrackets(),
      bracketMatching(),
      indentOnInput(),
      lintGutter(),
      peerDecorationsField,
      forwardSyncClickExtension,

      // LaTeX language support with Lezer parser (disabled conflicting internal autocompletion)
      latex({
        enableAutocomplete: false,
        enableLinting: false,
        autoCloseBrackets: false,
      }),

      // Autocomplete configured with BibTeX, labels, and LaTeX environments
      completionCompartment.of(
        autocompletion({
          override: [createLatexCompletionSource(bibEntries, labels)],
          defaultKeymap: true,
        })
      ),

      // Theme & Syntax Highlighting compartment
      themeCompartment.of(createEditorTheme(theme, isLight)),

      // Read-only configuration compartment
      readOnlyCompartment.of(EditorView.editable.of(!readOnly)),

      // Keymaps
      Prec.highest(commandKeymap),
      Prec.highest(saveKeymap),
      Prec.high(compileKeymap),
      Prec.high(forwardSyncKeymap),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
    ];

    return extensions;
  }, [
    theme,
    isLight,
    readOnly,
    onCompileShortcut,
    onForwardSync,
    onOpenCommandPalette,
    onSaveShortcut,
    bibEntries,
    labels,
  ]);
}
