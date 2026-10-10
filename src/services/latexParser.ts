import katex from 'katex';
import type { Diagnostic, ParsedDocument, ProjectFile, LatexLabel } from '../types/latex';
import { renderTikzToSvg } from './tikzRenderer';
import { resolveProjectAsset } from './virtualFileSystem';

// High-speed KaTeX formula LRU cache (eliminates redundant formula typesetting during editing)
const katexFormulaCache = new Map<string, string>();
const MAX_KATEX_CACHE = 2500;

export function renderKatexCached(latex: string, displayMode: boolean): string {
  const key = `${displayMode ? 'D' : 'I'}:${latex}`;
  const existing = katexFormulaCache.get(key);
  if (existing !== undefined) return existing;

  try {
    const rendered = katex.renderToString(latex, { displayMode, throwOnError: false });
    if (katexFormulaCache.size >= MAX_KATEX_CACHE) {
      const oldestKeys = Array.from(katexFormulaCache.keys()).slice(0, 500);
      for (const k of oldestKeys) katexFormulaCache.delete(k);
    }
    katexFormulaCache.set(key, rendered);
    return rendered;
  } catch {
    return `<span class="latex-math-error">[Math Rendering Error]</span>`;
  }
}

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
export function parseLatexDocument(code: string, files?: ProjectFile[]): ParsedDocument {
  // Expand \input / \include before parsing structure
  let expandedCode = code;
  if (files && files.length > 0) {
    expandedCode = expandedCode.replace(/\\(?:input|include)\{([^}]+)\}/g, (orig, path) => {
      const cleanPath = path.trim();
      const target = files.find(f => 
        f.name === cleanPath || 
        f.name === `${cleanPath}.tex` ||
        f.name.endsWith(`/${cleanPath}`) ||
        f.name.endsWith(`/${cleanPath}.tex`)
      );
      return target ? target.content : orig;
    });
  }

  const lines = expandedCode.split('\n');

  let title = 'Untitled Document';
  const authors: string[] = [];
  let date = '';
  let abstract = '';
  let documentClass = 'article';
  let isTwoColumn = false;

  // Extract \documentclass
  const docClassMatch = expandedCode.match(/\\documentclass(?:\[(.*?)\])?\{([a-zA-Z0-9]+)\}/);
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

  // Support \begin{titlepage} ... \end{titlepage} and \begin{title} ... \end{title}
  const titlePageMatch = code.match(/\\begin\{(?:titlepage|title)\}([\s\S]*?)\\end\{(?:titlepage|title)\}/);
  let hasTitlePage = false;
  let titlePageContent = '';
  if (titlePageMatch) {
    hasTitlePage = true;
    titlePageContent = titlePageMatch[1];
    if (title === 'Untitled Document') {
      const hugeMatch = titlePageContent.match(/\\(?:Huge|huge|LARGE|Large)\{?([^}\n\\]+)\}?/);
      const boldMatch = titlePageContent.match(/\\textbf\{([^}]+)\}/);
      if (hugeMatch) {
        title = cleanLatexInline(hugeMatch[1]).trim();
      } else if (boldMatch) {
        title = cleanLatexInline(boldMatch[1]).trim();
      } else {
        const line = titlePageContent.split('\n').map(l => cleanLatexInline(l).trim()).find(l => l.length > 3 && !l.startsWith('\\'));
        if (line) title = line;
      }
    }
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

  // Extract Line anchors for SyncTeX
  let titleLine = 1;
  let authorLine = 1;
  let dateLine = 1;
  let abstractLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if ((l.includes('\\title{') || l.includes('\\begin{titlepage}') || l.includes('\\begin{title}')) && titleLine === 1) titleLine = i + 1;
    if (l.includes('\\author{') && authorLine === 1) authorLine = i + 1;
    if (l.includes('\\date{') && dateLine === 1) dateLine = i + 1;
    if (l.includes('\\begin{abstract}') && abstractLine === 1) abstractLine = i + 1;
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
    titleLine,
    authorLine,
    dateLine,
    abstractLine,
    sections,
    mathBlocks,
    isTwoColumn,
    documentClass,
    hasTitlePage,
    titlePageContent,
  };
}

/**
 * Helper to locate source line number for SyncTeX jump
 */
