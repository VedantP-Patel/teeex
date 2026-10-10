import katex from 'katex';
import type { Diagnostic, ParsedDocument, ProjectFile, LatexLabel } from '../types/latex';
import { renderTikzToSvg } from './tikzRenderer';
import { resolveProjectAsset } from './virtualFileSystem';

// High-speed KaTeX formula LRU cache (eliminates redundant formula typesetting during editing)
const katexFormulaCache = new Map<string, string>();
const MAX_KATEX_CACHE = 3000;

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
    return `<span class="latex-math-error">[Math Rendering Error: ${escapeHtml(latex.slice(0, 30))}]</span>`;
  }
}

/**
 * Converts standard LaTeX dimension strings into browser-compatible CSS dimensions.
 * Handles: 0.48\textwidth, 0.5\columnwidth, \linewidth, 5cm, 40mm, 2in, 120pt, 100px.
 */
export function parseLatexDimensionToCss(dim: string): string {
  if (!dim) return '100%';
  const clean = dim.trim().replace(/[{}]/g, '');
  if (!clean) return '100%';

  const isNeg = clean.startsWith('-');
  const unsigned = isNeg ? clean.slice(1).trim() : clean;

  // Match relative widths: e.g. 0.48\textwidth, 0.5\columnwidth, \linewidth, \textwidth
  const relMatch = unsigned.match(/^([0-9.]*)\s*\\(textwidth|columnwidth|linewidth|paperwidth|pagewidth)$/i);
  if (relMatch) {
    const factor = relMatch[1] ? parseFloat(relMatch[1]) : 1.0;
    if (!isNaN(factor)) {
      const val = Math.round(factor * 1000) / 10;
      return isNeg ? `-${val}%` : `${val}%`;
    }
    return isNeg ? '-100%' : '100%';
  }

  // Explicit units: cm, mm, in, pt, em, ex, px
  const unitMatch = unsigned.match(/^([0-9.]+)\s*(cm|mm|in|pt|em|ex|px)$/i);
  if (unitMatch) {
    const val = parseFloat(unitMatch[1]);
    const unit = unitMatch[2].toLowerCase();
    if (!isNaN(val)) {
      return isNeg ? `-${val}${unit}` : `${val}${unit}`;
    }
  }

  // Pure number fallback
  const numMatch = unsigned.match(/^([0-9.]+)$/);
  if (numMatch) {
    return isNeg ? `-${numMatch[1]}px` : `${numMatch[1]}px`;
  }

  if (unsigned.includes('\\textwidth') || unsigned.includes('\\columnwidth') || unsigned.includes('\\linewidth')) {
    return isNeg ? '-100%' : '100%';
  }

  return '100%';
}

/**
 * Expands repeated column specifiers e.g. *{3}{c} -> ccc, *{2}{|l|r|} -> |l|r||l|r|
 */
export function expandColSpec(spec: string): string {
  let expanded = spec;
  const repRegex = /\*\{?(\d+)\}?\{([^}]+)\}/g;
  let prev = '';
  let iterations = 0;
  while (prev !== expanded && iterations < 8) {
    prev = expanded;
    expanded = expanded.replace(repRegex, (_, countStr, pattern) => {
      const count = parseInt(countStr, 10);
      if (isNaN(count) || count <= 0 || count > 50) return pattern;
      return pattern.repeat(count);
    });
    iterations++;
  }
  return expanded;
}

export interface ColSpecItem {
  align: 'left' | 'center' | 'right' | 'justify';
  width?: string;
  borderLeft?: boolean;
  borderRight?: boolean;
  isX?: boolean;
}

export function parseColSpec(rawSpec: string): ColSpecItem[] {
  const spec = expandColSpec(rawSpec.replace(/^\{|\}$/g, '').trim());
  const cols: ColSpecItem[] = [];
  let pendingBorderLeft = false;

  let i = 0;
  while (i < spec.length) {
    const ch = spec[i];
    if (ch === '|') {
      if (cols.length > 0) {
        cols[cols.length - 1].borderRight = true;
      }
      pendingBorderLeft = true;
      i++;
    } else if (ch === 'l') {
      cols.push({ align: 'left', borderLeft: pendingBorderLeft });
      pendingBorderLeft = false;
      i++;
    } else if (ch === 'c') {
      cols.push({ align: 'center', borderLeft: pendingBorderLeft });
      pendingBorderLeft = false;
      i++;
    } else if (ch === 'r') {
      cols.push({ align: 'right', borderLeft: pendingBorderLeft });
      pendingBorderLeft = false;
      i++;
    } else if (ch === 'p' || ch === 'm' || ch === 'b') {
      i++;
      let widthStr = '';
      if (spec[i] === '{') {
        const closeIdx = spec.indexOf('}', i);
        if (closeIdx !== -1) {
          widthStr = spec.substring(i + 1, closeIdx);
          i = closeIdx + 1;
        } else {
          widthStr = spec.substring(i + 1);
          i = spec.length;
        }
      }
      const cssWidth = widthStr ? parseLatexDimensionToCss(widthStr) : undefined;
      cols.push({
        align: ch === 'p' ? 'left' : 'center',
        width: cssWidth,
        borderLeft: pendingBorderLeft,
      });
      pendingBorderLeft = false;
    } else if (ch === '>') {
      // Lookahead for formatting commands inside >{...} e.g. >{\centering\arraybackslash}X
      i++;
      let formatCmd = '';
      if (spec[i] === '{') {
        let depth = 1;
        const startIdx = i + 1;
        i++;
        while (i < spec.length && depth > 0) {
          if (spec[i] === '{') depth++;
          else if (spec[i] === '}') depth--;
          i++;
        }
        formatCmd = spec.substring(startIdx, i - 1);
      }
      let alignOverride: 'left' | 'center' | 'right' | undefined;
      if (formatCmd.includes('centering')) alignOverride = 'center';
      else if (formatCmd.includes('raggedleft')) alignOverride = 'right';
      else if (formatCmd.includes('raggedright')) alignOverride = 'left';

      if (i < spec.length) {
        const nextCol = spec[i];
        if (nextCol === 'X') {
          cols.push({
            align: alignOverride || 'left',
            isX: true,
            borderLeft: pendingBorderLeft,
          });
          pendingBorderLeft = false;
          i++;
        } else if (nextCol === 'c' || nextCol === 'l' || nextCol === 'r') {
          cols.push({
            align: alignOverride || (nextCol === 'c' ? 'center' : nextCol === 'r' ? 'right' : 'left'),
            borderLeft: pendingBorderLeft,
          });
          pendingBorderLeft = false;
          i++;
        }
      }
    } else if (ch === 'X') {
      cols.push({ align: 'left', isX: true, borderLeft: pendingBorderLeft });
      pendingBorderLeft = false;
      i++;
    } else if (ch === '@' || ch === '!') {
      i++;
      if (spec[i] === '{') {
        let depth = 1;
        i++;
        while (i < spec.length && depth > 0) {
          if (spec[i] === '{') depth++;
          else if (spec[i] === '}') depth--;
          i++;
        }
      }
    } else {
      if (ch === 'S') {
        cols.push({ align: 'right', borderLeft: pendingBorderLeft });
        pendingBorderLeft = false;
      }
      i++;
    }
  }

  if (pendingBorderLeft && cols.length > 0) {
    cols[cols.length - 1].borderRight = true;
  }

  return cols.length > 0 ? cols : [{ align: 'left' }];
}

/**
 * Splits LaTeX table row cells on '&' without breaking nested braces or math formulas
 */
