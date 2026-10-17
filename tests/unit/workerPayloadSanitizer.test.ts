import { describe, expect, it } from 'vitest';
import { sanitizeWorkerFiles } from '../../src/hooks/useLatexParser';
import type { ProjectFile } from '../../src/types/latex';

describe('Web Worker Payload Sanitization', () => {
  it('filters out binary images, PDFs, and irrelevant assets while preserving TeX/Bib files', () => {
    const hugeBase64 = 'data:image/png;base64,' + 'A'.repeat(50000); // ~50KB mock image
    const files: ProjectFile[] = [
      {
        id: 'main.tex',
        name: 'main.tex',
        content: '\\documentclass{article}\\begin{document}\\includegraphics{figure.png}\\end{document}',
        type: 'tex',
        isEntry: true,
      },
      {
        id: 'figure.png',
        name: 'figure.png',
        content: '',
        dataUrl: hugeBase64,
        type: 'image',
      },
      {
        id: 'refs.bib',
        name: 'refs.bib',
        content: '@article{einstein, author = "Albert Einstein"}',
        type: 'bib',
      },
    ];

    const sanitized = sanitizeWorkerFiles(files);

    // Only .tex and .bib are sent to the worker
    expect(sanitized).toHaveLength(2);
    expect(sanitized.map((f) => f.name)).toEqual(['main.tex', 'refs.bib']);

    // TeX file preserved verbatim with isEntry flag
    expect(sanitized[0].content).toContain('\\includegraphics{figure.png}');
    expect(sanitized[0].isEntry).toBe(true);
    expect(sanitized[0].type).toBe('tex');

    // Bib file preserved verbatim
    expect(sanitized[1].content).toContain('@article{einstein');
    expect(sanitized[1].type).toBe('bib');
  });

  it('preserves all relevant TeX source types (.tex, .bib, .sty, .cls)', () => {
    const files: ProjectFile[] = [
      { id: '1', name: 'main.tex', content: '\\documentclass{custom}\\usepackage{pkg}', type: 'tex' },
      { id: '2', name: 'refs.bib', content: '@book{b}', type: 'bib' },
      { id: '3', name: 'pkg.sty', content: '\\ProvidesPackage{pkg}', type: 'sty' },
      { id: '4', name: 'custom.cls', content: '\\ProvidesClass{custom}', type: 'tex' },
    ];

    const sanitized = sanitizeWorkerFiles(files);
    expect(sanitized).toHaveLength(4);
    expect(sanitized.map((f) => f.name)).toEqual(['main.tex', 'refs.bib', 'pkg.sty', 'custom.cls']);
  });

  it('achieves > 99% size reduction when large graphics are present', () => {
    const megabyteImage = 'data:image/jpeg;base64,' + 'X'.repeat(1024 * 1024); // ~1MB mock image
    const files: ProjectFile[] = [
      {
        id: 'main.tex',
        name: 'main.tex',
        content: '\\documentclass{article}',
        type: 'tex',
      },
      {
        id: 'diagram.jpg',
        name: 'diagram.jpg',
        content: '',
        dataUrl: megabyteImage,
        type: 'image',
      },
    ];

    const originalSize = JSON.stringify(files).length;
    const sanitizedSize = JSON.stringify(sanitizeWorkerFiles(files)).length;

    expect(originalSize).toBeGreaterThan(1024 * 1024);
    expect(sanitizedSize).toBeLessThan(1024); // Under 1KB!
    const ratio = (originalSize - sanitizedSize) / originalSize;
    expect(ratio).toBeGreaterThan(0.99);
  });
});
