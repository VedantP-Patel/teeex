import { describe, it, expect, vi } from 'vitest';
import { PdfDocument, type PdfSearchResult } from '../../src/services/pdfRenderer';
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist';

describe('PDF In-Document Search (findText)', () => {
  function createMockPdfDocument(pages: Array<Array<{ str: string; transform?: number[] }>>): PdfDocument {
    const mockPages = pages.map((items) => ({
      getTextContent: vi.fn().mockResolvedValue({
        items: items.map((it) => ({
          str: it.str,
          transform: it.transform ?? [1, 0, 0, 1, 50, 700],
        })),
      }),
      getViewport: vi.fn().mockReturnValue({ width: 612, height: 792, scale: 1 }),
      cleanup: vi.fn(),
    }));

    const mockDoc = {
      numPages: pages.length,
      getPage: vi.fn().mockImplementation((pageNum: number) => {
        return Promise.resolve(mockPages[pageNum - 1]);
      }),
    } as unknown as PDFDocumentProxy;

    const mockLoadingTask = {
      destroy: vi.fn().mockResolvedValue(undefined),
    } as unknown as PDFDocumentLoadingTask;

    return new PdfDocument(mockDoc, mockLoadingTask);
  }

  it('returns empty array when query is empty or whitespace', async () => {
    const doc = createMockPdfDocument([[{ str: 'Hello world' }]]);
    const emptyResult = await doc.findText('');
    const spaceResult = await doc.findText('   ');

    expect(emptyResult).toEqual([]);
    expect(spaceResult).toEqual([]);
  });

  it('finds single match on a single page with correct page number and yPt', async () => {
    const doc = createMockPdfDocument([
      [
        { str: 'Introduction to Quantum Mechanics', transform: [1, 0, 0, 1, 72, 650] },
        { str: 'Second paragraph detailing experiments.', transform: [1, 0, 0, 1, 72, 600] },
      ],
    ]);

    const results = await doc.findText('Quantum');
    expect(results).toHaveLength(1);
    expect(results[0].pageNumber).toBe(1);
    expect(results[0].yPt).toBe(650);
    expect(results[0].snippet).toContain('Quantum');
  });

  it('finds multiple matches across multiple pages case-insensitively', async () => {
    const doc = createMockPdfDocument([
      [
        { str: 'Quantum computing is emerging.', transform: [1, 0, 0, 1, 72, 700] },
        { str: 'Classical computing vs quantum supremacy.', transform: [1, 0, 0, 1, 72, 650] },
      ],
      [
        { str: 'Future of quantum networks and cryptography.', transform: [1, 0, 0, 1, 72, 680] },
      ],
    ]);

    const results = await doc.findText('QUANTUM');
    expect(results).toHaveLength(3);
    expect(results[0].pageNumber).toBe(1);
    expect(results[0].matchIndex).toBe(0);
    expect(results[1].pageNumber).toBe(1);
    expect(results[1].matchIndex).toBe(1);
    expect(results[2].pageNumber).toBe(2);
    expect(results[2].matchIndex).toBe(2);
    expect(results[2].yPt).toBe(680);
  });

  it('matches phrases that span across consecutive text items', async () => {
    const doc = createMockPdfDocument([
      [
        { str: 'Albert', transform: [1, 0, 0, 1, 72, 720] },
        { str: 'Einstein', transform: [1, 0, 0, 1, 120, 720] },
        { str: 'published the paper.', transform: [1, 0, 0, 1, 180, 720] },
      ],
    ]);

    const results = await doc.findText('Albert Einstein');
    expect(results).toHaveLength(1);
    expect(results[0].pageNumber).toBe(1);
    expect(results[0].snippet).toContain('Albert Einstein');
  });

  it('handles destroyed documents gracefully without throwing', async () => {
    const doc = createMockPdfDocument([[{ str: 'Some document content' }]]);
    await doc.destroy();
    const results = await doc.findText('document');
    expect(results).toEqual([]);
  });
});
