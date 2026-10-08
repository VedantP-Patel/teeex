import katex from 'katex';
import type { Diagnostic, ParsedDocument } from '../types/latex';

/**
 * High-speed LaTeX Diagnostic Linter
 * Scans code for syntax errors, unclosed environments, unescaped characters,
 * and generates human-readable diagnostics with 1-click executable quick-fixes.
 */
export function diagnoseLatex(code: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = code.split('\n');

  // Track environments: { name, line }
  const envStack: Array<{ name: string; line: number }> = [];
  const validPreamblePackages = new Set<string>();

  // Check for \usepackage
  for (let i = 0; i < lines.length; i++) {
    const pkgMatch = lines[i].match(/\\usepackage(?:\[.*?\])?\{([^}]+)\}/);
    if (pkgMatch) {
      pkgMatch[1].split(',').forEach(p => validPreamblePackages.add(p.trim()));
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i];

    // Strip comments for syntax inspection, unless checking comment escaping
    const commentIdx = rawLine.indexOf('%');
    const hasUnescapedPercent = commentIdx > 0 && rawLine[commentIdx - 1] !== '\\';
    const effectiveLine = hasUnescapedPercent ? rawLine.substring(0, commentIdx) : rawLine;

    // 1. Detect \begin{...} and \end{...}
    const beginMatches = [...effectiveLine.matchAll(/\\begin\{([a-zA-Z0-9*]+)\}/g)];
    for (const match of beginMatches) {
      envStack.push({ name: match[1], line: lineNum });
    }

    const endMatches = [...effectiveLine.matchAll(/\\end\{([a-zA-Z0-9*]+)\}/g)];
    for (const match of endMatches) {
      const closingName = match[1];
      if (envStack.length === 0) {
        diagnostics.push({
          id: `unopened-env-${lineNum}-${closingName}`,
          line: lineNum,
          column: (match.index || 0) + 1,
          severity: 'error',
          message: `Closing environment '\\end{${closingName}}' has no matching '\\begin{${closingName}}'.`,
          rule: 'syntax/unmatched-environment',
          rawLog: `! LaTeX Error: \\begin{${closingName}} on input line ${lineNum} ended by \\end{${closingName}}.`,
          suggestedFix: {
            title: `Remove extra \\end{${closingName}}`,
            description: `Removes the orphaned closing tag on line ${lineNum}.`,
            replacement: rawLine.replace(`\\end{${closingName}}`, ''),
            startLine: lineNum,
            endLine: lineNum,
          }
        });
      } else {
        const last = envStack[envStack.length - 1];
        if (last.name === closingName) {
          envStack.pop();
        } else {
          diagnostics.push({
            id: `mismatched-env-${lineNum}-${closingName}`,
            line: lineNum,
            column: (match.index || 0) + 1,
            severity: 'error',
            message: `Mismatched environment: expected '\\end{${last.name}}' (opened on line ${last.line}), but found '\\end{${closingName}}'.`,
            rule: 'syntax/mismatched-environment',
            rawLog: `! LaTeX Error: \\begin{${last.name}} on input line ${last.line} ended by \\end{${closingName}}.`,
            suggestedFix: {
              title: `Change to \\end{${last.name}}`,
              description: `Corrects closing environment tag to match line ${last.line}.`,
              replacement: rawLine.replace(`\\end{${closingName}}`, `\\end{${last.name}}`),
              startLine: lineNum,
              endLine: lineNum,
            }
          });
          envStack.pop();
        }
      }
    }

    // 2. Detect unescaped % when preceded by a number (common mistake: 95% -> 95\%)
    const percentMistakeMatch = rawLine.match(/(\d+)(%)(?!\w)/);
    if (percentMistakeMatch && percentMistakeMatch.index !== undefined) {
      const idx = percentMistakeMatch.index + percentMistakeMatch[1].length;
      if (idx === 0 || rawLine[idx - 1] !== '\\') {
        diagnostics.push({
          id: `unescaped-percent-${lineNum}`,
          line: lineNum,
          column: idx + 1,
          severity: 'warning',
          message: `Unescaped '%' treated as comment. Use '\\%' to display a percentage symbol.`,
          rule: 'syntax/unescaped-special-char',
          rawLog: `LaTeX Warning: '%' character interpreted as comment start on line ${lineNum}.`,
          suggestedFix: {
            title: `Escape percentage symbol (\\%)`,
            description: `Replaces '${percentMistakeMatch[1]}%' with '${percentMistakeMatch[1]}\\%'.`,
            replacement: rawLine.replace(/(\d+)%/, '$1\\%'),
            startLine: lineNum,
            endLine: lineNum,
          }
        });
      }
    }

    // 3. Detect unclosed math inline delimiters on a single line
    const dollarCount = (effectiveLine.match(/(?<!\\)\$/g) || []).length;
    if (dollarCount % 2 !== 0) {
      diagnostics.push({
        id: `unclosed-inline-math-${lineNum}`,
        line: lineNum,
        column: effectiveLine.lastIndexOf('$') + 1,
        severity: 'warning',
        message: `Mismatched inline math delimiter '$'. Odd number of '$' on this line.`,
        rule: 'syntax/unclosed-math',
        rawLog: `! Missing $ inserted on line ${lineNum}.`,
        suggestedFix: {
          title: `Append closing '$'`,
          description: `Adds closing math delimiter to line ${lineNum}.`,
          replacement: rawLine + '$',
          startLine: lineNum,
          endLine: lineNum,
        }
      });
    }

    // 4. Detect missing package for graphicx (\includegraphics without \usepackage{graphicx})
    if (effectiveLine.includes('\\includegraphics') && !validPreamblePackages.has('graphicx')) {
      diagnostics.push({
        id: `missing-graphicx-${lineNum}`,
        line: lineNum,
        column: effectiveLine.indexOf('\\includegraphics') + 1,
        severity: 'error',
        message: `Command '\\includegraphics' requires '\\usepackage{graphicx}' in preamble.`,
        rule: 'package/missing-dependency',
        rawLog: `! Undefined control sequence \\includegraphics on line ${lineNum}.`,
        suggestedFix: {
          title: `Add \\usepackage{graphicx}`,
          description: `Inserts package declaration in preamble.`,
          replacement: `\\usepackage{graphicx}\n` + lines[0],
          startLine: 1,
          endLine: 1,
        }
      });
    }

    // 5. Detect empty \cite{} or \ref{}
    if (effectiveLine.includes('\\cite{}')) {
      diagnostics.push({
        id: `empty-cite-${lineNum}`,
        line: lineNum,
        column: effectiveLine.indexOf('\\cite{}') + 1,
        severity: 'warning',
        message: `Empty citation reference '\\cite{}'. Specify a bibliography key.`,
        rule: 'bib/empty-reference',
      });
    }
  }

  // Check remaining unclosed environments at end of file
  while (envStack.length > 0) {
    const unclosed = envStack.pop()!;
    diagnostics.push({
      id: `unclosed-env-${unclosed.line}-${unclosed.name}`,
      line: unclosed.line,
      column: 1,
      severity: 'error',
      message: `Environment '\\begin{${unclosed.name}}' opened on line ${unclosed.line} is never closed.`,
      rule: 'syntax/unclosed-environment',
      rawLog: `! LaTeX Error: \\begin{${unclosed.name}} on input line ${unclosed.line} ended by \\end{document}.`,
      suggestedFix: {
        title: `Insert \\end{${unclosed.name}} at end`,
        description: `Appends closing tag '\\end{${unclosed.name}}' to the document.`,
        replacement: `${code.trimEnd()}\n\\end{${unclosed.name}}\n`,
        startLine: lines.length,
        endLine: lines.length,
      }
    });
  }

  return diagnostics;
}