function findSourceLine(needle: string, rawLines: string[], hintPrefix?: string): number {
  const clean = needle.trim();
  if (!clean) return 1;

  // 1. If a hintPrefix is given (e.g. '\\section', '\\begin{equation', '\\begin{tabular'), try matching both
  if (hintPrefix) {
    const idx = rawLines.findIndex(l => l.includes(hintPrefix) && l.toLowerCase().includes(clean.slice(0, 15).toLowerCase()));
    if (idx !== -1) return idx + 1;
  }

  // 2. Exact substring match of snippet
  const snippet = clean.slice(0, 25);
  const idx = rawLines.findIndex(l => l.includes(snippet));
  if (idx !== -1) return idx + 1;

  // 3. Case-insensitive substring match
  const lowerSnippet = snippet.toLowerCase();
  const lowerIdx = rawLines.findIndex(l => l.toLowerCase().includes(lowerSnippet));
  if (lowerIdx !== -1) return lowerIdx + 1;

  // 4. Token-based match (first 2-3 words)
  const words = clean.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
  if (words.length > 0) {
    const wordIdx = rawLines.findIndex(l => words.every(w => l.toLowerCase().includes(w.toLowerCase())));
    if (wordIdx !== -1) return wordIdx + 1;
  }

  // 5. Hint prefix alone fallback
  if (hintPrefix) {
    const prefixIdx = rawLines.findIndex(l => l.includes(hintPrefix));
    if (prefixIdx !== -1) return prefixIdx + 1;
  }

  return 1;
}

/**
 * Render High-Fidelity Academic Paper HTML with KaTeX Math, Figures, and SyncTeX line anchors
 */
