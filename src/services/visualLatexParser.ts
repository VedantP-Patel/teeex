/**
 * Visual LaTeX Parser and Serializer
 * 
 * Powers Overleaf-style bidirectional Visual / Rich-Text editing.
 * Parses raw LaTeX documents into structured editable visual blocks
 * (Headings, Paragraphs, Math Equations, Figures, Lists, Tables, Abstract)
 * and serializes visual edits back into high-fidelity LaTeX source code.
 */

export type VisualBlockType =
  | 'heading'
  | 'paragraph'
  | 'equation'
  | 'abstract'
  | 'figure'
  | 'list'
  | 'table'
  | 'raw';

export interface VisualBlock {
  id: string;
  type: VisualBlockType;
  headingLevel?: 1 | 2 | 3; // 1: \section, 2: \subsection, 3: \subsubsection
  title?: string;
  content: string;
  items?: string[];
  ordered?: boolean; // true for \begin{enumerate}, false for \begin{itemize}
  caption?: string;
  filename?: string;
  label?: string;
  rows?: string[][];
}

export interface ParsedVisualDoc {
  preamble: string;
  title: string;
  authors: string;
  date: string;
  documentClass: string;
  hasMaketitle: boolean;
  blocks: VisualBlock[];
  postamble: string;
}

let blockCounter = 0;
function nextId(): string {
  return `vb-${Date.now().toString(36)}-${++blockCounter}`;
}

/**
 * Parses raw LaTeX code into structured visual blocks for rich WYSIWYG editing.
 */
export function parseLatexToVisualBlocks(code: string): ParsedVisualDoc {
  const titleMatch = code.match(/\\title\{([^}]+)\}/);
  const title = titleMatch ? titleMatch[1].trim() : '';

  const authorMatch = code.match(/\\author\{([\s\S]*?)\}(?=\s*\\|\s*\\date|\s*\\begin)/);
  const authors = authorMatch ? authorMatch[1].trim() : '';

  const dateMatch = code.match(/\\date\{([^}]+)\}/);
  const date = dateMatch ? dateMatch[1].trim() : '';

  const docClassMatch = code.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/);
  const documentClass = docClassMatch ? docClassMatch[1].trim() : 'article';

  // Divide into Preamble, Body, Postamble
  const docBeginIdx = code.indexOf('\\begin{document}');
  const docEndIdx = code.lastIndexOf('\\end{document}');

  let preamble = '';
  let body = code;
  let postamble = '';

  if (docBeginIdx !== -1) {
    preamble = code.substring(0, docBeginIdx).trim();
    if (docEndIdx !== -1 && docEndIdx > docBeginIdx) {
      body = code.substring(docBeginIdx + '\\begin{document}'.length, docEndIdx).trim();
      postamble = code.substring(docEndIdx + '\\end{document}'.length).trim();
    } else {
      body = code.substring(docBeginIdx + '\\begin{document}'.length).trim();
    }
  }

  const hasMaketitle = body.includes('\\maketitle');
  // Remove \maketitle from editable body stream
  body = body.replace(/\\maketitle/g, '').trim();

  const blocks: VisualBlock[] = [];

  // Tokenize the body into visual blocks
  // Regex to match environment blocks and headings
  const blockRegex = /(\\begin\{(abstract|equation\*?|figure\*?|table\*?|itemize|enumerate)\}[\s\S]*?\\end\{\2\})|(\\\[[\s\S]*?\\\])|(\\(section|subsection|subsubsection)\*?\{[^}]+\})/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(body)) !== null) {
    // Collect text before the matched block as paragraph(s)
    const textBefore = body.substring(lastIndex, match.index).trim();
    if (textBefore) {
      appendParagraphBlocks(blocks, textBefore);
    }

    const matchedStr = match[0];

    // 1. Abstract
    if (matchedStr.startsWith('\\begin{abstract}')) {
      const absContent = matchedStr
        .replace(/\\begin\{abstract\}/, '')
        .replace(/\\end\{abstract\}/, '')
        .trim();
      blocks.push({
        id: nextId(),
        type: 'abstract',
        content: absContent,
      });
    }
    // 2. Display Equation: \begin{equation} ... \end{equation} or \[ ... \]
    else if (matchedStr.startsWith('\\begin{equation') || matchedStr.startsWith('\\[')) {
      let eqLatex = matchedStr;
      if (matchedStr.startsWith('\\begin{equation')) {
        eqLatex = matchedStr
          .replace(/\\begin\{equation\*?\}/, '')
          .replace(/\\end\{equation\*?\}/, '')
          .trim();
      } else if (matchedStr.startsWith('\\[')) {
        eqLatex = matchedStr.replace(/^\\\[/, '').replace(/\\\]$/, '').trim();
      }

      // Check for \label{...}
      let label = '';
      const labelMatch = eqLatex.match(/\\label\{([^}]+)\}/);
      if (labelMatch) {
        label = labelMatch[1];
        eqLatex = eqLatex.replace(/\\label\{[^}]+\}/, '').trim();
      }

      blocks.push({
        id: nextId(),
        type: 'equation',
        content: eqLatex,
        label,
      });
    }
    // 3. Figure: \begin{figure} ... \end{figure}
    else if (matchedStr.startsWith('\\begin{figure')) {
      const imgMatch = matchedStr.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/);
      const capMatch = matchedStr.match(/\\caption\{([^}]+)\}/);
      const labMatch = matchedStr.match(/\\label\{([^}]+)\}/);

      blocks.push({
        id: nextId(),
        type: 'figure',
        filename: imgMatch ? imgMatch[1].trim() : 'figure.png',
        caption: capMatch ? capMatch[1].trim() : '',
        label: labMatch ? labMatch[1].trim() : '',
        content: matchedStr,
      });
    }
    // 4. List: \begin{itemize} or \begin{enumerate}
    else if (matchedStr.startsWith('\\begin{itemize') || matchedStr.startsWith('\\begin{enumerate')) {
      const isOrdered = matchedStr.startsWith('\\begin{enumerate');
      const inner = matchedStr
        .replace(/\\begin\{(itemize|enumerate)\}/, '')
        .replace(/\\end\{(itemize|enumerate)\}/, '');
      const items = inner
        .split('\\item')
        .slice(1)
        .map(it => it.trim())
        .filter(it => it.length > 0);

      blocks.push({
        id: nextId(),
        type: 'list',
        ordered: isOrdered,
        items: items.length > 0 ? items : ['First list item'],
        content: matchedStr,
      });
    }
    // 5. Heading: \section, \subsection, \subsubsection
    else if (matchedStr.startsWith('\\section') || matchedStr.startsWith('\\subsection') || matchedStr.startsWith('\\subsubsection')) {
      const secMatch = matchedStr.match(/\\(section|subsection|subsubsection)\*?\{([^}]+)\}/);
      if (secMatch) {
        const level = secMatch[1] === 'section' ? 1 : secMatch[1] === 'subsection' ? 2 : 3;
        blocks.push({
          id: nextId(),
          type: 'heading',
          headingLevel: level as 1 | 2 | 3,
          title: secMatch[2].trim(),
          content: secMatch[2].trim(),
        });
      }
    } else {
      // Raw fallback
      blocks.push({
        id: nextId(),
        type: 'raw',
        content: matchedStr,
      });
    }

    lastIndex = match.index + matchedStr.length;
  }

  // Any trailing text after the last match
  const trailingText = body.substring(lastIndex).trim();
  if (trailingText) {
    appendParagraphBlocks(blocks, trailingText);
  }

  return {
    preamble,
    title,
    authors,
    date,
    documentClass,
    hasMaketitle,
    blocks,
    postamble,
  };
}