/**
 * Structural Parser: Extracts Title, Authors, Abstract, Sections, Math, and Layout
 */
export function parseLatexDocument(code: string): ParsedDocument {
  const lines = code.split('\n');

  let title = 'Untitled Document';
  const authors: string[] = [];
  let date = '';
  let abstract = '';
  let documentClass = 'article';
  let isTwoColumn = false;

  // Extract \documentclass
  const docClassMatch = code.match(/\\documentclass(?:\[(.*?)\])?\{([a-zA-Z0-9]+)\}/);
  if (docClassMatch) {
    documentClass = docClassMatch[2];
    if (docClassMatch[1] && docClassMatch[1].includes('twocolumn')) {
      isTwoColumn = true;
    }
  }

  // Extract \title{...}
  const titleMatch = code.match(/\\title\{([\s\S]*?)\}/);
  if (titleMatch) {
    title = cleanLatexInline(titleMatch[1]);
  }

  // Extract \author{...}
  const authorMatch = code.match(/\\author\{([\s\S]*?)\}/);
  if (authorMatch) {
    const rawAuthors = authorMatch[1].split(/\\and|\s*,\s*/);
    for (const a of rawAuthors) {
      const cleaned = cleanLatexInline(a).trim();
      if (cleaned) authors.push(cleaned);
    }
  }

  // Extract \date{...}
  const dateMatch = code.match(/\\date\{([\s\S]*?)\}/);
  if (dateMatch) {
    date = cleanLatexInline(dateMatch[1]);
  }

  // Extract \begin{abstract} ... \end{abstract}
  const abstractMatch = code.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);
  if (abstractMatch) {
    abstract = abstractMatch[1].trim();
  }

  // Extract Sections with line numbers for SyncTeX jump
  const sections: ParsedDocument['sections'] = [];
  const mathBlocks: ParsedDocument['mathBlocks'] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];

    const secMatch = line.match(/\\(section|subsection|subsubsection)\*?\{([^}]+)\}/);
    if (secMatch) {
      const level = secMatch[1] === 'section' ? 1 : secMatch[1] === 'subsection' ? 2 : 3;
      sections.push({
        title: cleanLatexInline(secMatch[2]),
        level,
        content: '',
        line: lineNum,
      });
    }

    // Match display math equations
    const eqMatch = line.match(/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/) || line.match(/\\\[([\s\S]*?)\\\]/);
    if (eqMatch) {
      mathBlocks.push({
        latex: eqMatch[1].trim(),
        display: true,
        line: lineNum,
      });
    }
  }

  return {
    title,
    authors: authors.length ? authors : ['Author Name'],
    date: date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    abstract,
    sections,
    mathBlocks,
    isTwoColumn,
    documentClass,
  };
}

