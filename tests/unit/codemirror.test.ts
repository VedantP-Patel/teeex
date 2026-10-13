// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createEditorTheme } from '../../src/services/codeMirrorThemes';
import { createLatexCompletionSource } from '../../src/services/codeMirrorCompletion';
import { peerDecorationsField, setPeersEffect } from '../../src/hooks/usePeerDecorations';
import { latex } from 'codemirror-lang-latex';

describe('CodeMirror 6 integration', () => {
  it('creates themes without error', () => {
    const theme = createEditorTheme('vscode', false);
    expect(theme).toBeDefined();

    const darkTheme = createEditorTheme('antigravity', true);
    expect(darkTheme).toBeDefined();
  });

  it('initializes EditorState and EditorView in DOM without error', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const theme = createEditorTheme('vscode', false);
    const completionSource = createLatexCompletionSource([], []);

    const state = EditorState.create({
      doc: '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}',
      extensions: [latex(), theme, peerDecorationsField],
    });

    const view = new EditorView({
      state,
      parent,
    });

    expect(view.state.doc.toString()).toContain('Hello World');

    // Test dispatching peer effect
    view.dispatch({
      effects: setPeersEffect.of([
        {
          id: 'peer-1',
          name: 'Alice',
          color: '#ff0000',
          avatar: 'AL',
          cursorLine: 2,
          cursorCol: 5,
          activeFile: 'main.tex',
          status: 'active',
        },
      ]),
    });

    view.destroy();
    parent.remove();
  });

  it('renders Editor component into DOM directly without error', async () => {
    const { Editor } = await import('../../src/components/Editor');
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const root = (await import('react-dom/client')).createRoot(parent);
    const React = await import('react');

    await (await import('react')).act(async () => {
      root.render(
        React.createElement(Editor, {
          code: '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}',
          fileName: 'main.tex',
          activeFileId: 'main.tex',
          openFileIds: ['main.tex'],
          onChange: () => {},
          diagnostics: [],
          peers: [],
          onCursorChange: () => {},
          onCompileShortcut: () => {},
          targetLine: null,
          onClearTargetLine: () => {},
          comments: [],
          onAddComment: () => {},
          onResolveComment: () => {},
          bibEntries: [],
          role: 'owner',
          files: [
            {
              id: 'main.tex',
              name: 'main.tex',
              content: '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}',
              type: 'tex',
            },
          ],
        })
      );
    });

    console.log('Editor parent innerHTML contains cm-editor:', parent.innerHTML.includes('cm-editor'));
    expect(parent.innerHTML).toContain('main.tex');

    root.unmount();
    parent.remove();
  });
});
