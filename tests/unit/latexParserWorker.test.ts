// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { ProjectFile } from '../../src/types/latex';
import {
  diagnoseLatex,
  extractLatexLabels,
  generateTableOfContents,
  parseLatexDocument,
} from '../../src/services/latexParser';

describe('LaTeX Structural Parsing & Linting Pipeline', () => {
  const sampleTex = `\\documentclass{article}
\\usepackage{amsmath}
\\title{Quantum Computing Performance}
\\author{Alice Smith \\and Bob Jones}
\\begin{document}
\\maketitle
\\begin{abstract}
This is a structural parsing benchmark test.
\\end{abstract}
\\section{Introduction}
\\label{sec:intro}
Let $E = mc^2$ be Einstein's energy equation, as shown in \\cite{einstein1905}.
\\[ \\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2} \\]
\\subsection{Background}
\\label{subsec:bg}
\\end{document}`;

  const files: ProjectFile[] = [
    {
      id: 'main.tex',
      name: 'main.tex',
      content: sampleTex,
      type: 'tex',
      isEntry: true,
    },
  ];

  it('diagnoses, parses document structure, and extracts labels and TOC without errors', () => {
    const diags = diagnoseLatex(sampleTex);
    const doc = parseLatexDocument(sampleTex, files);
    const labels = extractLatexLabels(files);
    const toc = generateTableOfContents(sampleTex);

    expect(diags).toEqual([]);
    expect(doc.title).toBe('Quantum Computing Performance');
    expect(doc.authors).toEqual(['Alice Smith', 'Bob Jones']);
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0].title).toBe('Introduction');
    expect(doc.sections[1].title).toBe('Background');
    expect(doc.mathBlocks.length).toBeGreaterThanOrEqual(1);
    expect(doc.citations).toEqual(['einstein1905']);

    expect(labels).toHaveLength(2);
    expect(labels[0].key).toBe('sec:intro');
    expect(labels[0].type).toBe('section');

    expect(toc).toHaveLength(2);
    expect(toc[0]).toMatchObject({ title: 'Introduction', level: 1, num: '1.' });
    expect(toc[1]).toMatchObject({ title: 'Background', level: 2, num: '1.1' });
  });

  it('diagnoses unmatched environments and unclosed inline math', () => {
    const brokenTex = `\\documentclass{article}\n\\begin{document}\n$Unclosed math\n\\begin{itemize}\n\\end{enumerate}\n`;
    const diags = diagnoseLatex(brokenTex);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.some((d) => d.rule === 'syntax/mismatched-environment')).toBe(true);
    expect(diags.some((d) => d.rule === 'syntax/unclosed-math')).toBe(true);
  });

  it('treats malicious URLs and captions as plain data strings, never HTML markup', () => {
    const maliciousTex = `\\documentclass{article}
\\title{<img src=x onerror=alert(1)>}
\\begin{document}
\\section{\\textbf{Safe} <script>alert(2)</script>}
\\label{sec:" onclick="alert(3)}
\\url{javascript:alert(4)}
\\href{javascript:alert(5)}{Click me}
\\end{document}`;

    const maliciousFiles: ProjectFile[] = [
      { id: 'main.tex', name: 'main.tex', content: maliciousTex, type: 'tex', isEntry: true },
    ];

    const doc = parseLatexDocument(maliciousTex, maliciousFiles);
    const labels = extractLatexLabels(maliciousFiles);

    // Parser returns raw text data for React to escape automatically, not HTML anchor tags
    expect(doc.sections[0].title).not.toContain('<a ');
    expect(labels[0].key).toBe('sec:" onclick="alert(3)');
  });
});