export function splitLatexRowCells(rowText: string): string[] {
  const cells: string[] = [];
  let current = '';
  let braceDepth = 0;
  let inMath = false;

  for (let i = 0; i < rowText.length; i++) {
    const ch = rowText[i];
    const prev = i > 0 ? rowText[i - 1] : '';

    if (ch === '$' && prev !== '\\') {
      inMath = !inMath;
      current += ch;
    } else if (ch === '{' && prev !== '\\' && !inMath) {
      braceDepth++;
      current += ch;
    } else if (ch === '}' && prev !== '\\' && !inMath) {
      if (braceDepth > 0) braceDepth--;
      current += ch;
    } else if (ch === '&' && prev !== '\\' && braceDepth === 0 && !inMath) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Robust LaTeX Tabular environment parser.
 * Supports:
 * - Alignment specs: l, c, r, p{width}, | borders, *{n}{spec}
 * - Booktabs: \toprule, \midrule, \bottomrule
 * - Standard rules: \hline, \hline\hline, \cline{i-j}
 * - Multi-column: \multicolumn{num}{spec}{content}
 * - Multi-row: \multirow{num}{width}{content}
 * - Automatic <thead> and <tbody> generation
 */
export function parseTabularEnvironment(
  tableContent: string,
  colSpecRaw: string,
  _rawLines: string[],
  tabLine: number,
  tableWidthRaw?: string
): string {
  const cols = parseColSpec(colSpecRaw);
  const isBooktabs = /\\(?:toprule|midrule|bottomrule)/.test(tableContent);
  const hasXColumns = cols.some(c => c.isX);
  const isTabularx = !!tableWidthRaw || hasXColumns;
  const tableWidthCss = tableWidthRaw ? parseLatexDimensionToCss(tableWidthRaw) : (hasXColumns ? '100%' : '');

  const rawRows = tableContent
    .split(/\\\\(?:\s*\[[^\]]*\])?/)
    .map(r => r.trim());

  let theadHtml = '';
  let tbodyHtml = '';
  let isHeaderRow = true;
  let dataRowCount = 0;

  for (let rIdx = 0; rIdx < rawRows.length; rIdx++) {
    const rowRaw = rawRows[rIdx];
    if (!rowRaw) continue;

    const hasTopRule = rowRaw.includes('\\toprule');
    const hasMidRule = rowRaw.includes('\\midrule');
    const hasBottomRule = rowRaw.includes('\\bottomrule');
    const hasHline = rowRaw.includes('\\hline');

    const cleanRow = rowRaw
      .replace(/\\(?:toprule|midrule|bottomrule|hline)/g, '')
      .replace(/\\cline\{[^}]+\}/g, '')
      .trim();

    if (!cleanRow) {
      if (hasMidRule || (hasHline && dataRowCount > 0)) {
        isHeaderRow = false;
      }
      continue;
    }

    const cells = splitLatexRowCells(cleanRow);
    let cellsHtml = '';

    for (let cIdx = 0; cIdx < cells.length; cIdx++) {
      let cellText = cells[cIdx];
      let colspan = 1;
      let align = cols[cIdx]?.align || 'left';
      let borderLeft = cols[cIdx]?.borderLeft || false;
      let borderRight = cols[cIdx]?.borderRight || false;
      let colWidth = cols[cIdx]?.width;
      const isXCol = cols[cIdx]?.isX || false;

      // Detect \multicolumn{num}{spec}{content}
      const mcMatch = cellText.match(/\\multicolumn\{(\d+)\}\{([^}]+)\}\{([\s\S]*)\}/);
      if (mcMatch) {
        colspan = parseInt(mcMatch[1], 10) || 1;
        const mcSpec = mcMatch[2];
        if (mcSpec.includes('c')) align = 'center';
        else if (mcSpec.includes('r')) align = 'right';
        else if (mcSpec.includes('l')) align = 'left';
        borderLeft = mcSpec.startsWith('|');
        borderRight = mcSpec.endsWith('|');
        cellText = mcMatch[3];
      }

      // Detect \multirow{num}{width}{content}
      let rowspanAttr = '';
      const mrMatch = cellText.match(/\\multirow\{(\d+)\}(?:\{[^}]*\})?\{([\s\S]*)\}/);
      if (mrMatch) {
        const rspan = parseInt(mrMatch[1], 10) || 1;
        rowspanAttr = ` rowspan="${rspan}"`;
        cellText = mrMatch[2];
      }

      const styleParts: string[] = [];
      styleParts.push(`text-align: ${align};`);
      if (borderLeft) styleParts.push('border-left: 1px solid #cbd5e1;');
      if (borderRight) styleParts.push('border-right: 1px solid #cbd5e1;');
      if (colWidth) styleParts.push(`width: ${colWidth}; min-width: ${colWidth};`);
      if (isXCol) styleParts.push('word-wrap: break-word; overflow-wrap: break-word; white-space: normal;');

      const classParts: string[] = [];
      if (isXCol) classParts.push('col-is-x');

      const classAttr = classParts.length > 0 ? ` class="${classParts.join(' ')}"` : '';
      const styleAttr = styleParts.length > 0 ? ` style="${styleParts.join(' ')}"` : '';
      const tag = isHeaderRow ? 'th' : 'td';
      const parsedCell = parseInlineFormatting(cellText.trim());

      cellsHtml += `<${tag}${colspan > 1 ? ` colspan="${colspan}"` : ''}${rowspanAttr}${classAttr}${styleAttr}>${parsedCell}</${tag}>`;
    }

    const rowClass = (hasMidRule || hasTopRule || hasBottomRule) ? ' class="table-rule-row"' : '';
    const trHtml = `<tr${rowClass}>${cellsHtml}</tr>`;

    dataRowCount++;
    if (isHeaderRow && (hasMidRule || hasHline || (rIdx === 0 && rawRows.some(r => r.includes('\\midrule'))))) {
      theadHtml += trHtml;
      isHeaderRow = false;
    } else {
      tbodyHtml += trHtml;
    }
  }

  const tableClasses = ['latex-table'];
  if (isBooktabs) tableClasses.push('table-booktabs');
  if (isTabularx) tableClasses.push('table-tabularx');

  const containerStyle = tableWidthCss ? ` style="width: 100%; max-width: 100%;"` : '';
  const tableStyle = tableWidthCss ? ` style="width: ${tableWidthCss}; max-width: 100%;"` : '';

  return `
    <div class="table-container synctex-target" data-line="${tabLine}"${containerStyle} title="Click to jump to table in code">
      <table class="${tableClasses.join(' ')}"${tableStyle}>
        ${theadHtml ? `<thead>${theadHtml}</thead>` : ''}
        <tbody>${tbodyHtml}</tbody>
      </table>
    </div>
  `;
}

/**
 * Renders Table of Contents with dotted leader lines, section numbering, and SyncTeX click targets.
 */
export function generateTableOfContents(code: string, rawLines: string[]): string {
  const tocLine = findSourceLine('tableofcontent', rawLines, '\\tableofcontent');
  const lines = code.split('\n');
  const items: Array<{ title: string; level: number; line: number; num: string }> = [];

  let secNum = 0;
  let subNum = 0;
  let subSubNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const match = l.match(/\\(section|subsection|subsubsection)(\*?)\{([^}]+)\}/);
    if (match) {
      const type = match[1];
      const isStarred = match[2] === '*';
      const title = cleanLatexInline(match[3]).trim();
      let num = '';

      if (type === 'section') {
        if (!isStarred) {
          secNum++;
          subNum = 0;
          subSubNum = 0;
          num = `${secNum}.`;
        }
        items.push({ title, level: 1, line: i + 1, num });
      } else if (type === 'subsection') {
        if (!isStarred) {
          subNum++;
          subSubNum = 0;
          num = `${secNum}.${subNum}`;
        }
        items.push({ title, level: 2, line: i + 1, num });
      } else if (type === 'subsubsection') {
        if (!isStarred) {
          subSubNum++;
          num = `${secNum}.${subNum}.${subSubNum}`;
        }
        items.push({ title, level: 3, line: i + 1, num });
      }
    }
  }

  if (items.length === 0) {
    return `
      <div class="latex-toc synctex-target" data-line="${tocLine}" title="Table of Contents">
        <div class="latex-toc-title">Contents</div>
        <div style="font-size: 11.5px; color: #64748b; font-style: italic; padding: 6px 0;">(No sections defined)</div>
      </div>
    `;
  }

  const itemsHtml = items.map((it, idx) => {
    const pageNum = Math.max(1, Math.min(15, Math.floor(idx / 3) + 1));
    return `
      <div class="latex-toc-item latex-toc-level-${it.level} synctex-target" data-line="${it.line}" data-target-line="${it.line}" title="Click to jump to ${it.title} in code">
        ${it.num ? `<span class="latex-toc-num">${it.num}</span>` : ''}
        <span class="latex-toc-text">${it.title}</span>
        <span class="latex-toc-leader"></span>
        <span class="latex-toc-page">${pageNum}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="latex-toc synctex-target" data-line="${tocLine}" title="Table of Contents">
      <div class="latex-toc-title">Contents</div>
      <div class="latex-toc-list">
        ${itemsHtml}
      </div>
    </div>
  `;
}

/**
 * Renders List of Figures with dotted leaders
 */
export function generateListOfFigures(code: string, rawLines: string[]): string {
  const lofLine = findSourceLine('listoffigures', rawLines, '\\listoffigures');
  const figMatches = [...code.matchAll(/\\begin\{figure\*?\}(?:\[.*?\])?([\s\S]*?)\\end\{figure\*?\}/g)];
  let num = 1;
  const items: Array<{ title: string; line: number; num: number }> = [];

  for (const m of figMatches) {
    const capMatch = m[1].match(/\\caption(?:\[.*?\])?\{([^}]+)\}/);
    if (capMatch) {
      const line = findSourceLine(capMatch[1].slice(0, 20), rawLines, '\\caption');
      items.push({ title: cleanLatexInline(capMatch[1]).trim(), line, num: num++ });
    }
  }

  if (items.length === 0) return '';

  const itemsHtml = items.map(it => `
    <div class="latex-toc-item latex-toc-level-1 synctex-target" data-line="${it.line}" data-target-line="${it.line}">
      <span class="latex-toc-num">Fig. ${it.num}</span>
      <span class="latex-toc-text">${it.title}</span>
      <span class="latex-toc-leader"></span>
      <span class="latex-toc-page">${it.num}</span>
    </div>
  `).join('');

  return `
    <div class="latex-toc latex-lof synctex-target" data-line="${lofLine}">
      <div class="latex-toc-title">List of Figures</div>
      <div class="latex-toc-list">${itemsHtml}</div>
    </div>
  `;
}