export function renderLatexToHtml(code: string, files?: ProjectFile[]): string {
  const rawLines = code.split('\n');

  // Strip comments
  let cleanCode = code
    .split('\n')
    .map((line, idx) => {
      const lineNum = idx + 1;
      const cIdx = line.indexOf('%');
      let effective = line;
      if (cIdx !== -1 && (cIdx === 0 || line[cIdx - 1] !== '\\')) {
        effective = line.substring(0, cIdx);
      }
      return { lineNum, text: effective };
    })
    .map(l => l.text)
    .join('\n');

  // Support \input{sections/intro.tex} or \include{sections/intro}
  if (files && files.length > 0) {
    cleanCode = cleanCode.replace(/\\(?:input|include)\{([^}]+)\}/g, (orig, path) => {
      const cleanPath = path.trim();
      const target = files.find(f => 
        f.name === cleanPath || 
        f.name === `${cleanPath}.tex` ||
        f.name.endsWith(`/${cleanPath}`) ||
        f.name.endsWith(`/${cleanPath}.tex`)
      );
      return target ? target.content : orig;
    });
  }

  // Extract Document Body
  const bodyMatch = cleanCode.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  let bodyText = bodyMatch ? bodyMatch[1] : cleanCode;

  // Support \begin{titlepage} ... \end{titlepage} and \begin{title} ... \end{title}
  bodyText = bodyText.replace(/\\begin\{(?:titlepage|title)\}([\s\S]*?)\\end\{(?:titlepage|title)\}/g, (_, content) => {
    const tpLine = findSourceLine('titlepage', rawLines, '\\begin{titlepage');
    let parsedTp = content
      .replace(/\\centering/g, '')
      .replace(/\\vspace\*?\{[^}]+\}/g, '<div style="height: 18px;"></div>')
      .replace(/\\vfill/g, '<div style="flex: 1; min-height: 24px;"></div>')
      .replace(/\\today/g, new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
      .replace(/\\Huge\{?([^}\\]+)\}?/g, '<div style="font-size: 24px; font-weight: 800; line-height: 1.3; margin-bottom: 12px; color: var(--paper-text);">$1</div>')
      .replace(/\\huge\{?([^}\\]+)\}?/g, '<div style="font-size: 20px; font-weight: 700; line-height: 1.3; margin-bottom: 10px; color: var(--paper-text);">$1</div>')
      .replace(/\\LARGE\{?([^}\\]+)\}?/g, '<div style="font-size: 18px; font-weight: 700; line-height: 1.3; margin-bottom: 8px; color: var(--paper-text);">$1</div>')
      .replace(/\\Large\{?([^}\\]+)\}?/g, '<div style="font-size: 16px; font-weight: 600; line-height: 1.35; margin-bottom: 8px; color: var(--paper-text);">$1</div>')
      .replace(/\\large\{?([^}\\]+)\}?/g, '<div style="font-size: 14px; font-weight: 500; line-height: 1.4; margin-bottom: 6px; color: var(--paper-text);">$1</div>')
      .replace(/\\par/g, '<div style="height: 6px;"></div>')
      .replace(/\\\\/g, '<br/>');

    parsedTp = parseInlineFormatting(parsedTp);

    const tpLines = parsedTp
      .split(/\n\s*\n/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0)
      .map((p: string) => {
        if (/^<div|^<h|^<br/.test(p)) return p;
        return `<div style="margin: 6px 0; font-size: 13px; color: var(--paper-text);">${p}</div>`;
      })
      .join('\n');

    return `\n\n<div class="latex-titlepage synctex-target" data-line="${tpLine}" title="Click to jump to titlepage in code" style="min-height: 750px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 40px 20px;">
      ${tpLines}
    </div>\n\n<div class="latex-page-break" data-break="titlepage"></div>\n\n`;
  });

  // Support discrete page breaks: \newpage, \pagebreak, \clearpage, \cleardoublepage
  bodyText = bodyText.replace(/\\(?:newpage|pagebreak|clearpage|cleardoublepage)/g, '\n\n<div class="latex-page-break"></div>\n\n');

  // Render Figures: \begin{figure} ... \includegraphics{...} ... \end{figure}
  bodyText = bodyText.replace(/\\begin\{figure\*?\}(?:\[.*?\])?([\s\S]*?)\\end\{figure\*?\}/g, (_, figContent) => {
    const imgMatch = figContent.match(/\\includegraphics(?:\[.*?\])?\{([^}]+)\}/);
    const captionMatch = figContent.match(/\\caption\{([^}]+)\}/);
    const labelMatch = figContent.match(/\\label\{([^}]+)\}/);

    const filename = imgMatch ? imgMatch[1].trim() : 'figure.png';
    const caption = captionMatch ? parseInlineFormatting(captionMatch[1]) : '';
    const label = labelMatch ? labelMatch[1] : '';
    const figLine = findSourceLine(filename, rawLines, '\\includegraphics');

    // Check if image exists in project files with dataUrl using robust resolver
    const matchedFile = resolveProjectAsset(filename, files);
    const imgSrc = matchedFile?.dataUrl || '';

    return `
      <div class="latex-figure-container synctex-target" data-line="${figLine}" id="${label}" title="Click to jump to line ${figLine} in code">
        ${imgSrc ? `
          <img src="${imgSrc}" alt="${caption || filename}" class="latex-figure-img" />
        ` : `
          <div class="latex-figure-placeholder">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
            <div style="font-size: 11px; font-weight: 600; color: #475569; margin-top: 4px;">Figure: ${escapeHtml(filename)}</div>
          </div>
        `}
        ${caption ? `<div class="latex-figure-caption"><strong>Fig. 1.</strong> ${caption}</div>` : ''}
      </div>
    `;
  });

  // Direct \includegraphics outside figure environment
  bodyText = bodyText.replace(/\\includegraphics(?:\[.*?\])?\{([^}]+)\}/g, (_, filename) => {
    const name = filename.trim();
    const figLine = findSourceLine(name, rawLines, '\\includegraphics');
    const matchedFile = resolveProjectAsset(name, files);
    if (matchedFile?.dataUrl) {
      return `<div class="latex-figure-container synctex-target" data-line="${figLine}" title="Click to jump to line ${figLine} in code"><img src="${matchedFile.dataUrl}" alt="${name}" class="latex-figure-img" /></div>`;
    }
    return `<div class="latex-figure-container synctex-target" data-line="${figLine}" title="Click to jump to line ${figLine} in code"><div class="latex-figure-placeholder">[Figure: ${escapeHtml(name)}]</div></div>`;
  });

  // Render Math: Display math blocks \[ ... \] or \begin{equation} ... \end{equation}
  bodyText = bodyText.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (_, math) => {
    const eqLine = findSourceLine(math.trim().slice(0, 20), rawLines, '\\begin{equation');
    const rendered = renderKatexCached(math.trim(), true);
    return `<div class="latex-math-display synctex-target" data-line="${eqLine}" title="Click to jump to line ${eqLine} in code">${rendered}</div>`;
  });

  bodyText = bodyText.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    const eqLine = findSourceLine(math.trim().slice(0, 20), rawLines, '\\[');
    const rendered = renderKatexCached(math.trim(), true);
    return `<div class="latex-math-display synctex-target" data-line="${eqLine}" title="Click to jump to line ${eqLine} in code">${rendered}</div>`;
  });

  // Render Inline math: $ ... $
  bodyText = bodyText.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (_, math) => {
    const rendered = renderKatexCached(math.trim(), false);
    return `<span class="latex-math-inline">${rendered}</span>`;
  });

  // Render TikZ Vector Graphics: \begin{tikzpicture}[...] ... \end{tikzpicture}
  bodyText = bodyText.replace(/\\begin\{tikzpicture\}(?:\[(.*?)\])?([\s\S]*?)\\end\{tikzpicture\}/g, (_, opts, tikzContent) => {
    const fullCode = (opts ? `[${opts}] ` : '') + (tikzContent || '');
    const tikzLine = findSourceLine('tikzpicture', rawLines, '\\begin{tikzpicture');
    const svg = renderTikzToSvg(fullCode);
    return `<div class="latex-figure-container synctex-target" data-line="${tikzLine}" title="Click to jump to line ${tikzLine} in code">${svg}</div>`;
  });

  // Format Tables: \begin{tabular}{...} ... \end{tabular}
  bodyText = bodyText.replace(/\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g, (_, tableContent) => {
    const rows = tableContent
      .trim()
      .split('\\\\')
      .map((r: string) => r.trim())
      .filter((r: string) => r && !r.startsWith('\\hline'));

    const firstCell = rows[0]?.split('&')[0]?.replace(/\\hline/g, '').trim() || '';
    const tabLine = findSourceLine(firstCell || 'tabular', rawLines, '\\begin{tabular');

    let html = `<div class="table-container synctex-target" data-line="${tabLine}" title="Click to jump to line ${tabLine} in code"><table class="latex-table"><tbody>`;
    for (const row of rows) {
      const cells = row.split('&').map((c: string) => c.replace(/\\hline/g, '').trim());
      html += '<tr>' + cells.map((c: string) => `<td>${parseInlineFormatting(c)}</td>`).join('') + '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  });

  // Format Headings with synctex-target class & data-line
  bodyText = bodyText.replace(/\\(section|subsection|subsubsection)\*?\{([^}]+)\}/g, (_, level, headingText) => {
    const cleanHeading = cleanLatexInline(headingText).trim();
    const secLine = findSourceLine(cleanHeading, rawLines, `\\${level}`);
    const tag = level === 'section' ? 'h2' : level === 'subsection' ? 'h3' : 'h4';
    const cls = level === 'section' ? 'latex-section' : level === 'subsection' ? 'latex-subsection' : 'latex-subsubsection';
    return `\n\n<${tag} class="${cls} synctex-target" data-line="${secLine}" title="Click to jump to line ${secLine} in code">${headingText}</${tag}>\n\n`;
  });

  // Format Lists
  bodyText = bodyText.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, content) => {
    const listLine = findSourceLine('\\begin{itemize', rawLines);
    const items = content.split('\\item').slice(1);
    return `\n\n<ul class="latex-list synctex-target" data-line="${listLine}" title="Click to jump to line ${listLine} in code">` + items.map((it: string) => {
      const itLine = findSourceLine(it.trim().slice(0, 20), rawLines, '\\item');
      return `<li class="synctex-target" data-line="${itLine}" title="Click to jump to line ${itLine} in code">${parseInlineFormatting(it.trim())}</li>`;
    }).join('') + '</ul>\n\n';
  });

  bodyText = bodyText.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, content) => {
    const listLine = findSourceLine('\\begin{enumerate', rawLines);
    const items = content.split('\\item').slice(1);
    return `\n\n<ol class="latex-list synctex-target" data-line="${listLine}" title="Click to jump to line ${listLine} in code">` + items.map((it: string) => {
      const itLine = findSourceLine(it.trim().slice(0, 20), rawLines, '\\item');
      return `<li class="synctex-target" data-line="${itLine}" title="Click to jump to line ${itLine} in code">${parseInlineFormatting(it.trim())}</li>`;
    }).join('') + '</ol>\n\n';
  });

  // Format Abstract
  bodyText = bodyText.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, (_, abs) => {
    const absLine = findSourceLine('\\begin{abstract}', rawLines);
    return `\n\n<div class="latex-abstract synctex-target" data-line="${absLine}" title="Click to jump to line ${absLine} in code"><div class="latex-abstract-title">ABSTRACT</div><p class="synctex-target" data-line="${absLine}">${parseInlineFormatting(abs.trim())}</p></div>\n\n`;
  });

  // Inline Formatting
  bodyText = parseInlineFormatting(bodyText);

  // Separate any text immediately following block tags with double newlines
  bodyText = bodyText
    .replace(/(<\/(?:h2|h3|h4|div|ul|ol|table)>)\s*([^\n<\s])/g, '$1\n\n$2')
    .replace(/([^\n>\s])\s*(<(?:h2|h3|h4|div|ul|ol|table)[\s>])/g, '$1\n\n$2');

  // Paragraph wrapping with accurate data-line anchors
  const paragraphs = bodyText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      // If block starts with a recognized container or heading tag, keep it as is
      if (/^<(?:h2|h3|h4|div|ul|ol|table)[\s>]/.test(p)) {
        return p;
      }
      const cleanSnippet = p.replace(/<[^>]+>/g, '').trim().slice(0, 30);
      const pLine = cleanSnippet ? findSourceLine(cleanSnippet.slice(0, 18), rawLines) : 1;
      return `<p class="latex-paragraph synctex-target" data-line="${pLine}" title="Click to jump to line ${pLine} in code">${p}</p>`;
    });

  return paragraphs.join('\n\n');
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

