import { useEffect, useRef, useCallback } from 'react';
import { StateEffect, StateField, EditorState, type Extension } from '@codemirror/state';
import { EditorView, ViewUpdate, Decoration, type DecorationSet } from '@codemirror/view';
import { setDiagnostics, type Diagnostic as CMDiagnostic } from '@codemirror/lint';

import type { Collaborator, Diagnostic } from '../types/latex';
import type { SyntaxTheme } from '../services/syntaxHighlighter';
import { createEditorTheme } from '../services/codeMirrorThemes';
import { themeCompartment, readOnlyCompartment } from './useLatexExtensions';
import { setPeersEffect } from './usePeerDecorations';

export const flashLineEffect = StateEffect.define<number>();
export const clearFlashEffect = StateEffect.define<void>();

const flashLineDecoration = Decoration.line({
  attributes: { class: 'cm-line-flash' },
});

export const flashLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(flashLineEffect)) {
        const lineNum = Math.max(1, Math.min(effect.value, tr.state.doc.lines));
        const line = tr.state.doc.line(lineNum);
        decorations = Decoration.set([flashLineDecoration.range(line.from)]);
      } else if (effect.is(clearFlashEffect)) {
        decorations = Decoration.none;
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export interface UseCodeMirrorProps {
  code: string;
  onChange: (value: string) => void;
  onCursorChange?: (line: number, col: number) => void;
  extensions: Extension[];
  theme: SyntaxTheme;
  isLight: boolean;
  readOnly?: boolean;
  peers?: Collaborator[];
  diagnostics?: Diagnostic[];
  targetLine?: number | null;
  onClearTargetLine?: () => void;
}

export function useCodeMirror({
  code,
  onChange,
  onCursorChange,
  extensions,
  theme,
  isLight,
  readOnly = false,
  peers = [],
  diagnostics = [],
  targetLine,
  onClearTargetLine,
}: UseCodeMirrorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastEmittedDocRef = useRef<string>(code);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;

  // Initialize CodeMirror instance
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        const nextDoc = update.state.doc.toString();
        lastEmittedDocRef.current = nextDoc;
        onChangeRef.current(nextDoc);
      }

      if (update.selectionSet || update.docChanged) {
        if (onCursorChangeRef.current) {
          const pos = update.state.selection.main.head;
          const lineInfo = update.state.doc.lineAt(pos);
          const col = pos - lineInfo.from + 1;
          onCursorChangeRef.current(lineInfo.number, col);
        }
      }
    });

    const state = EditorState.create({
      doc: code,
      extensions: [...extensions, flashLineField, updateListener],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    if (typeof window !== 'undefined') {
      (window as unknown as { __teeexEditorView?: EditorView }).__teeexEditorView = view;
    }
    lastEmittedDocRef.current = code;

    return () => {
      view.destroy();
      viewRef.current = null;
      if (typeof window !== 'undefined') {
        const win = window as unknown as { __teeexEditorView?: EditorView };
        if (win.__teeexEditorView === view) {
          delete win.__teeexEditorView;
        }
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external code changes (tab switch, formatting, quick-fix) with minimal diff
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Fast path: if `code` matches what CodeMirror itself just emitted, do nothing!
    if (code === lastEmittedDocRef.current) return;

    const currentDoc = view.state.doc.toString();
    if (code === currentDoc) {
      lastEmittedDocRef.current = code;
      return;
    }

    // Compute minimal prefix/suffix diff so cursor and undo history survive
    let start = 0;
    const minLen = Math.min(currentDoc.length, code.length);
    while (start < minLen && currentDoc.charCodeAt(start) === code.charCodeAt(start)) {
      start++;
    }

    let endCurrent = currentDoc.length;
    let endNext = code.length;
    while (
      endCurrent > start &&
      endNext > start &&
      currentDoc.charCodeAt(endCurrent - 1) === code.charCodeAt(endNext - 1)
    ) {
      endCurrent--;
      endNext--;
    }

    lastEmittedDocRef.current = code;
    view.dispatch({
      changes: {
        from: start,
        to: endCurrent,
        insert: code.slice(start, endNext),
      },
    });
  }, [code]);

  // Update theme when theme or isLight changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: themeCompartment.reconfigure(createEditorTheme(theme, isLight)),
    });
  }, [theme, isLight]);

  // Update read-only state
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorView.editable.of(!readOnly)),
    });
  }, [readOnly]);

  // Update peer collaborator cursors
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: setPeersEffect.of(peers),
    });
  }, [peers]);

  // Update compiler diagnostics
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const docLines = view.state.doc.lines;
    const cmDiagnostics: CMDiagnostic[] = diagnostics.map((d) => {
      const lineNum = Math.max(1, Math.min(d.line, docLines));
      const lineInfo = view.state.doc.line(lineNum);
      const col = Math.max(0, Math.min((d.column || 1) - 1, lineInfo.length));
      const from = lineInfo.from + col;
      const to = Math.min(from + 1, lineInfo.to);

      return {
        from,
        to: to > from ? to : lineInfo.to,
        severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
        message: d.message,
        source: d.rule || 'LaTeX',
      };
    });

    view.dispatch(setDiagnostics(view.state, cmDiagnostics));
  }, [diagnostics]);

  // Jump to targetLine when requested
  useEffect(() => {
    const view = viewRef.current;
    if (!view || targetLine === null || targetLine === undefined) return;

    const docLines = view.state.doc.lines;
    const lineNum = Math.max(1, Math.min(targetLine, docLines));
    const lineInfo = view.state.doc.line(lineNum);

    view.dispatch({
      selection: { anchor: lineInfo.from, head: lineInfo.from },
      effects: [flashLineEffect.of(lineNum)],
      scrollIntoView: true,
    });

    view.focus();

    setTimeout(() => {
      if (viewRef.current) {
        viewRef.current.dispatch({ effects: [clearFlashEffect.of()] });
      }
    }, 1200);

    if (onClearTargetLine) {
      onClearTargetLine();
    }
  }, [targetLine, onClearTargetLine]);

  const insertText = useCallback((text: string, cursorOffset?: number) => {
    const view = viewRef.current;
    if (!view) return;

    const selection = view.state.selection.main;
    const insertPos = selection.from;

    view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: text,
      },
      selection: {
        anchor: cursorOffset !== undefined ? insertPos + cursorOffset : insertPos + text.length,
      },
      scrollIntoView: true,
    });

    view.focus();
  }, []);

  const wrapSelection = useCallback((before: string, after: string) => {
    const view = viewRef.current;
    if (!view) return;

    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    const replacement = `${before}${selectedText}${after}`;

    view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: replacement,
      },
      selection: {
        anchor: selectedText
          ? selection.from + replacement.length
          : selection.from + before.length,
      },
      scrollIntoView: true,
    });

    view.focus();
  }, []);

  const jumpToLine = useCallback((line: number) => {
    const view = viewRef.current;
    if (!view) return;

    const docLines = view.state.doc.lines;
    const target = Math.max(1, Math.min(line, docLines));
    const lineInfo = view.state.doc.line(target);

    view.dispatch({
      selection: { anchor: lineInfo.from, head: lineInfo.from },
      effects: [flashLineEffect.of(target)],
      scrollIntoView: true,
    });

    view.focus();

    setTimeout(() => {
      if (viewRef.current) {
        viewRef.current.dispatch({ effects: [clearFlashEffect.of()] });
      }
    }, 1200);
  }, []);

  return {
    containerRef,
    viewRef,
    insertText,
    wrapSelection,
    jumpToLine,
  };
}