/**
 * Renders List of Tables with dotted leaders
 */
export function generateListOfTables(code: string, rawLines: string[]): string {
  const lotLine = findSourceLine('listoftables', rawLines, '\\listoftables');
  const tabMatches = [...code.matchAll(/\\begin\{table\*?\}(?:\[.*?\])?([\s\S]*?)\\end\{table\*?\}/g)];
  let num = 1;
  const items: Array<{ title: string; line: number; num: number }> = [];

  for (const m of tabMatches) {
    const capMatch = m[1].match(/\\caption(?:\[.*?\])?\{([^}]+)\}/);
    if (capMatch) {
      const line = findSourceLine(capMatch[1].slice(0, 20), rawLines, '\\caption');
      items.push({ title: cleanLatexInline(capMatch[1]).trim(), line, num: num++ });
    }
  }

  if (items.length === 0) return '';

  const itemsHtml = items.map(it => `
    <div class="latex-toc-item latex-toc-level-1 synctex-target" data-line="${it.line}" data-target-line="${it.line}">
      <span class="latex-toc-num">Table ${it.num}</span>
      <span class="latex-toc-text">${it.title}</span>
      <span class="latex-toc-leader"></span>
      <span class="latex-toc-page">${it.num}</span>
    </div>
  `).join('');

  return `
    <div class="latex-toc latex-lot synctex-target" data-line="${lotLine}">
      <div class="latex-toc-title">List of Tables</div>
      <div class="latex-toc-list">${itemsHtml}</div>
    </div>
  `;
}

/**
 * Renders Algorithmic pseudocode lines with line numbers and indentation
 */
export function renderAlgorithmic(content: string): string {
  const lines = content.split('\n');
  const outputLines: string[] = [];
  let indent = 0;
  let lineNum = 1;

  for (const rawL of lines) {
    let l = rawL.trim();
    if (!l) continue;

    l = l.replace(/\\COMMENT\{([^}]+)\}/g, '<span class="latex-alg-comment">// $1</span>');

    if (l.startsWith('\\REQUIRE') || l.startsWith('\\INPUT')) {
      const text = l.replace(/^\\(?:REQUIRE|INPUT)\s*/, '');
      outputLines.push(`<div class="latex-alg-line latex-alg-io"><strong>Input:</strong> ${parseInlineFormatting(text)}</div>`);
      continue;
    }
    if (l.startsWith('\\ENSURE') || l.startsWith('\\OUTPUT')) {
      const text = l.replace(/^\\(?:ENSURE|OUTPUT)\s*/, '');
      outputLines.push(`<div class="latex-alg-line latex-alg-io"><strong>Output:</strong> ${parseInlineFormatting(text)}</div>`);
      continue;
    }

    if (/^\\(?:ENDIF|ENDFOR|ENDWHILE|UNTIL)\b/.test(l)) {
      indent = Math.max(0, indent - 1);
    }
    const isElse = /^\\(?:ELSE|ELSIF)\b/.test(l);
    const effectiveIndent = isElse ? Math.max(0, indent - 1) : indent;

    l = l
      .replace(/^\\STATE\s*/, '')
      .replace(/\\IF\{([^}]+)\}/g, '<strong>if</strong> $1 <strong>then</strong>')
      .replace(/\\ELSIF\{([^}]+)\}/g, '<strong>else if</strong> $1 <strong>then</strong>')
      .replace(/\\ELSE\b/g, '<strong>else</strong>')
      .replace(/\\ENDIF\b/g, '<strong>end if</strong>')
      .replace(/\\FOR\{([^}]+)\}/g, '<strong>for</strong> $1 <strong>do</strong>')
      .replace(/\\FORALL\{([^}]+)\}/g, '<strong>for all</strong> $1 <strong>do</strong>')
      .replace(/\\ENDFOR\b/g, '<strong>end for</strong>')
      .replace(/\\WHILE\{([^}]+)\}/g, '<strong>while</strong> $1 <strong>do</strong>')
      .replace(/\\ENDWHILE\b/g, '<strong>end while</strong>')
      .replace(/\\RETURN\b\s*/g, '<strong>return</strong> ')
      .replace(/\\REPEAT\b/g, '<strong>repeat</strong>')
      .replace(/\\UNTIL\{([^}]+)\}/g, '<strong>until</strong> $1');

    if (/^\\(?:IF|FOR|FORALL|WHILE|REPEAT)\b/.test(rawL.trim())) {
      indent++;
    }

    outputLines.push(`
      <div class="latex-alg-line" style="padding-left: ${effectiveIndent * 18}px;">
        <span class="latex-alg-lineno">${lineNum}:</span>
        <span class="latex-alg-text">${parseInlineFormatting(l)}</span>
      </div>
    `);
    lineNum++;
  }

  return `<div class="latex-algorithmic">${outputLines.join('')}</div>`;
}

/**
 * High-speed LaTeX Diagnostic Linter
 * Scans code for syntax errors, unclosed environments, unescaped characters,
 * and generates human-readable diagnostics with 1-click executable quick-fixes.
 */
export function diagnoseLatex(code: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = code.split('\n');

  const envStack: Array<{ name: string; line: number }> = [];
  const validPreamblePackages = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const pkgMatch = lines[i].match(/\\usepackage(?:\[.*?\])?\{([^}]+)\}/);
    if (pkgMatch) {
      pkgMatch[1].split(',').forEach(p => validPreamblePackages.add(p.trim()));
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i];

    const commentIdx = rawLine.indexOf('%');
    const hasUnescapedPercent = commentIdx > 0 && rawLine[commentIdx - 1] !== '\\';
    const effectiveLine = hasUnescapedPercent ? rawLine.substring(0, commentIdx) : rawLine;

    // Detect typo \tablular or \begin{tablular}
    if (effectiveLine.includes('tablular')) {
      diagnostics.push({
        id: `typo-tablular-${lineNum}`,
        line: lineNum,
        column: effectiveLine.indexOf('tablular') + 1,
        severity: 'warning',
        message: `Typo in environment name: 'tablular' should be 'tabular'.`,
        rule: 'syntax/typo',
        suggestedFix: {
          title: `Fix typo to 'tabular'`,
          description: `Replaces 'tablular' with 'tabular'.`,
          replacement: rawLine.replace(/tablular/g, 'tabular'),
          startLine: lineNum,
          endLine: lineNum,
        }
      });
    }

    // Detect typo \tableofcontent (missing 's')
    if (/\\tableofcontent(?![sA-Za-z])/.test(effectiveLine)) {
      diagnostics.push({
        id: `typo-tableofcontent-${lineNum}`,
        line: lineNum,
        column: effectiveLine.indexOf('\\tableofcontent') + 1,
        severity: 'info',
        message: `Command '\\tableofcontent' is usually '\\tableofcontents' (with an 's'). Teeex supports both!`,
        rule: 'syntax/typo',
        suggestedFix: {
          title: `Change to '\\tableofcontents'`,
          description: `Appends 's' to '\\tableofcontent'.`,
          replacement: rawLine.replace(/\\tableofcontent(?![sA-Za-z])/, '\\tableofcontents'),
          startLine: lineNum,
          endLine: lineNum,
        }
      });
    }

    // 1. Detect \begin{...} and \end{...}
    const beginMatches = [...effectiveLine.matchAll(/\\begin\{([a-zA-Z0-9*]+)\}/g)];
    for (const match of beginMatches) {
      let envName = match[1];
      if (envName === 'tablular') envName = 'tabular';
      envStack.push({ name: envName, line: lineNum });
    }

    const endMatches = [...effectiveLine.matchAll(/\\end\{([a-zA-Z0-9*]+)\}/g)];
    for (const match of endMatches) {
      let closingName = match[1];
      if (closingName === 'tablular') closingName = 'tabular';

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
            replacement: rawLine.replace(`\\end{${match[1]}}`, ''),
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
              replacement: rawLine.replace(`\\end{${match[1]}}`, `\\end{${last.name}}`),
              startLine: lineNum,
              endLine: lineNum,
            }
          });
          envStack.pop();
        }
      }
    }

    // 2. Detect unescaped % when preceded by a number
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

    // 4. Missing package for graphicx
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

    // 5. Empty \cite{} or \ref{}
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

  // Unclosed environments
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

  const docClassMatch = expandedCode.match(/\\documentclass(?:\[(.*?)\])?\{([a-zA-Z0-9]+)\}/);
  if (docClassMatch) {
    documentClass = docClassMatch[2];
    if (docClassMatch[1] && docClassMatch[1].includes('twocolumn')) {
      isTwoColumn = true;
    }
  }

  const titleMatch = code.match(/\\title\{([\s\S]*?)\}/);
  if (titleMatch) {
    title = cleanLatexInline(titleMatch[1]);
  }

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

  const authorMatch = code.match(/\\author\{([\s\S]*?)\}/);
  if (authorMatch) {
    const rawAuthors = authorMatch[1].split(/\\and|\s*,\s*/);
    for (const a of rawAuthors) {
      const cleaned = cleanLatexInline(a).trim();
      if (cleaned) authors.push(cleaned);
    }
  }

  const dateMatch = code.match(/\\date\{([\s\S]*?)\}/);
  if (dateMatch) {
    date = cleanLatexInline(dateMatch[1]);
  }

  const abstractMatch = code.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);
  if (abstractMatch) {
    abstract = abstractMatch[1].trim();
  }

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

    const eqMatch = line.match(/\\begin\{(?:equation|align|gather|multline)\*?\}([\s\S]*?)\\end\{(?:equation|align|gather|multline)\*?\}/) || line.match(/\\\[([\s\S]*?)\\\]/);
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

  if (hintPrefix) {
    const idx = rawLines.findIndex(l => l.includes(hintPrefix) && l.toLowerCase().includes(clean.slice(0, 15).toLowerCase()));
    if (idx !== -1) return idx + 1;
  }

  const snippet = clean.slice(0, 25);
  const idx = rawLines.findIndex(l => l.includes(snippet));
  if (idx !== -1) return idx + 1;

  const lowerSnippet = snippet.toLowerCase();
  const lowerIdx = rawLines.findIndex(l => l.toLowerCase().includes(lowerSnippet));
  if (lowerIdx !== -1) return lowerIdx + 1;

  const words = clean.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
  if (words.length > 0) {
    const wordIdx = rawLines.findIndex(l => words.every(w => l.toLowerCase().includes(w.toLowerCase())));
    if (wordIdx !== -1) return wordIdx + 1;
  }

  if (hintPrefix) {
    const prefixIdx = rawLines.findIndex(l => l.includes(hintPrefix));
    if (prefixIdx !== -1) return prefixIdx + 1;
  }

  return 1;
}

