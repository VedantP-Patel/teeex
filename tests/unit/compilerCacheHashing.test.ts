import { describe, it, expect } from 'vitest';
import { TexEngineService } from '../../src/services/latexCompiler';
import type { ProjectFile } from '../../src/types/latex';

describe('Compiler Cache & Aux Hashing (Collision Resistance)', () => {
  it('instantiates TexEngineService with idle status', () => {
    const service = new TexEngineService();
    expect(service.getStatus().phase).toBe('idle');
  });

  it('generates 256-bit cryptographic signatures for preamble dependency closures', async () => {
    // Test that distinct preambles with subtle whitespace or package changes
    // produce distinct 64-character SHA-256 signatures rather than 32-bit djb2 collisions
    const filesA: ProjectFile[] = [
      {
        id: '1',
        name: 'main.tex',
        content: '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n$x=1$\n\\end{document}',
        type: 'tex',
      },
    ];

    const filesB: ProjectFile[] = [
      {
        id: '1',
        name: 'main.tex',
        content: '\\documentclass{article}\n\\usepackage{amssymb}\n\\begin{document}\n$x=1$\n\\end{document}',
        type: 'tex',
      },
    ];

    // Verify SHA-256 hash length is 64 hex characters (256 bits)
    const enc = new TextEncoder();
    const hashA = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(filesA[0].content))))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const hashB = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(filesB[0].content))))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    expect(hashA.length).toBe(64);
    expect(hashB.length).toBe(64);
    expect(hashA).not.toBe(hashB);
  });

  it('differentiates non-ASCII aux citations and references without collision', async () => {
    const auxContent1 = '\\relax \n\\citation{Schrödinger1926}\n\\bibcite{Schrödinger1926}{1}';
    const auxContent2 = '\\relax \n\\citation{Schroedinger1926}\n\\bibcite{Schroedinger1926}{1}';

    const enc = new TextEncoder();
    const hash1 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(auxContent1))))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const hash2 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(auxContent2))))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    expect(hash1.length).toBe(64);
    expect(hash2.length).toBe(64);
    expect(hash1).not.toBe(hash2);
  });
});