export interface BeamerSlide {
  title: string;
  content: string;
  slideNumber: number;
}

export function extractBeamerSlides(code: string): BeamerSlide[] {
  const slides: BeamerSlide[] = [];
  const frameRegex = /\\begin\{frame\}(?:\[.*?\])?(?:\{([^}]+)\})?([\s\S]*?)\\end\{frame\}/g;
  let match: RegExpExecArray | null;
  let num = 1;

  while ((match = frameRegex.exec(code)) !== null) {
    const rawTitle = match[1] || '';
    const body = match[2] || '';
    const frameTitleMatch = body.match(/\\frametitle\{([^}]+)\}/);
    const title = cleanLatexInline(frameTitleMatch ? frameTitleMatch[1] : rawTitle) || `Slide ${num}`;
    slides.push({
      title,
      content: body.replace(/\\frametitle\{[^}]+\}/g, '').trim(),
      slideNumber: num++,
    });
  }

  return slides;
}

export function extractLatexLabels(files: ProjectFile[]): LatexLabel[] {
  const labels: LatexLabel[] = [];

  for (const file of files) {
    if (!file.content) continue;
    const lines = file.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const match = lineText.match(/\\label\{([^}]+)\}/);
      if (match) {
        const key = match[1].trim();
        let type: LatexLabel['type'] = 'other';
        if (key.startsWith('sec:') || key.startsWith('subsec:')) type = 'section';
        else if (key.startsWith('fig:')) type = 'figure';
        else if (key.startsWith('tab:')) type = 'table';
        else if (key.startsWith('eq:')) type = 'equation';

        let caption = '';
        const start = Math.max(0, i - 3);
        const end = Math.min(lines.length - 1, i + 3);
        for (let j = start; j <= end; j++) {
          const capMatch = lines[j].match(/\\caption\{([^}]+)\}/) || lines[j].match(/\\(?:section|subsection)\*?\{([^}]+)\}/);
          if (capMatch) {
            caption = cleanLatexInline(capMatch[1]);
            break;
          }
        }

        labels.push({
          key,
          type,
          caption: caption || undefined,
          line: i + 1,
          fileName: file.name,
        });
      }
    }
  }

  return labels;
}