/**
 * Render High-Fidelity Academic Paper HTML with KaTeX Math, Figures, Tables, Minipages, TOC, and SyncTeX line anchors
 */
export function renderLatexToHtml(code: string, files?: ProjectFile[]): string {
  const rawLines = code.split('\n');

  // Strip comments (preserving escaped \%)
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

  // Support \input{...} and \include{...}
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

  // --------------------------------------------------------------------------
  // STAGE 1: TOKEN STASHING (Verbatim & Display Math Preservers)
  // Ensures code snippets containing $, &, _, %, \ are NEVER altered
  // --------------------------------------------------------------------------
  const stashedTokens = new Map<string, string>();
  let tokenCounter = 0;

  function stashToken(html: string): string {
    const token = `%%TEEEX_STASH_TOKEN_${++tokenCounter}%%`;
    stashedTokens.set(token, html);
    return token;
  }

  // 1A. Verbatim & Code Blocks
  bodyText = bodyText.replace(/\\begin\{(?:verbatim|verbatim\*)\}([\s\S]*?)\\end\{(?:verbatim|verbatim\*)\}/g, (_, verbContent) => {
    const vLine = findSourceLine(verbContent.slice(0, 20), rawLines, '\\begin{verbatim');
    const html = `<div class="latex-verbatim-container synctex-target" data-line="${vLine}"><pre class="latex-verbatim"><code>${escapeHtml(verbContent.replace(/^\n/, ''))}</code></pre></div>`;
    return stashToken(html);
  });

  bodyText = bodyText.replace(/\\begin\{(?:lstlisting|minted)\}(?:\[.*?\])?(?:\{[^}]*\})?([\s\S]*?)\\end\{(?:lstlisting|minted)\}/g, (fullMatch, codeContent) => {
    const lLine = findSourceLine(codeContent.slice(0, 20), rawLines, '\\begin{lstlisting');
    const capMatch = fullMatch.match(/caption=\{?([^,\]}]+)\}?/);
    const caption = capMatch ? capMatch[1] : '';
    const html = `
      <div class="latex-verbatim-container synctex-target" data-line="${lLine}">
        ${caption ? `<div class="latex-lst-caption"><strong>Listing:</strong> ${escapeHtml(caption)}</div>` : ''}
        <pre class="latex-verbatim"><code>${escapeHtml(codeContent.replace(/^\n/, ''))}</code></pre>
      </div>
    `;
    return stashToken(html);
  });

  bodyText = bodyText.replace(/\\(?:verb|lstinline)([|#+/!@])(.*?)\1/g, (_, _delim, inlineCode) => {
    return stashToken(`<code class="latex-code">${escapeHtml(inlineCode)}</code>`);
  });

  // 1B. Display Math Environments (align, gather, multline, equation, \[, $$)
  let equationNumber = 0;
  bodyText = bodyText.replace(/\\begin\{(equation|equation\*|align|align\*|gather|gather\*|multline|multline\*|flalign|flalign\*|alignat|alignat\*|split)\}([\s\S]*?)\\end\{\1\}/g, (_, envName, math) => {
    const isStarred = envName.endsWith('*');
    const eqLine = findSourceLine(math.trim().slice(0, 20), rawLines, `\\begin{${envName}`);

    // Transform multi-line amsmath environments to KaTeX-compatible aligned/gathered
    let transformedMath = math.trim();
    if (envName.startsWith('align')) {
      transformedMath = `\\begin{aligned}${transformedMath}\\end{aligned}`;
    } else if (envName.startsWith('gather')) {
      transformedMath = `\\begin{gathered}${transformedMath}\\end{gathered}`;
    } else if (envName.startsWith('multline')) {
      transformedMath = `\\begin{aligned}${transformedMath}\\end{aligned}`;
    }

    const labelMatch = transformedMath.match(/\\label\{([^}]+)\}/);
    const labelId = labelMatch ? labelMatch[1] : '';
    transformedMath = transformedMath.replace(/\\label\{[^}]+\}/g, '');

    const rendered = renderKatexCached(transformedMath, true);
    let numHtml = '';
    if (!isStarred && envName !== 'split') {
      equationNumber++;
      numHtml = `<span class="latex-eq-number">(${equationNumber})</span>`;
    }

    const html = `<div class="latex-math-display synctex-target" data-line="${eqLine}" ${labelId ? `id="${labelId}"` : ''} title="Click to jump to line ${eqLine} in code"><div class="latex-math-content">${rendered}</div>${numHtml}</div>`;
    return stashToken(html);
  });

  bodyText = bodyText.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    const eqLine = findSourceLine(math.trim().slice(0, 20), rawLines, '\\[');
    const rendered = renderKatexCached(math.trim(), true);
    const html = `<div class="latex-math-display synctex-target" data-line="${eqLine}" title="Click to jump to line ${eqLine} in code"><div class="latex-math-content">${rendered}</div></div>`;
    return stashToken(html);
  });

  bodyText = bodyText.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    const eqLine = findSourceLine(math.trim().slice(0, 20), rawLines, '$$');
    const rendered = renderKatexCached(math.trim(), true);
    const html = `<div class="latex-math-display synctex-target" data-line="${eqLine}" title="Click to jump to line ${eqLine} in code"><div class="latex-math-content">${rendered}</div></div>`;
    return stashToken(html);
  });

  // 1C. Inline Math ($ ... $) - Stashed to protect '&' and '_' from table/tag processors
  bodyText = bodyText.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (_, math) => {
    const rendered = renderKatexCached(math.trim(), false);
    return stashToken(`<span class="latex-math-inline">${rendered}</span>`);
  });

  // --------------------------------------------------------------------------
  // STAGE 2: DOCUMENT STRUCTURE & TITLEPAGE
  // --------------------------------------------------------------------------

  // Titlepage
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

  // Page breaks
  bodyText = bodyText.replace(/\\(?:newpage|pagebreak|clearpage|cleardoublepage)/g, '\n\n<div class="latex-page-break"></div>\n\n');

  // TikZ graphics
  bodyText = bodyText.replace(/\\begin\{tikzpicture\}(?:\[(.*?)\])?([\s\S]*?)\\end\{tikzpicture\}/g, (_, opts, tikzContent) => {
    const fullCode = (opts ? `[${opts}] ` : '') + (tikzContent || '');
    const tikzLine = findSourceLine('tikzpicture', rawLines, '\\begin{tikzpicture');
    const svg = renderTikzToSvg(fullCode);
    return `<div class="latex-figure-container synctex-target" data-line="${tikzLine}" title="Click to jump to line ${tikzLine} in code">${svg}</div>`;
  });

  // Figures (\begin{figure})
  let figureCounter = 0;
  bodyText = bodyText.replace(/\\begin\{figure\*?\}(?:\[.*?\])?([\s\S]*?)\\end\{figure\*?\}/g, (_, figContent) => {
    figureCounter++;
    const imgMatch = figContent.match(/\\includegraphics(?:\[.*?\])?\{([^}]+)\}/);
    const captionMatch = figContent.match(/\\caption(?:\[.*?\])?\{([^}]+)\}/);
    const labelMatch = figContent.match(/\\label\{([^}]+)\}/);

    const filename = imgMatch ? imgMatch[1].trim() : 'figure.png';
    const caption = captionMatch ? parseInlineFormatting(captionMatch[1]) : '';
    const label = labelMatch ? labelMatch[1] : '';
    const figLine = findSourceLine(filename, rawLines, '\\includegraphics');

    const matchedFile = resolveProjectAsset(filename, files);
    const imgSrc = matchedFile?.dataUrl || '';

    return `
      <div class="latex-figure-container synctex-target" data-line="${figLine}" ${label ? `id="${label}"` : ''} title="Click to jump to line ${figLine} in code">
        ${imgSrc ? `
          <img src="${imgSrc}" alt="${caption || filename}" class="latex-figure-img" />
        ` : `
          <div class="latex-figure-placeholder">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
            <div style="font-size: 11px; font-weight: 600; color: #475569; margin-top: 4px;">Figure ${figureCounter}: ${escapeHtml(filename)}</div>
          </div>
        `}
        ${caption ? `<div class="latex-figure-caption"><strong>Fig. ${figureCounter}.</strong> ${caption}</div>` : ''}
      </div>
    `;
  });

  bodyText = bodyText.replace(/\\includegraphics(?:\[.*?\])?\{([^}]+)\}/g, (_, filename) => {
    const name = filename.trim();
    const figLine = findSourceLine(name, rawLines, '\\includegraphics');
    const matchedFile = resolveProjectAsset(name, files);
    if (matchedFile?.dataUrl) {
      return `<div class="latex-figure-container synctex-target" data-line="${figLine}" title="Click to jump to line ${figLine} in code"><img src="${matchedFile.dataUrl}" alt="${name}" class="latex-figure-img" /></div>`;
    }
    return `<div class="latex-figure-container synctex-target" data-line="${figLine}" title="Click to jump to line ${figLine} in code"><div class="latex-figure-placeholder">[Figure: ${escapeHtml(name)}]</div></div>`;
  });

  // --------------------------------------------------------------------------
  // STAGE 3: TABLES & TABULAR ENVIRONMENTS
  // Handles \begin{table}, \begin{tabular}, booktabs, and user typo \tablular
  // --------------------------------------------------------------------------
  let tableCounter = 0;

  // Floating Table Environment: \begin{table} ... \begin{tabularx} or \begin{tabular} ... \caption ... \end{table}
  bodyText = bodyText.replace(/\\begin\{table\*?\}(?:\[.*?\])?([\s\S]*?)\\end\{table\*?\}/g, (_, tableBody) => {
    tableCounter++;
    const tabLine = findSourceLine('table', rawLines, '\\begin{table');
    const capMatch = tableBody.match(/\\caption(?:\[.*?\])?\{([^}]+)\}/);
    const labelMatch = tableBody.match(/\\label\{([^}]+)\}/);
    const caption = capMatch ? parseInlineFormatting(capMatch[1].trim()) : '';
    const label = labelMatch ? labelMatch[1].trim() : '';

    let tabularHtml = '';

    // 1. Check for tabularx, tabulary, tabular*
    const tabularxMatch = tableBody.match(/\\begin\{(tabularx|tabulary|tabular\*)\*?\}(?:\[[^\]]*\])?\{([^}]+)\}(?:(?:\[[^\]]*\])?\{([^}]+)\})?([\s\S]*?)\\end\{\1\*?\}/);
    if (tabularxMatch) {
      const width = tabularxMatch[3] ? tabularxMatch[2] : '100%';
      const colSpec = tabularxMatch[3] ? tabularxMatch[3] : tabularxMatch[2];
      const tabContent = tabularxMatch[4];
      tabularHtml = parseTabularEnvironment(tabContent, colSpec, rawLines, tabLine, width);
    } else {
      // 2. Check for standard tabular, tablular
      const tabularMatch = tableBody.match(/\\begin\{(tabular|tablular)\*?\}(?:\[[^\]]*\])?\{([^}]+)\}([\s\S]*?)\\end\{(?:tabular|tablular)\*?\}/);
      if (tabularMatch) {
        const colSpec = tabularMatch[2];
        const tabContent = tabularMatch[3];
        tabularHtml = parseTabularEnvironment(tabContent, colSpec, rawLines, tabLine);
      } else {
        tabularHtml = parseInlineFormatting(tableBody.replace(/\\caption(?:\[.*?\])?\{[^}]+\}/g, '').replace(/\\label\{[^}]+\}/g, '').replace(/\\centering/g, ''));
      }
    }

    const captionHtml = caption ? `
      <div class="latex-table-caption">
        <strong>Table ${tableCounter}:</strong> ${caption}
      </div>
    ` : '';

    return `
      <div class="latex-floating-table synctex-target" data-line="${tabLine}" ${label ? `id="${label}"` : ''} title="Click to jump to Table ${tableCounter} in code">
        ${captionHtml}
        ${tabularHtml}
      </div>
    `;
  });

  // Standalone tabularx, tabulary, tabular* outside of \begin{table}
  bodyText = bodyText.replace(/\\begin\{(tabularx|tabulary|tabular\*)\*?\}(?:\[[^\]]*\])?\{([^}]+)\}(?:(?:\[[^\]]*\])?\{([^}]+)\})?([\s\S]*?)\\end\{\1\*?\}/g, (_, envName, arg1, arg2, content) => {
    const tabLine = findSourceLine(envName, rawLines, `\\begin{${envName}`);
    const width = arg2 ? arg1 : '100%';
    const colSpec = arg2 ? arg2 : arg1;
    return parseTabularEnvironment(content, colSpec, rawLines, tabLine, width);
  });

  // Standalone \begin{tabular} or \begin{tablular} outside of \begin{table}
  bodyText = bodyText.replace(/\\begin\{(tabular|tablular)\*?\}(?:\[[^\]]*\])?\{([^}]+)\}([\s\S]*?)\\end\{(?:tabular|tablular)\*?\}/g, (_, envName, colSpec, content) => {
    const tabLine = findSourceLine(envName, rawLines, `\\begin{${envName}`);
    return parseTabularEnvironment(content, colSpec, rawLines, tabLine);
  });

  // --------------------------------------------------------------------------
  // STAGE 3B: VERTICAL SPACING & FILLERS
  // Handles \vspace, \vspace*, \bigskip, \medskip, \smallskip, \vfill, \vskip
  // --------------------------------------------------------------------------
  bodyText = bodyText.replace(/\\vspace\*?\{([^}]+)\}/g, (_, dim) => {
    const isNeg = dim.trim().startsWith('-');
    const cssDim = parseLatexDimensionToCss(dim.trim().replace(/^-/, ''));
    if (isNeg) {
      return `\n\n<div class="latex-vspace latex-vspace-neg" style="margin-top: -${cssDim}; height: 0; display: block;"></div>\n\n`;
    }
    return `\n\n<div class="latex-vspace" style="height: ${cssDim}; min-height: ${cssDim}; display: block;"></div>\n\n`;
  });

  bodyText = bodyText.replace(/\\bigskip\b/g, '\n\n<div class="latex-vspace latex-bigskip" style="height: 18px; display: block;"></div>\n\n');
  bodyText = bodyText.replace(/\\medskip\b/g, '\n\n<div class="latex-vspace latex-medskip" style="height: 10px; display: block;"></div>\n\n');
  bodyText = bodyText.replace(/\\smallskip\b/g, '\n\n<div class="latex-vspace latex-smallskip" style="height: 5px; display: block;"></div>\n\n');
  bodyText = bodyText.replace(/\\vfill\b/g, '\n\n<div class="latex-vfill" style="flex: 1; min-height: 20px; display: block;"></div>\n\n');
  bodyText = bodyText.replace(/\\vskip\s*([0-9.-]+(?:cm|mm|in|pt|em|ex|px))\b/g, (_, dim) => {
    const isNeg = dim.trim().startsWith('-');
    const cssDim = parseLatexDimensionToCss(dim.trim().replace(/^-/, ''));
    if (isNeg) {
      return `\n\n<div class="latex-vspace latex-vspace-neg" style="margin-top: -${cssDim}; height: 0; display: block;"></div>\n\n`;
    }
    return `\n\n<div class="latex-vspace" style="height: ${cssDim}; min-height: ${cssDim}; display: block;"></div>\n\n`;
  });

  // --------------------------------------------------------------------------
  // STAGE 4: MINIPAGE & SIDE-BY-SIDE FLEX CONTAINER
  // --------------------------------------------------------------------------
  bodyText = bodyText.replace(/\\begin\{minipage\}(?:\[[tcb]\])?(?:\[[^\]]*\])?(?:\[[tcb]\])?\{([^}]+)\}([\s\S]*?)\\end\{minipage\}/g, (_, widthDim, innerContent) => {
    const mpLine = findSourceLine(innerContent.trim().slice(0, 20), rawLines, '\\begin{minipage');
    const cssWidth = parseLatexDimensionToCss(widthDim);
    const parsedInner = parseInlineFormatting(innerContent.trim());
    return `<!--MP_START--><div class="latex-minipage synctex-target" data-line="${mpLine}" style="width: ${cssWidth}; flex: 0 0 ${cssWidth}; max-width: ${cssWidth};" title="Click to jump to minipage in code">${parsedInner}</div><!--MP_END-->`;
  });

  // Group adjacent minipages separated by \hfill, \hspace, or whitespace into a flex row
  bodyText = bodyText.replace(/(?:<!--MP_START-->[\s\S]*?<!--MP_END-->\s*(?:\\hfill|\\hspace\*?\{[^}]+\})?\s*){2,}/g, (match) => {
    const cleaned = match
      .replace(/<!--MP_START-->/g, '')
      .replace(/<!--MP_END-->/g, '')
      .replace(/\\hfill/g, '')
      .replace(/\\hspace\*?\{[^}]+\}/g, '');
    return `\n\n<div class="latex-minipage-row">${cleaned}</div>\n\n`;
  });
  bodyText = bodyText.replace(/<!--MP_START-->([\s\S]*?)<!--MP_END-->/g, '\n\n<div class="latex-minipage-row">$1</div>\n\n');

  // --------------------------------------------------------------------------
  // STAGE 5: TABLE OF CONTENTS & LIST OF FIGURES/TABLES
  // Supports \tableofcontents, \tableofcontent, \listoffigures, \listoftables
  // --------------------------------------------------------------------------
  bodyText = bodyText.replace(/\\tableofcontents?\b/g, () => {
    return `\n\n${generateTableOfContents(cleanCode, rawLines)}\n\n`;
  });

  bodyText = bodyText.replace(/\\listoffigures\b/g, () => {
    return `\n\n${generateListOfFigures(cleanCode, rawLines)}\n\n`;
  });

  bodyText = bodyText.replace(/\\listoftables\b/g, () => {
    return `\n\n${generateListOfTables(cleanCode, rawLines)}\n\n`;
  });

  // --------------------------------------------------------------------------
  // STAGE 6: THEOREMS, LEMMAS, PROOFS, DEFINITIONS, EXAMPLES, REMARKS
  // --------------------------------------------------------------------------
  const THEOREM_ENVS: Array<{ name: string; label: string; italic: boolean; color: string }> = [
    { name: 'theorem', label: 'Theorem', italic: true, color: '#3b82f6' },
    { name: 'lemma', label: 'Lemma', italic: true, color: '#0284c7' },
    { name: 'corollary', label: 'Corollary', italic: true, color: '#6366f1' },
    { name: 'proposition', label: 'Proposition', italic: true, color: '#8b5cf6' },
    { name: 'definition', label: 'Definition', italic: false, color: '#10b981' },
    { name: 'example', label: 'Example', italic: false, color: '#f59e0b' },
    { name: 'remark', label: 'Remark', italic: false, color: '#64748b' },
    { name: 'conjecture', label: 'Conjecture', italic: true, color: '#ec4899' },
    { name: 'axiom', label: 'Axiom', italic: true, color: '#0ea5e9' },
    { name: 'claim', label: 'Claim', italic: true, color: '#14b8a6' },
  ];

  for (const env of THEOREM_ENVS) {
    const reg = new RegExp(`\\\\begin\\{${env.name}\\*?\\}(?:\\[([^\\]]*)\\])?([\\s\\S]*?)\\\\end\\{${env.name}\\*?\\}`, 'gi');
    let envCounter = 0;
    bodyText = bodyText.replace(reg, (_, optTitle, content) => {
      envCounter++;
      const thmLine = findSourceLine(content.trim().slice(0, 20), rawLines, `\\begin{${env.name}`);
      const labelMatch = content.match(/\\label\{([^}]+)\}/);
      const labelId = labelMatch ? labelMatch[1] : '';
      const cleanContent = content.replace(/\\label\{[^}]+\}/g, '').trim();

      return `
        <div class="latex-theorem latex-env-${env.name} synctex-target" data-line="${thmLine}" ${labelId ? `id="${labelId}"` : ''} style="border-left-color: ${env.color};" title="Click to jump to ${env.label} in code">
          <div class="latex-theorem-header">
            <strong>${env.label} ${envCounter}</strong>${optTitle ? ` <em>(${optTitle.trim()})</em>` : ''}.
          </div>
          <div class="latex-theorem-body"${env.italic ? ' style="font-style: italic;"' : ''}>
            ${parseInlineFormatting(cleanContent)}
          </div>
        </div>
      `;
    });
  }

  // Proof environment with Q.E.D. tombstone
  bodyText = bodyText.replace(/\\begin\{proof\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{proof\}/g, (_, optTitle, content) => {
    const pLine = findSourceLine('proof', rawLines, '\\begin{proof');
    const titleText = optTitle ? ` (${optTitle.trim()})` : '';
    return `
      <div class="latex-proof synctex-target" data-line="${pLine}" title="Click to jump to Proof in code">
        <div class="latex-proof-header"><em>Proof${titleText}.</em></div>
        <div class="latex-proof-body">
          ${parseInlineFormatting(content.trim())}
          <div class="latex-qed" style="text-align: right; margin-top: 4px;"><span class="latex-qed-tombstone">&#9632;</span></div>
        </div>
      </div>
    `;
  });

  // --------------------------------------------------------------------------
  // STAGE 7: ALGORITHMS & PSEUDOCODE
  // --------------------------------------------------------------------------
  let algorithmCounter = 0;
  bodyText = bodyText.replace(/\\begin\{algorithm\*?\}(?:\[.*?\])?([\s\S]*?)\\end\{algorithm\*?\}/g, (_, algBody) => {
    algorithmCounter++;
    const aLine = findSourceLine('algorithm', rawLines, '\\begin{algorithm');
    const capMatch = algBody.match(/\\caption(?:\[.*?\])?\{([^}]+)\}/);
    const labelMatch = algBody.match(/\\label\{([^}]+)\}/);
    const caption = capMatch ? parseInlineFormatting(capMatch[1].trim()) : '';
    const labelId = labelMatch ? labelMatch[1].trim() : '';

    let algorithmicHtml = '';
    const micMatch = algBody.match(/\\begin\{algorithmic\}(?:\[\d+\])?([\s\S]*?)\\end\{algorithmic\}/);
    if (micMatch) {
      algorithmicHtml = renderAlgorithmic(micMatch[1]);
    } else {
      algorithmicHtml = parseInlineFormatting(algBody.replace(/\\caption(?:\[.*?\])?\{[^}]+\}/g, '').replace(/\\label\{[^}]+\}/g, ''));
    }

    return `
      <div class="latex-algorithm synctex-target" data-line="${aLine}" ${labelId ? `id="${labelId}"` : ''} title="Click to jump to Algorithm ${algorithmCounter} in code">
        ${caption ? `<div class="latex-alg-header"><strong>Algorithm ${algorithmCounter}:</strong> ${caption}</div>` : ''}
        ${algorithmicHtml}
      </div>
    `;
  });

  // Standalone algorithmic
  bodyText = bodyText.replace(/\\begin\{algorithmic\}(?:\[\d+\])?([\s\S]*?)\\end\{algorithmic\}/g, (_, content) => {
    return renderAlgorithmic(content);
  });

  // --------------------------------------------------------------------------
  // STAGE 8: LISTS, QUOTES, BOXES, CALLOUTS
  // --------------------------------------------------------------------------

  // Description lists (\begin{description})
  bodyText = bodyText.replace(/\\begin\{description\}([\s\S]*?)\\end\{description\}/g, (_, content) => {
    const descLine = findSourceLine('description', rawLines, '\\begin{description');
    const itemMatches = [...content.matchAll(/\\item\s*(?:\[([^\]]*)\])?\s*([\s\S]*?)(?=\\item|$)/g)];
    let listHtml = '';
    for (const match of itemMatches) {
      const term = match[1] ? parseInlineFormatting(match[1]) : '';
      const desc = match[2] ? parseInlineFormatting(match[2].trim()) : '';
      listHtml += `<dt class="latex-desc-term">${term}</dt><dd class="latex-desc-def">${desc}</dd>`;
    }
    return `\n\n<dl class="latex-desc-list synctex-target" data-line="${descLine}" title="Click to jump to list in code">${listHtml}</dl>\n\n`;
  });

  // Itemize (unordered list)
  bodyText = bodyText.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, content) => {
    const listLine = findSourceLine('itemize', rawLines, '\\begin{itemize');
    const items = content.split('\\item').slice(1);
    return `\n\n<ul class="latex-list synctex-target" data-line="${listLine}" title="Click to jump to list in code">` + items.map((it: string) => {
      const itLine = findSourceLine(it.trim().slice(0, 20), rawLines, '\\item');
      return `<li class="synctex-target" data-line="${itLine}" title="Click to jump to item in code">${parseInlineFormatting(it.trim())}</li>`;
    }).join('') + '</ul>\n\n';
  });

  // Enumerate (ordered list, with custom [marker] support)
  bodyText = bodyText.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, content) => {
    const listLine = findSourceLine('enumerate', rawLines, '\\begin{enumerate');
    const itemMatches = [...content.matchAll(/\\item\s*(?:\[([^\]]*)\])?\s*([\s\S]*?)(?=\\item|$)/g)];
    const hasCustomMarkers = itemMatches.some(m => m[1]);

    if (hasCustomMarkers) {
      const itemsHtml = itemMatches.map(m => {
        const marker = m[1] || '•';
        const text = parseInlineFormatting(m[2].trim());
        const itLine = findSourceLine(m[2].trim().slice(0, 20), rawLines, '\\item');
        return `<li class="synctex-target latex-custom-item" data-line="${itLine}"><span class="latex-item-marker">${marker}</span> ${text}</li>`;
      }).join('');
      return `\n\n<ul class="latex-list latex-custom-list synctex-target" data-line="${listLine}">${itemsHtml}</ul>\n\n`;
    }

    const items = content.split('\\item').slice(1);
    return `\n\n<ol class="latex-list synctex-target" data-line="${listLine}" title="Click to jump to list in code">` + items.map((it: string) => {
      const itLine = findSourceLine(it.trim().slice(0, 20), rawLines, '\\item');
      return `<li class="synctex-target" data-line="${itLine}" title="Click to jump to item in code">${parseInlineFormatting(it.trim())}</li>`;
    }).join('') + '</ol>\n\n';
  });

  // tcolorbox / boxed / framed callouts
  bodyText = bodyText.replace(/\\begin\{tcolorbox\}(?:\[(.*?)\])?([\s\S]*?)\\end\{tcolorbox\}/g, (_, opts, content) => {
    const boxLine = findSourceLine('tcolorbox', rawLines, '\\begin{tcolorbox');
    const titleMatch = (opts || '').match(/title=\{?([^,\]}]+)\}?/);
    const title = titleMatch ? parseInlineFormatting(titleMatch[1].trim()) : '';
    const body = parseInlineFormatting(content.trim());
    return `
      <div class="latex-tcolorbox synctex-target" data-line="${boxLine}">
        ${title ? `<div class="latex-tcolorbox-title">${title}</div>` : ''}
        <div class="latex-tcolorbox-content">${body}</div>
      </div>
    `;
  });

  bodyText = bodyText.replace(/\\begin\{(?:framed|boxed|mdframed)\}([\s\S]*?)\\end\{(?:framed|boxed|mdframed)\}/g, (_, content) => {
    const fLine = findSourceLine('framed', rawLines, '\\begin{framed');
    return `<div class="latex-tcolorbox synctex-target" data-line="${fLine}"><div class="latex-tcolorbox-content">${parseInlineFormatting(content.trim())}</div></div>`;
  });

  // Quotes and verse
  bodyText = bodyText.replace(/\\begin\{(?:quote|quotation)\}([\s\S]*?)\\end\{(?:quote|quotation)\}/g, (_, content) => {
    const qLine = findSourceLine('quote', rawLines, '\\begin{quote');
    return `<blockquote class="latex-quote synctex-target" data-line="${qLine}">${parseInlineFormatting(content.trim())}</blockquote>`;
  });

  bodyText = bodyText.replace(/\\begin\{verse\}([\s\S]*?)\\end\{verse\}/g, (_, content) => {
    return `<div class="latex-verse">${parseInlineFormatting(content.trim().replace(/\\\\/g, '<br/>'))}</div>`;
  });

  // Alignments: center, flushleft, flushright
  bodyText = bodyText.replace(/\\begin\{center\}([\s\S]*?)\\end\{center\}/g, (_, content) => {
    return `<div class="latex-center" style="text-align: center; margin: 10px 0;">${parseInlineFormatting(content.trim())}</div>`;
  });
  bodyText = bodyText.replace(/\\begin\{flushleft\}([\s\S]*?)\\end\{flushleft\}/g, (_, content) => {
    return `<div class="latex-flushleft" style="text-align: left; margin: 10px 0;">${parseInlineFormatting(content.trim())}</div>`;
  });
  bodyText = bodyText.replace(/\\begin\{flushright\}([\s\S]*?)\\end\{flushright\}/g, (_, content) => {
    return `<div class="latex-flushright" style="text-align: right; margin: 10px 0;">${parseInlineFormatting(content.trim())}</div>`;
  });

  // Abstract
  bodyText = bodyText.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, (_, abs) => {
    const absLine = findSourceLine('\\begin{abstract}', rawLines);
    return `\n\n<div class="latex-abstract synctex-target" data-line="${absLine}" title="Click to jump to line ${absLine} in code"><div class="latex-abstract-title">ABSTRACT</div><p class="synctex-target" data-line="${absLine}">${parseInlineFormatting(abs.trim())}</p></div>\n\n`;
  });

  // Bibliography (\begin{thebibliography})
  bodyText = bodyText.replace(/\\begin\{thebibliography\}(?:\{[^}]*\})?([\s\S]*?)\\end\{thebibliography\}/g, (_, content) => {
    const bibLine = findSourceLine('thebibliography', rawLines, '\\begin{thebibliography');
    const items = [...content.matchAll(/\\bibitem(?:\[([^\]]*)\])?\{([^}]+)\}\s*([\s\S]*?)(?=\\bibitem|$)/g)];
    let listHtml = '';
    let count = 1;
    for (const m of items) {
      const key = m[2];
      const marker = m[1] || `${count}`;
      const text = parseInlineFormatting(m[3].trim());
      listHtml += `
        <li class="latex-bib-item synctex-target" id="bib-${key}" data-line="${bibLine}">
          <span class="latex-bib-marker">[${marker}]</span>
          <span class="latex-bib-text">${text}</span>
        </li>
      `;
      count++;
    }
    return `
      <div class="latex-bibliography synctex-target" data-line="${bibLine}">
        <h3 class="latex-section">References</h3>
        <ol class="latex-bib-list">${listHtml}</ol>
      </div>
    `;
  });

  // --------------------------------------------------------------------------
  // STAGE 9: HEADINGS WITH SYNCTEX JUMP TARGETS
  // --------------------------------------------------------------------------
  bodyText = bodyText.replace(/\\(section|subsection|subsubsection)\*?\{([^}]+)\}/g, (_, level, headingText) => {
    const cleanHeading = cleanLatexInline(headingText).trim();
    const secLine = findSourceLine(cleanHeading, rawLines, `\\${level}`);
    const tag = level === 'section' ? 'h2' : level === 'subsection' ? 'h3' : 'h4';
    const cls = level === 'section' ? 'latex-section' : level === 'subsection' ? 'latex-subsection' : 'latex-subsubsection';
    return `\n\n<${tag} class="${cls} synctex-target" data-line="${secLine}" title="Click to jump to line ${secLine} in code">${headingText}</${tag}>\n\n`;
  });

  // --------------------------------------------------------------------------
  // STAGE 10: FOOTNOTES HARVESTING
  // --------------------------------------------------------------------------
  const footnotes: string[] = [];
  bodyText = bodyText.replace(/\\footnote\{([\s\S]*?)\}/g, (_, fnContent) => {
    footnotes.push(fnContent.trim());
    const fnIdx = footnotes.length;
    return `<sup class="latex-footnote-ref"><a href="#fn-${fnIdx}" id="fnref-${fnIdx}">[${fnIdx}]</a></sup>`;
  });

  // --------------------------------------------------------------------------
  // STAGE 11: INLINE FORMATTING & TYPOGRAPHY
  // --------------------------------------------------------------------------
  bodyText = parseInlineFormatting(bodyText);

  // Append Footnotes Section if present
  if (footnotes.length > 0) {
    const fnListHtml = footnotes.map((fn, idx) => {
      const fnNum = idx + 1;
      return `<li id="fn-${fnNum}" class="latex-footnote-item"><sup>${fnNum}</sup> ${parseInlineFormatting(fn)}</li>`;
    }).join('');
    bodyText += `
      <div class="latex-footnotes-container">
        <div class="latex-footnotes-divider"></div>
        <ol class="latex-footnotes-list">${fnListHtml}</ol>
      </div>
    `;
  }

  // Separate any text immediately following block tags with double newlines
  bodyText = bodyText
    .replace(/(<\/(?:h2|h3|h4|div|ul|ol|dl|blockquote|table|pre)>)\s*([^\n<\s])/g, '$1\n\n$2')
    .replace(/([^\n>\s])\s*(<(?:h2|h3|h4|div|ul|ol|dl|blockquote|table|pre)[\s>])/g, '$1\n\n$2');

  // Paragraph wrapping with accurate data-line anchors and indentation awareness
  const paragraphs = bodyText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      if (/^<(?:h2|h3|h4|div|ul|ol|dl|blockquote|table|pre)[\s>]/.test(p) || p.startsWith('<!--')) {
        return p;
      }

      let pClass = 'latex-paragraph';
      const pStyles: string[] = [];

      let cleanContent = p;
      if (/^\\noindent\b/.test(cleanContent)) {
        pClass += ' latex-noindent';
        pStyles.push('text-indent: 0 !important;');
        cleanContent = cleanContent.replace(/^\\noindent\s*/, '');
      } else if (/^\\indent\b/.test(cleanContent)) {
        pClass += ' latex-force-indent';
        pStyles.push('text-indent: 1.5em !important;');
        cleanContent = cleanContent.replace(/^\\indent\s*/, '');
      }

      const cleanSnippet = cleanContent.replace(/<[^>]+>/g, '').trim().slice(0, 30);
      const pLine = cleanSnippet ? findSourceLine(cleanSnippet.slice(0, 18), rawLines) : 1;
      const styleAttr = pStyles.length > 0 ? ` style="${pStyles.join(' ')}"` : '';

      return `<p class="${pClass} synctex-target"${styleAttr} data-line="${pLine}" title="Click to jump to line ${pLine} in code">${cleanContent}</p>`;
    });

  let finalHtml = paragraphs.join('\n\n');

  // --------------------------------------------------------------------------
  // STAGE 12: UN-STASH TOKENS (Math & Verbatim Injection)
  // --------------------------------------------------------------------------
  for (const [token, html] of stashedTokens.entries()) {
    finalHtml = finalHtml.replaceAll(token, html);
  }

  return finalHtml;
}

