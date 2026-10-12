import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';
import { type SyntaxTheme, getThemeColors } from './syntaxHighlighter';

/**
 * Creates CodeMirror 6 Theme & Syntax Highlighting extensions that adapt seamlessly
 * to Teeex's active SyntaxTheme ('vscode' | 'antigravity' | 'monokai' | 'dracula' | 'normal')
 * and Light/Dark interface mode.
 */
export function createEditorTheme(theme: SyntaxTheme = 'vscode', isLight = false): Extension {
  const colors = getThemeColors(theme, isLight);

  // Background and UI colors matching Teeex theme tokens
  const bgColor = isLight ? '#fcfbf7' : 'transparent';
  const gutterBg = isLight ? '#f4f1ea' : 'transparent';
  const gutterColor = isLight ? '#a8a29e' : '#64748b';
  const activeGutterColor = isLight ? '#44403c' : '#cbd5e1';
  const activeLineBg = isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)';
  const selectionBg = isLight ? 'rgba(56, 189, 248, 0.25)' : 'rgba(56, 189, 248, 0.2)';
  const cursorColor = isLight ? '#0284c7' : '#38bdf8';

  const baseTheme = EditorView.theme(
    {
      '&': {
        color: colors.defaultText || 'var(--text-primary)',
        backgroundColor: bgColor,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace",
        fontSize: '13.5px',
        height: '100%',
      },
      '.cm-content': {
        caretColor: cursorColor,
        fontFamily: 'inherit',
        lineHeight: '1.65',
        padding: '12px 0',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: cursorColor,
        borderLeftWidth: '2px',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: `${selectionBg} !important`,
      },
      '.cm-gutters': {
        backgroundColor: gutterBg,
        color: gutterColor,
        border: 'none',
        borderRight: isLight ? '1px solid #e7e5e4' : '1px solid rgba(255, 255, 255, 0.05)',
        fontFamily: 'inherit',
        fontSize: '12px',
        paddingRight: '6px',
        userSelect: 'none',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 8px 0 12px',
        minWidth: '40px',
        textAlign: 'right',
      },
      '.cm-activeLine': {
        backgroundColor: activeLineBg,
      },
      '.cm-activeLineGutter': {
        color: activeGutterColor,
        backgroundColor: 'transparent',
        fontWeight: 'bold',
      },
      '.cm-foldGutter .cm-gutterElement': {
        padding: '0 4px',
        cursor: 'pointer',
        color: gutterColor,
        transition: 'color 0.15s ease',
      },
      '.cm-foldGutter .cm-gutterElement:hover': {
        color: activeGutterColor,
      },
      '.cm-tooltip': {
        backgroundColor: isLight ? '#ffffff' : '#0f172a',
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '8px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
      },
      '.cm-tooltip-autocomplete': {
        '& > ul > li': {
          padding: '4px 8px',
          borderRadius: '4px',
        },
        '& > ul > li[aria-selected]': {
          backgroundColor: isLight ? '#e0f2fe' : 'rgba(56, 189, 248, 0.15)',
          color: isLight ? '#0369a1' : '#38bdf8',
        },
      },
      '.cm-panels': {
        backgroundColor: isLight ? '#f8fafc' : '#090d16',
        color: isLight ? '#0f172a' : '#f8fafc',
        borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)',
      },
      '.cm-searchMatch': {
        backgroundColor: 'rgba(234, 179, 8, 0.3)',
        outline: '1px solid rgba(234, 179, 8, 0.6)',
        borderRadius: '2px',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'rgba(249, 115, 22, 0.5)',
        outline: '1px solid rgba(249, 115, 22, 0.8)',
      },
    },
    { dark: !isLight }
  );

  const syntaxHighlight = syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.keyword, color: colors.command, fontWeight: '600' },
      { tag: tags.special(tags.keyword), color: colors.command },
      { tag: tags.comment, color: colors.comment, fontStyle: 'italic' },
      { tag: tags.lineComment, color: colors.comment, fontStyle: 'italic' },
      { tag: tags.blockComment, color: colors.comment, fontStyle: 'italic' },
      { tag: tags.number, color: colors.number },
      { tag: tags.string, color: colors.math },
      { tag: tags.special(tags.string), color: colors.math },
      { tag: tags.bracket, color: colors.bracket },
      { tag: tags.brace, color: colors.brace },
      { tag: tags.meta, color: colors.command },
      { tag: tags.variableName, color: colors.defaultText },
      { tag: tags.tagName, color: colors.command },
      { tag: tags.attributeName, color: colors.bracket },
    ])
  );

  return [baseTheme, syntaxHighlight];
}