function appendParagraphBlocks(blocks: VisualBlock[], rawText: string): void {
  const paragraphs = rawText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  for (const p of paragraphs) {
    blocks.push({
      id: nextId(),
      type: 'paragraph',
      content: p,
    });
  }
}

/**
 * Serializes the structured visual blocks back into high-fidelity LaTeX document code.
 */
export function serializeVisualDocToLatex(doc: ParsedVisualDoc): string {
  let preamble = doc.preamble;

  // If preamble is empty, generate a clean academic preamble
  if (!preamble) {
    preamble = `\\documentclass[conference]{${doc.documentClass || 'IEEEtran'}}\n\\usepackage{amsmath,amssymb,amsfonts}\n\\usepackage{graphicx}\n\\usepackage{cite}`;
  }

  // Update Title in preamble
  if (doc.title) {
    if (preamble.includes('\\title{')) {
      preamble = preamble.replace(/\\title\{[^}]*\}/, `\\title{${doc.title}}`);
    } else {
      preamble += `\n\\title{${doc.title}}`;
    }
  }

  // Update Author in preamble
  if (doc.authors) {
    if (preamble.includes('\\author{')) {
      preamble = preamble.replace(/\\author\{[\s\S]*?\}(?=\s*\\|\s*\\date|\s*\\begin)/, `\\author{${doc.authors}}`);
    } else {
      preamble += `\n\\author{${doc.authors}}`;
    }
  }

  // Update Date in preamble
  if (doc.date) {
    if (preamble.includes('\\date{')) {
      preamble = preamble.replace(/\\date\{[^}]*\}/, `\\date{${doc.date}}`);
    } else {
      preamble += `\n\\date{${doc.date}}`;
    }
  }

  // Serialize Body Blocks
  const bodyLines: string[] = [];

  if (doc.hasMaketitle || doc.title) {
    bodyLines.push('\\maketitle\n');
  }

  for (const b of doc.blocks) {
    switch (b.type) {
      case 'abstract':
        bodyLines.push(`\\begin{abstract}\n${b.content}\n\\end{abstract}\n`);
        break;

      case 'heading': {
        const cmd = b.headingLevel === 1 ? 'section' : b.headingLevel === 2 ? 'subsection' : 'subsubsection';
        bodyLines.push(`\\${cmd}{${b.title || b.content}}\n`);
        break;
      }

      case 'paragraph':
        bodyLines.push(`${b.content}\n`);
        break;

      case 'equation':
        bodyLines.push(`\\begin{equation}\n  ${b.content}${b.label ? `\n  \\label{${b.label}}` : ''}\n\\end{equation}\n`);
        break;

      case 'figure':
        bodyLines.push(
          `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.85\\linewidth]{${b.filename || 'figure.png'}}${
            b.caption ? `\n  \\caption{${b.caption}}` : ''
          }${b.label ? `\n  \\label{${b.label}}` : ''}\n\\end{figure}\n`
        );
        break;

      case 'list': {
        const env = b.ordered ? 'enumerate' : 'itemize';
        const itemsStr = (b.items || ['First item'])
          .map(it => `  \\item ${it}`)
          .join('\n');
        bodyLines.push(`\\begin{${env}}\n${itemsStr}\n\\end{${env}}\n`);
        break;
      }

      case 'raw':
        bodyLines.push(`${b.content}\n`);
        break;
    }
  }

  const finalBody = bodyLines.join('\n');
  return `${preamble}\n\n\\begin{document}\n\n${finalBody.trim()}\n\n\\end{document}${doc.postamble ? `\n${doc.postamble}` : ''}`;
}