/**
 * Universal inline formatting transformer:
 * Handles \textbf, \textit, \underline, \texttt, \textsc, \textsf, \textsl,
 * \sout, \textcolor, \colorbox, \rule, \hrule, \cite, \ref, \eqref, \autoref,
 * \indent, \noindent, \hspace, \quad, \qquad, \enspace, \hfill,
 * smart quotes, em-dash, and en-dash.
 */
function parseInlineFormatting(text: string): string {
  return text
    // Font styles
    .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
    .replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>')
    .replace(/\\texttt\{([^}]+)\}/g, '<code class="latex-code">$1</code>')
    .replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>')
    .replace(/\\textsc\{([^}]+)\}/g, '<span style="font-variant: small-caps;">$1</span>')
    .replace(/\\textsf\{([^}]+)\}/g, '<span style="font-family: var(--font-sans, sans-serif);">$1</span>')
    .replace(/\\textsl\{([^}]+)\}/g, '<span style="font-style: oblique;">$1</span>')
    .replace(/\\(?:sout|st)\{([^}]+)\}/g, '<del>$1</del>')
    .replace(/\\textsuperscript\{([^}]+)\}/g, '<sup>$1</sup>')
    .replace(/\\textsubscript\{([^}]+)\}/g, '<sub>$1</sub>')

    // Horizontal Spacing, Indentation & Fillers
    .replace(/\\indent\b/g, '<span class="latex-indent" style="display: inline-block; width: 1.5em;"></span>')
    .replace(/\\noindent\b/g, '<span class="latex-noindent"></span>')
    .replace(/\\hspace\*?\{([^}]+)\}/g, (_, dim) => `<span class="latex-hspace" style="display: inline-block; width: ${parseLatexDimensionToCss(dim)};"></span>`)
    .replace(/\\quad\b/g, '<span class="latex-space-quad" style="display: inline-block; width: 1em;"></span>')
    .replace(/\\qquad\b/g, '<span class="latex-space-qquad" style="display: inline-block; width: 2em;"></span>')
    .replace(/\\enspace\b/g, '<span class="latex-space-enspace" style="display: inline-block; width: 0.5em;"></span>')
    .replace(/\\thinspace\b/g, '&thinsp;')
    .replace(/\\hfill\b/g, '<span class="latex-hfill" style="display: inline-block; flex: 1; min-width: 12px;"></span>')

    // Colors
    .replace(/\\textcolor\{([^}]+)\}\{([^}]+)\}/g, (_, color, body) => `<span style="color: ${color};">${body}</span>`)
    .replace(/\\colorbox\{([^}]+)\}\{([^}]+)\}/g, (_, color, body) => `<span style="background-color: ${color}; padding: 1px 4px; border-radius: 2px;">${body}</span>`)

    // Citations & Cross-references
    .replace(/\\(?:cite|citep|citet)\{([^}]+)\}/g, '<span class="latex-citation">[$1]</span>')
    .replace(/\\eqref\{([^}]+)\}/g, '(<span class="latex-ref">$1</span>)')
    .replace(/\\(?:autoref|ref)\{([^}]+)\}/g, '<span class="latex-ref">$1</span>')

    // Rules & Dividers
    .replace(/\\rule(?:\[[^\]]*\])?\{([^}]+)\}\{([^}]+)\}/g, (_, w, h) => {
      const cssW = parseLatexDimensionToCss(w);
      const cssH = parseLatexDimensionToCss(h);
      return `<span class="latex-rule" style="display: inline-block; width: ${cssW}; height: ${cssH}; background-color: currentColor; vertical-align: middle;"></span>`;
    })
    .replace(/\\hrule\b/g, '<hr class="latex-hrule" />')
    .replace(/\\hrulefill\b/g, '<span class="latex-hrulefill"></span>')
    .replace(/\\dotfill\b/g, '<span class="latex-dotfill"></span>')

    // Smart Quotes & Dashes
    .replace(/``([^']+)''/g, '&ldquo;$1&rdquo;')
    .replace(/`([^']*)'/g, '&lsquo;$1&rsquo;')
    .replace(/---/g, '&mdash;')
    .replace(/--/g, '&ndash;')

    // LaTeX Escaped Characters
    .replace(/\\%/g, '%')
    .replace(/\\_/g, '_')
    .replace(/\\&/g, '&amp;')
    .replace(/\\#/g, '#')
    .replace(/\\~/g, '&sim;')
    .replace(/\\backslash\b/g, '\\')
    .replace(/\\maketitle/g, '');
}

export function cleanLatexInline(text: string): string {
  return text
    .replace(/\\textbf\{([^}]+)\}/g, '$1')
    .replace(/\\textit\{([^}]+)\}/g, '$1')
    .replace(/\\texttt\{([^}]+)\}/g, '$1')
    .replace(/\\textsc\{([^}]+)\}/g, '$1')
    .replace(/\\textsf\{([^}]+)\}/g, '$1')
    .replace(/\\emph\{([^}]+)\}/g, '$1')
    .replace(/\\(?:indent|noindent)\b/g, '')
    .replace(/\\(?:vspace|hspace)\*?\{[^}]+\}/g, '')
    .replace(/\\(?:bigskip|medskip|smallskip|vfill|hfill|quad|qquad|enspace|thinspace)\b/g, '')
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
        else if (key.startsWith('thm:') || key.startsWith('lem:') || key.startsWith('def:')) type = 'theorem';
        else if (key.startsWith('alg:')) type = 'algorithm';

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
