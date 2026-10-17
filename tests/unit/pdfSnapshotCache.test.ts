import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveCompiledPdfSnapshot, loadCompiledPdfSnapshot } from '../../src/services/pdfSnapshotCache';

describe('PDF Snapshot Persistent Cache (Layer 1)', () => {
  const origIndexedDB = (globalThis as any).indexedDB;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (globalThis as any).indexedDB = origIndexedDB;
  });

  it('gracefully returns null if indexedDB is not available', async () => {
    (globalThis as any).indexedDB = undefined;
    const result = await loadCompiledPdfSnapshot('proj-123');
    expect(result).toBeNull();
  });

  it('gracefully handles save when indexedDB is undefined', async () => {
    (globalThis as any).indexedDB = undefined;
    const dummyPdf = new Uint8Array([37, 80, 68, 70]); // %PDF
    await expect(saveCompiledPdfSnapshot('proj-123', dummyPdf)).resolves.toBeUndefined();
  });

  it('saves and retrieves PDF snapshots accurately with relaxed durability', async () => {
    const memoryStore = new Map<string, any>();
    let txOptions: any = null;

    const mockStore = {
      put: vi.fn((val: any) => {
        memoryStore.set(val.projectId, val);
        const req: any = { result: undefined };
        setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
        return req;
      }),
      get: vi.fn((key: string) => {
        const item = memoryStore.get(key);
        const req: any = { result: item };
        setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
        return req;
      }),
    };

    const mockDb: any = {
      objectStoreNames: {
        contains: (name: string) => name === 'pdf_snapshots' || name === 'aux_artifacts',
      },
      createObjectStore: vi.fn(),
      transaction: vi.fn((_stores: string[], _mode: string, options?: any) => {
        txOptions = options;
        const tx: any = {
          objectStore: () => mockStore,
          oncomplete: null,
          onerror: null,
        };
        setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
        return tx;
      }),
    };

    const mockOpenReq: any = {
      result: mockDb,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };

    (globalThis as any).indexedDB = {
      open: vi.fn(() => {
        setTimeout(() => mockOpenReq.onsuccess && mockOpenReq.onsuccess({ target: mockOpenReq }), 0);
        return mockOpenReq;
      }),
    };

    const samplePdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]); // %PDF-1.7
    await saveCompiledPdfSnapshot('project-alpha', samplePdf);

    expect(mockStore.put).toHaveBeenCalled();
    expect(txOptions).toEqual({ durability: 'relaxed' });

    const retrieved = await loadCompiledPdfSnapshot('project-alpha');
    expect(retrieved).not.toBeNull();
    expect(retrieved).toEqual(samplePdf);
  });

  it('returns null on a cache miss', async () => {
    const mockStore = {
      get: vi.fn(() => {
        const req: any = { result: undefined };
        setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
        return req;
      }),
    };

    const mockDb: any = {
      objectStoreNames: {
        contains: () => true,
      },
      transaction: vi.fn(() => ({
        objectStore: () => mockStore,
        oncomplete: null,
        onerror: null,
      })),
    };

    const mockOpenReq: any = {
      result: mockDb,
      onsuccess: null,
    };

    (globalThis as any).indexedDB = {
      open: vi.fn(() => {
        setTimeout(() => mockOpenReq.onsuccess && mockOpenReq.onsuccess({ target: mockOpenReq }), 0);
        return mockOpenReq;
      }),
    };

    const result = await loadCompiledPdfSnapshot('non-existent-proj');
    expect(result).toBeNull();
  });
});
