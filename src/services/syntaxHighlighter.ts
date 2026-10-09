/**
 * Teeex Studio — High-Performance LaTeX Syntax Highlighter & Tokenizer
 * Provides customizable IDE color themes: Antigravity Neon, VS Code Dark+, Monokai Pro, Dracula, and Normal
 */

export type SyntaxTheme = 'antigravity' | 'vscode' | 'monokai' | 'dracula' | 'normal';

export interface ThemeColors {
  command: string;
  math: string;
  brace: string;
  bracket: string;
  comment: string;
  number: string;
  defaultText: string;
}

export interface SyntaxThemeMeta {
  label: string;
  badge: string;
  previewColors: [string, string, string];
  colors: ThemeColors;
}

export const SYNTAX_THEMES: Record<SyntaxTheme, SyntaxThemeMeta> = {
  antigravity: {
    label: 'Antigravity Neon',
    badge: 'AGY',
    previewColors: ['#38bdf8', '#c084fc', '#34d399'],
    colors: {
      command: '#38bdf8',
      math: '#34d399',
      brace: '#c084fc',
      bracket: '#f472b6',
      comment: '#64748b',
      number: '#fbbf24',
      defaultText: '#f1f5f9',
    },
  },
  vscode: {
    label: 'VS Code Dark+',
    badge: 'VS Code',
    previewColors: ['#569cd6', '#4ec9b0', '#dcdcaa'],
    colors: {
      command: '#569cd6',
      math: '#4ec9b0',
      brace: '#dcdcaa',
      bracket: '#9cdcfe',
      comment: '#6a9955',
      number: '#b5cea8',
      defaultText: '#d4d4d4',
    },
  },
  monokai: {
    label: 'Monokai Pro',
    badge: 'Monokai',
    previewColors: ['#f92672', '#a6e22e', '#66d9ef'],
    colors: {
      command: '#f92672',
      math: '#66d9ef',
      brace: '#a6e22e',
      bracket: '#fd971f',
      comment: '#75715e',
      number: '#ae81ff',
      defaultText: '#f8f8f2',
    },
  },
  dracula: {
    label: 'Dracula Dark',
    badge: 'Dracula',
    previewColors: ['#ff79c6', '#bd93f9', '#50fa7b'],
    colors: {
      command: '#ff79c6',
      math: '#50fa7b',
      brace: '#bd93f9',
      bracket: '#8be9fd',
      comment: '#6272a4',
      number: '#f1fa8c',
      defaultText: '#f8f8f2',
    },
  },
  normal: {
    label: 'Normal (Monochrome)',
    badge: 'Plain',
    previewColors: ['#94a3b8', '#94a3b8', '#94a3b8'],
    colors: {
      command: 'inherit',
      math: 'inherit',
      brace: 'inherit',
      bracket: 'inherit',
      comment: 'var(--text-muted)',
      number: 'inherit',
      defaultText: 'var(--text-primary)',
    },
  },
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Tokenize raw LaTeX code into syntax-highlighted HTML spans for the editor backdrop
 */
export function highlightLatexCode(code: string, theme: SyntaxTheme = 'antigravity'): string {
  if (theme === 'normal') {
    return escapeHtml(code);
  }

  const { colors } = SYNTAX_THEMES[theme];

  // Regex tokenizer matching comments, math blocks, commands, braces, brackets, numbers, and symbols
  const tokenRegex = /(%[^\n]*)|(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^$\n]+\$|\\\(.*?\\\))|(\\[a-zA-Z@]+)|([{}])|([\[\]])|(\b\d+(?:\.\d+)?(?:pt|mm|cm|in|em|ex|%|s|ms|k|M|G)?\b)|(&|\\\\)/g;

  let lastIndex = 0;
  let html = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    // Append plain text before match
    if (match.index > lastIndex) {
      html += escapeHtml(code.slice(lastIndex, match.index));
    }

    const [, comment, math, command, brace, bracket, number, symbol] = match;

    if (comment) {
      html += `<span style="color: ${colors.comment}; font-style: italic;">${escapeHtml(comment)}</span>`;
    } else if (math) {
      html += `<span style="color: ${colors.math};">${escapeHtml(math)}</span>`;
    } else if (command) {
      html += `<span style="color: ${colors.command}; font-weight: 600;">${escapeHtml(command)}</span>`;
    } else if (brace) {
      html += `<span style="color: ${colors.brace}; font-weight: 500;">${escapeHtml(brace)}</span>`;
    } else if (bracket) {
      html += `<span style="color: ${colors.bracket};">${escapeHtml(bracket)}</span>`;
    } else if (number) {
      html += `<span style="color: ${colors.number};">${escapeHtml(number)}</span>`;
    } else if (symbol) {
      html += `<span style="color: ${colors.command}; opacity: 0.85;">${escapeHtml(symbol)}</span>`;
    }

    lastIndex = tokenRegex.lastIndex;
  }

  // Append remaining text
  if (lastIndex < code.length) {
    html += escapeHtml(code.slice(lastIndex));
  }

  return html;
}
