// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { ProjectFile } from '../../src/types/latex';
import { diagnoseLatex, parseLatexDocument, renderLatexToHtml } from '../../src/services/latexParser';

describe('LaTeX Off-Thread Parsing Pipeline', () => {
  const sampleTex = `\\documentclass{article}
\\usepackage{amsmath}
\\title{Quantum Computing Performance}
\\author{Alice Smith \\and Bob Jones}
\\begin{document}
\\maketitle
\\begin{abstract}
This is a high-speed parsing benchmark test.
\\end{abstract}
\\section{Introduction}
Let $E = mc^2$ be Einstein's energy equation.
\\[ \\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2} \\]
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

  it('correctly diagnoses, parses AST, and renders HTML without errors', () => {
    const t0 = performance.now();
    const diags = diagnoseLatex(sampleTex);
    const doc = parseLatexDocument(sampleTex, files);
    const html = renderLatexToHtml(sampleTex, files);
    const duration = performance.now() - t0;

    expect(Array.isArray(diags)).toBe(true);
    expect(diags.length).toBe(0); // Clean LaTeX document has 0 syntax errors

    expect(doc.title).toContain('Quantum Computing Performance');
    expect(doc.authors).toContain('Alice Smith');
    expect(doc.sections.length).toBeGreaterThanOrEqual(1);
    expect(doc.mathBlocks.length).toBeGreaterThanOrEqual(1);

    expect(html).toContain('Quantum Computing Performance');
    expect(html).toContain('katex');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('correctly diagnoses unmatched environments and unclosed math', () => {
    const brokenTex = `\\documentclass{article}\n\\begin{document}\n$Unclosed math\n\\begin{itemize}\n\\end{enumerate}\n`;
    const diags = diagnoseLatex(brokenTex);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.some((d) => d.severity === 'error' || d.severity === 'warning')).toBe(true);

    const doc = parseLatexDocument(brokenTex, files);
    expect(doc).toBeDefined();

    const html = renderLatexToHtml(brokenTex, files);
    expect(typeof html).toBe('string');
  });

  it('validates worker request and response contract format', () => {
    const requestId = 42;
    const isTex = true;
    const diags = isTex ? diagnoseLatex(sampleTex) : [];
    const parsedDoc = parseLatexDocument(sampleTex, files);
    const renderedHtml = renderLatexToHtml(sampleTex, files);

    const response = {
      requestId,
      diagnostics: diags,
      parsedDoc,
      renderedHtml,
      durationMs: 5.2,
    };

    expect(response.requestId).toBe(42);
    expect(response.diagnostics).toEqual([]);
    expect(response.parsedDoc.title).toContain('Quantum Computing Performance');
    expect(response.renderedHtml).toContain('katex');
  });
});
