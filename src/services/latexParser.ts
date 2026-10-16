import type { Diagnostic, ParsedDocument, ProjectFile, LatexLabel } from '../types/latex';

/**
 * Converts standard LaTeX dimension strings into browser-compatible CSS dimensions.
 */
export function parseLatexDimensionToCss(dim: string, fallback: string = '100%'): string {
  if (!dim) return fallback;
  const clean = dim.trim().replace(/[{}]/g, '');
  if (!clean) return fallback;

  const isNeg = clean.startsWith('-');
  const unsigned = isNeg ? clean.slice(1).trim() : clean;

  const relWidthMatch = unsigned.match(/^([0-9.]*)\s*\\(textwidth|columnwidth|linewidth|paperwidth|pagewidth)$/i);
  if (relWidthMatch) {
    const factor = relWidthMatch[1] ? parseFloat(relWidthMatch[1]) : 1.0;
    if (!isNaN(factor)) {
      const val = Math.round(factor * 1000) / 10;
      return isNeg ? `-${val}%` : `${val}%`;
    }
    return isNeg ? '-100%' : '100%';
  }

  const relHeightMatch = unsigned.match(/^([0-9.]*)\s*\\(textheight|paperheight)$/i);
  if (relHeightMatch) {
    const factor = relHeightMatch[1] ? parseFloat(relHeightMatch[1]) : 1.0;
    if (!isNaN(factor)) {
      const val = Math.round(factor * 1000) / 10;
      return isNeg ? `-${val}vh` : `${val}vh`;
    }
    return isNeg ? '-100vh' : '100vh';
  }

  const baseLineMatch = unsigned.match(/^([0-9.]*)\s*\\baselineskip$/i);
  if (baseLineMatch) {
    const factor = baseLineMatch[1] ? parseFloat(baseLineMatch[1]) : 1.0;
    const emVal = Math.round(factor * 1.25 * 100) / 100;
    return isNeg ? `-${emVal}em` : `${emVal}em`;
  }

  if (unsigned === '\\fill' || unsigned.startsWith('\\stretch')) {
    return '100%';
  }
  if (unsigned.includes('\\bigskipamount')) return isNeg ? '-18px' : '18px';
  if (unsigned.includes('\\medskipamount')) return isNeg ? '-10px' : '10px';
  if (unsigned.includes('\\smallskipamount')) return isNeg ? '-5px' : '5px';
  if (unsigned.includes('\\parskip')) return isNeg ? '-6px' : '6px';

  const unitMatch = unsigned.match(/^([0-9.]+)\s*(cm|mm|in|pt|em|ex|px|pc)$/i);
  if (unitMatch) {
    const val = parseFloat(unitMatch[1]);
    const unit = unitMatch[2].toLowerCase();
    if (!isNaN(val)) {
      if (unit === 'pc') {
        const pxVal = Math.round(val * 16);
        return isNeg ? `-${pxVal}px` : `${pxVal}px`;
      }
      return isNeg ? `-${val}${unit}` : `${val}${unit}`;
    }
  }

  const numMatch = unsigned.match(/^([0-9.]+)$/);
  if (numMatch) {
    return isNeg ? `-${numMatch[1]}px` : `${numMatch[1]}px`;
  }

  if (unsigned.includes('\\textwidth') || unsigned.includes('\\columnwidth') || unsigned.includes('\\linewidth')) {
    return isNeg ? '-100%' : '100%';
  }

  return fallback;
}

/**
 * Scans ahead in `str` from `startIndex` skipping whitespace and extracts a balanced braced group `{...}`.
 */