/**
 * Render High-Fidelity Academic Paper HTML with KaTeX Math
 */
export function renderLatexToHtml(code: string): string {
  // Strip comments
  let cleanCode = code
    .split('\n')
    .map(line => {
      const idx = line.indexOf('%');
      if (idx !== -1 && (idx === 0 || line[idx - 1] !== '\\')) {
        return line.substring(0, idx);
      }
      return line;
    })
    .join('\n');

  // Extract Document Body
  const bodyMatch = cleanCode.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  let bodyText = bodyMatch ? bodyMatch[1] : cleanCode;

  // Render Math: Display math blocks \[ ... \] or \begin{equation} ... \end{equation}
  bodyText = bodyText.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (_, math) => {
    try {
      return `<div class="latex-math-display">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `<div class="latex-math-error">[Math Rendering Error: ${escapeHtml(math)}]</div>`;
    }
  });

  bodyText = bodyText.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    try {
      return `<div class="latex-math-display">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `<div class="latex-math-error">[Math Rendering Error: ${escapeHtml(math)}]</div>`;
    }
  });

  // Render Inline math: $ ... $
  bodyText = bodyText.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (_, math) => {
    try {
      return `<span class="latex-math-inline">${katex.renderToString(math.trim(), { displayMode: false, throwOnError: false })}</span>`;
    } catch {
      return `<span class="latex-math-error">${escapeHtml(math)}</span>`;
    }
  });

  // Format Tables: \begin{tabular}{...} ... \end{tabular}
  bodyText = bodyText.replace(/\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g, (_, tableContent) => {
    const rows = tableContent
      .trim()
      .split('\\\\')
      .map((r: string) => r.trim())
      .filter((r: string) => r && !r.startsWith('\\hline'));

    let html = '<div class="table-container"><table class="latex-table"><tbody>';
    for (const row of rows) {
      const cells = row.split('&').map((c: string) => c.replace(/\\hline/g, '').trim());
      html += '<tr>' + cells.map((c: string) => `<td>${parseInlineFormatting(c)}</td>`).join('') + '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  });

  // Format Headings
  bodyText = bodyText.replace(/\\section\*?\{([^}]+)\}/g, '<h2 class="latex-section">$1</h2>');
  bodyText = bodyText.replace(/\\subsection\*?\{([^}]+)\}/g, '<h3 class="latex-subsection">$1</h3>');
  bodyText = bodyText.replace(/\\subsubsection\*?\{([^}]+)\}/g, '<h4 class="latex-subsubsection">$1</h4>');

  // Format Lists
  bodyText = bodyText.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, content) => {
    const items = content.split('\\item').slice(1);
    return '<ul class="latex-list">' + items.map((it: string) => `<li>${parseInlineFormatting(it.trim())}</li>`).join('') + '</ul>';
  });

  bodyText = bodyText.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, content) => {
    const items = content.split('\\item').slice(1);
    return '<ol class="latex-list">' + items.map((it: string) => `<li>${parseInlineFormatting(it.trim())}</li>`).join('') + '</ol>';
  });

  // Format Abstract
  bodyText = bodyText.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, (_, abs) => {
    return `<div class="latex-abstract"><div class="latex-abstract-title">ABSTRACT</div><p>${parseInlineFormatting(abs.trim())}</p></div>`;
  });

  // Inline Formatting
  bodyText = parseInlineFormatting(bodyText);

  // Paragraph wrapping
  const paragraphs = bodyText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      if (p.startsWith('<h') || p.startsWith('<div') || p.startsWith('<ul') || p.startsWith('<ol') || p.startsWith('<table')) {
        return p;
      }
      return `<p class="latex-paragraph">${p}</p>`;
    });

  return paragraphs.join('\n');
}

function parseInlineFormatting(text: string): string {
  return text
    .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
    .replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>')
    .replace(/\\texttt\{([^}]+)\}/g, '<code class="latex-code">$1</code>')
    .replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>')
    .replace(/\\cite\{([^}]+)\}/g, '<span class="latex-citation">[$1]</span>')
    .replace(/\\ref\{([^}]+)\}/g, '<span class="latex-ref">$1</span>')
    .replace(/\\%/g, '%')
    .replace(/\\_/g, '_')
    .replace(/\\&/g, '&amp;')
    .replace(/\\maketitle/g, '');
}

function cleanLatexInline(text: string): string {
  return text
    .replace(/\\textbf\{([^}]+)\}/g, '$1')
    .replace(/\\textit\{([^}]+)\}/g, '$1')
    .replace(/\\texttt\{([^}]+)\}/g, '$1')
    .replace(/\\\\/g, ' ')
    .replace(/\\/g, '')
    .trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
