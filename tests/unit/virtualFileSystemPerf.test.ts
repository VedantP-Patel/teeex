import { describe, it, expect } from 'vitest';
import { uint8ArrayToDataUrl, dataUrlToUint8Array } from '../../src/services/virtualFileSystem';
import { extractLatexLabels, extractLatexLabelsForFile } from '../../src/services/latexParser';
import type { ProjectFile } from '../../src/types/latex';

describe('Virtual File System & Parser Performance Hardening', () => {
  describe('uint8ArrayToDataUrl (Chunked 32KB)', () => {
    it('accurately encodes and decodes large binary payloads (>64KB)', () => {
      // 100 KB test payload
      const size = 102400;
      const original = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        original[i] = (i * 31 + 7) & 0xff;
      }

      const dataUrl = uint8ArrayToDataUrl(original, 'application/octet-stream');
      expect(dataUrl.startsWith('data:application/octet-stream;base64,')).toBe(true);

      const decoded = dataUrlToUint8Array(dataUrl);
      expect(decoded.length).toBe(original.length);

      // Verify sample bytes
      expect(decoded[0]).toBe(original[0]);
      expect(decoded[50000]).toBe(original[50000]);
      expect(decoded[size - 1]).toBe(original[size - 1]);
    });

    it('handles empty byte arrays', () => {
      const empty = new Uint8Array(0);
      const dataUrl = uint8ArrayToDataUrl(empty, 'image/png');
      expect(dataUrl).toBe('data:image/png;base64,');
      expect(dataUrlToUint8Array(dataUrl).length).toBe(0);
    });
  });

  describe('extractLatexLabels caching', () => {
    const file1: ProjectFile = {
      id: 'f1',
      name: 'main.tex',
      content: `
\\section{Introduction}\\label{sec:intro}
This is intro text.
\\begin{figure}
  \\caption{Architecture Diagram}
  \\label{fig:arch}
\\end{figure}
`,
      isEntry: true,
    };

    const file2: ProjectFile = {
      id: 'f2',
      name: 'method.tex',
      content: `
\\section{Methodology}\\label{sec:method}
\\begin{equation}
  E = mc^2 \\label{eq:einstein}
\\end{equation}
`,
    };

    it('extracts labels from all files accurately', () => {
      const labels = extractLatexLabels([file1, file2]);
      const keys = labels.map((l) => l.key);
      expect(keys).toContain('sec:intro');
      expect(keys).toContain('fig:arch');
      expect(keys).toContain('sec:method');
      expect(keys).toContain('eq:einstein');
    });

    it('returns memoized result when file content has not changed', () => {
      const first = extractLatexLabelsForFile(file1);
      const second = extractLatexLabelsForFile(file1);
      // Strict equality check on the cached array reference
      expect(first).toBe(second);
    });

    it('invalidates cache when file content is updated', () => {
      const first = extractLatexLabelsForFile(file1);
      const modifiedFile1: ProjectFile = {
        ...file1,
        content: file1.content + '\n\\label{sec:new}',
      };
      const updated = extractLatexLabelsForFile(modifiedFile1);
      expect(updated).not.toBe(first);
      expect(updated.map((l) => l.key)).toContain('sec:new');
    });
  });
});