export function extractBalancedBracedGroup(str: string, startIndex: number = 0): { content: string; endIndex: number } | null {
  let i = startIndex;
  while (i < str.length && /\s/.test(str[i])) i++;
  if (i >= str.length || str[i] !== '{') return null;

  i++;
  let depth = 1;
  const startContent = i;

  while (i < str.length && depth > 0) {
    const ch = str[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }

  if (depth === 0) {
    return {
      content: str.substring(startContent, i - 1),
      endIndex: i,
    };
  }
  return null;
}

/**
 * Scans ahead in `str` from `startIndex` skipping whitespace and extracts an optional bracketed group `[...]`.
 */
export function extractOptionalBracket(str: string, startIndex: number = 0): { content: string; endIndex: number } | null {
  let i = startIndex;
  while (i < str.length && /\s/.test(str[i])) i++;
  if (i >= str.length || str[i] !== '[') return null;

  i++;
  let depth = 1;
  const startContent = i;

  while (i < str.length && depth > 0) {
    const ch = str[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    i++;
  }

  if (depth === 0) {
    return {
      content: str.substring(startContent, i - 1),
      endIndex: i,
    };
  }
  return null;
}

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
  let spec = expandColSpec(rawSpec.replace(/^\{|\}$/g, '').trim());
  spec = spec.replace(/Y/g, '>{\\centering}X').replace(/Z/g, '>{\\raggedleft}X');

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
      while (i < spec.length && /\s/.test(spec[i])) i++;
      let widthStr = '';
      if (spec[i] === '{') {
        const braced = extractBalancedBracedGroup(spec, i);
        if (braced) {
          widthStr = braced.content;
          i = braced.endIndex;
        } else {
          i++;
        }
      }
      const cssWidth = widthStr ? parseLatexDimensionToCss(widthStr) : undefined;
      cols.push({
        align: ch === 'p' ? 'left' : 'center',
        width: cssWidth,
        borderLeft: pendingBorderLeft,
      });
      pendingBorderLeft = false;
    } else if (ch === 'X') {
      cols.push({ align: 'left', isX: true, borderLeft: pendingBorderLeft });
      pendingBorderLeft = false;
      i++;
    } else if (ch === '>') {
      i++;
      while (i < spec.length && /\s/.test(spec[i])) i++;
      let formatCmd = '';
      if (spec[i] === '{') {
        const braced = extractBalancedBracedGroup(spec, i);
        if (braced) {
          formatCmd = braced.content;
          i = braced.endIndex;
        } else {
          i++;
        }
      }
      while (i < spec.length && /\s/.test(spec[i])) i++;

      let alignOverride: 'left' | 'center' | 'right' | undefined;
      if (/centering|Centering/i.test(formatCmd)) alignOverride = 'center';
      else if (/raggedleft/i.test(formatCmd)) alignOverride = 'right';
      else if (/raggedright/i.test(formatCmd)) alignOverride = 'left';

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
        } else if (nextCol === 'p' || nextCol === 'm' || nextCol === 'b') {
          i++;
          while (i < spec.length && /\s/.test(spec[i])) i++;
          let widthStr = '';
          if (spec[i] === '{') {
            const braced = extractBalancedBracedGroup(spec, i);
            if (braced) {
              widthStr = braced.content;
              i = braced.endIndex;
            } else {
              i++;
            }
          }
          const cssWidth = widthStr ? parseLatexDimensionToCss(widthStr) : undefined;
          cols.push({
            align: alignOverride || (nextCol === 'p' ? 'left' : 'center'),
            width: cssWidth,
            borderLeft: pendingBorderLeft,
          });
          pendingBorderLeft = false;
        }
      }
    } else if (ch === '@' || ch === '!') {
      i++;
      while (i < spec.length && /\s/.test(spec[i])) i++;
      if (spec[i] === '{') {
        const braced = extractBalancedBracedGroup(spec, i);
        if (braced) i = braced.endIndex;
        else i++;
      }
    } else if (ch === 'S') {
      cols.push({ align: 'right', borderLeft: pendingBorderLeft });
      pendingBorderLeft = false;
      i++;
    } else {
      i++;
    }
  }

  if (pendingBorderLeft && cols.length > 0) {
    cols[cols.length - 1].borderRight = true;
  }

  return cols.length > 0 ? cols : [{ align: 'left' }];
}

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

export interface TocEntry {
  title: string;
  level: number;
  line: number;
  num: string;
}

/**
 * Extracts structured Table of Contents entries (data only, never HTML strings).
 */
export function generateTableOfContents(code: string, _rawLines?: string[]): TocEntry[] {
  const lines = code.split('\n');
  const items: TocEntry[] = [];

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

  return items;
}

/**
 * High-speed LaTeX Diagnostic Linter
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

    if (/\\tableofcontent(?![sA-Za-z])/.test(effectiveLine)) {
      diagnostics.push({
        id: `typo-tableofcontent-${lineNum}`,
        line: lineNum,
        column: effectiveLine.indexOf('\\tableofcontent') + 1,
        severity: 'info',
        message: `Command '\\tableofcontent' is '\\tableofcontents' (with an 's') in standard LaTeX.`,
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
 * Structural Parser: Extracts Title, Authors, Abstract, Sections, Math, Citations, and Layout metadata.
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
    abstract = cleanLatexInline(abstractMatch[1].trim());
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
  const citations: string[] = [];

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

    const citeMatches = line.matchAll(/\\(?:cite|citep|citet|citealp|citealt)\{([^}]+)\}/g);
    for (const cm of citeMatches) {
      if (cm[1]) {
        for (const k of cm[1].split(',')) {
          const key = k.trim();
          if (key && !citations.includes(key)) {
            citations.push(key);
          }
        }
      }
    }
  }

  return {
    title,
    authors: authors.length ? authors : [],
    date: date || '',
    abstract,
    titleLine,
    authorLine,
    dateLine,
    abstractLine,
    sections,
    mathBlocks,
    citations,
    isTwoColumn,
    documentClass,
    hasTitlePage,
    titlePageContent,
    hasParskip: /\\usepackage(?:\s*\[[^\]]*\])?\s*\{parskip\}/i.test(code) || /\\setlength\s*\{\s*\\parindent\s*\}\s*\{\s*0(?:pt|mm|cm|in|px)?\s*\}/i.test(code),
  };
}

export function cleanLatexInline(text: string): string {
  return text
    .replace(/\\textbf\{([^}]+)\}/g, '$1')
    .replace(/\\textit\{([^}]+)\}/g, '$1').replace(/\\texttt\{([^}]+)\}/g, '$1')
    .replace(/\\textsc\{([^}]+)\}/g, '$1').replace(/\\textsf\{([^}]+)\}/g, '$1')
    .replace(/\\emph\{([^}]+)\}/g, '$1')
    .replace(/\\(?:indent|noindent)\b/g, '')
    .replace(/\\(?:vspace|hspace)\*?\{[^}]+\}/g, '')
    .replace(/\\(?:bigskip|medskip|smallskip|vfill|hfill|quad|qquad|enspace|thinspace)\b/g, '')
    .replace(/\\\\/g, ' ')
    .replace(/\\/g, '')
    .trim();
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