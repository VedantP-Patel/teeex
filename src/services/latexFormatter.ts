/**
 * Pure Deterministic LaTeX Formatter & Beautifier
 * Zero-AI, 100% deterministic syntax-aware indentation & whitespace normalization.
 */

const INDENT_STR = '  ';

// Environments that increase indentation level
const INDENT_ENVIRONMENTS = new Set([
  'equation',
  'equation*',
  'align',
  'align*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'tabular',
  'tabular*',
  'table',
  'table*',
  'figure',
  'figure*',
  'itemize',
  'enumerate',
  'description',
  'matrix',
  'bmatrix',
  'pmatrix',
  'vmatrix',
  'cases',
  'proof',
  'theorem',
  'lemma',
  'definition',
  'corollary',
  'algorithmic',
  'algorithm',
  'minipage',
]);

// Environments whose internal content must be preserved verbatim
const VERBATIM_ENVIRONMENTS = new Set([
  'verbatim',
  'verbatim*',
  'lstlisting',
  'minted',
]);

export function formatLatexCode(code: string): string {
  if (!code || !code.trim()) return code;

  const rawLines = code.split('\n');
  const formattedLines: string[] = [];
  let indentLevel = 0;
  let inVerbatim = false;
  let verbatimClosingTag = '';

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();

    // 1. Verbatim Environment Handling (preserve line verbatim)
    if (inVerbatim) {
      formattedLines.push(rawLine.trimEnd());
      if (trimmed.includes(verbatimClosingTag)) {
        inVerbatim = false;
        verbatimClosingTag = '';
      }
      continue;
    }

    // Check if starting verbatim
    const verbMatch = trimmed.match(/\\begin\{([a-zA-Z0-9*]+)\}/);
    if (verbMatch && VERBATIM_ENVIRONMENTS.has(verbMatch[1])) {
      inVerbatim = true;
      verbatimClosingTag = `\\end{${verbMatch[1]}}`;
      formattedLines.push(INDENT_STR.repeat(indentLevel) + trimmed);
      continue;
    }

    // 2. Empty Lines Handling (normalize consecutive empty lines)
    if (trimmed.length === 0) {
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
      continue;
    }

    // 3. Count environment closings and openings on this line
    const beginMatches = [...trimmed.matchAll(/\\begin\{([a-zA-Z0-9*]+)\}/g)];
    const endMatches = [...trimmed.matchAll(/\\end\{([a-zA-Z0-9*]+)\}/g)];

    let opensThisLine = 0;
    let closesThisLine = 0;

    for (const m of beginMatches) {
      if (INDENT_ENVIRONMENTS.has(m[1])) opensThisLine++;
    }
    for (const m of endMatches) {
      if (INDENT_ENVIRONMENTS.has(m[1])) closesThisLine++;
    }

    // If the line starts with a closing tag, dedent BEFORE printing this line
    const startsWithClosing = /^\s*\\end\{([a-zA-Z0-9*]+)\}/.test(trimmed);
    if (startsWithClosing && closesThisLine > 0) {
      indentLevel = Math.max(0, indentLevel - closesThisLine);
      closesThisLine = 0; // already applied
    }

    // Build indented line
    const currentIndent = INDENT_STR.repeat(indentLevel);
    formattedLines.push(currentIndent + trimmed);

    // Apply remaining opens / closes for subsequent lines
    indentLevel = Math.max(0, indentLevel + opensThisLine - closesThisLine);
  }

  return formattedLines.join('\n').trimEnd() + '\n';
}
