import { describe, it, expect } from 'vitest';
import { computeCitationSignature, needsBibtex } from '../../src/services/texProject';
import type { ProjectFile } from '../../src/types/latex';

describe('BibTeX AST Hashing & Avoidance (Layer 7)', () => {
  const baseFiles: ProjectFile[] = [
    {
      id: '1',
      name: 'main.tex',
      content: '\\documentclass{article}\n\\begin{document}\nHello world!\\cite{knuth1984}\n\\bibliography{refs}\n\\end{document}',
      type: 'tex',
    },
    {
      id: '2',
      name: 'refs.bib',
      content: '@article{knuth1984, author = {Knuth, Donald E.}, title = {Literate Programming}, year = {1984}}',
      type: 'bib',
    },
  ];

  it('correctly identifies documents that need bibtex', () => {
    expect(needsBibtex(baseFiles, baseFiles[0].content)).toBe(true);

    const noBibFiles: ProjectFile[] = [
      { id: '1', name: 'main.tex', content: '\\documentclass{article}\\begin{document}Hello\\end{document}', type: 'tex' },
    ];
    expect(needsBibtex(noBibFiles, noBibFiles[0].content)).toBe(false);
  });

  it('computes identical signature when typing in body text without altering citations or .bib', () => {
    const citations = ['knuth1984'];
    const sig1 = computeCitationSignature(baseFiles, citations);

    const editedFiles: ProjectFile[] = [
      {
        ...baseFiles[0],
        content: '\\documentclass{article}\n\\begin{document}\nHello world! A brand new sentence was typed here.\\cite{knuth1984}\n\\bibliography{refs}\n\\end{document}',
      },
      baseFiles[1],
    ];

    const sig2 = computeCitationSignature(editedFiles, citations);
    expect(sig1).toBe(sig2);
  });

  it('changes signature when citations list is modified', () => {
    const sig1 = computeCitationSignature(baseFiles, ['knuth1984']);
    const sig2 = computeCitationSignature(baseFiles, ['knuth1984', 'lamport1994']);
    expect(sig1).not.toBe(sig2);
  });

  it('changes signature when .bib content is edited', () => {
    const citations = ['knuth1984'];
    const sig1 = computeCitationSignature(baseFiles, citations);

    const modifiedBibFiles: ProjectFile[] = [
      baseFiles[0],
      {
        ...baseFiles[1],
        content: '@article{knuth1984, author = {Knuth, Donald Ervin}, title = {Literate Programming}, year = {1984}}',
      },
    ];

    const sig2 = computeCitationSignature(modifiedBibFiles, citations);
    expect(sig1).not.toBe(sig2);
  });

  it('orders citations deterministically regardless of document appearance order', () => {
    const sigA = computeCitationSignature(baseFiles, ['zebra2020', 'alpha2010']);
    const sigB = computeCitationSignature(baseFiles, ['alpha2010', 'zebra2020']);
    expect(sigA).toBe(sigB);
  });
});
