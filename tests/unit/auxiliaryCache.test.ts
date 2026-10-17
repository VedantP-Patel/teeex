import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveAuxiliaryArtifacts,
  loadAuxiliaryArtifacts,
  type AuxiliaryFileEntry,
} from '../../src/services/auxiliaryCache';

describe('Auxiliary Artifact Persistent Cache (Layer 5)', () => {
  const origIndexedDB = (globalThis as any).indexedDB;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (globalThis as any).indexedDB = origIndexedDB;
  });

  it('returns empty array when indexedDB is undefined', async () => {
    (globalThis as any).indexedDB = undefined;
    const res = await loadAuxiliaryArtifacts('proj-1');
    expect(res).toEqual([]);
  });

  it('gracefully resolves save when indexedDB is undefined', async () => {
    (globalThis as any).indexedDB = undefined;
    await expect(saveAuxiliaryArtifacts('proj-1', [])).resolves.toBeUndefined();
  });

  it('persists and restores auxiliary files (.aux, .bbl, .toc)', async () => {
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
        contains: (name: string) => name === 'aux_artifacts',
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

    const files: AuxiliaryFileEntry[] = [
      { path: 'main.aux', content: '\\relax \n\\citation{knuth1984}' },
      { path: 'main.bbl', content: '\\begin{thebibliography}{1}\n\\bibitem{knuth1984} Knuth\n\\end{thebibliography}' },
      { path: 'main.toc', content: '\\contentsline {section}{\\numberline {1}Introduction}{1}' },
    ];

    await saveAuxiliaryArtifacts('paper-project', files);
    expect(mockStore.put).toHaveBeenCalled();
    expect(txOptions).toEqual({ durability: 'relaxed' });

    const loaded = await loadAuxiliaryArtifacts('paper-project');
    expect(loaded).toHaveLength(3);
    expect(loaded.find((f) => f.path === 'main.aux')?.content).toContain('\\citation{knuth1984}');
    expect(loaded.find((f) => f.path === 'main.bbl')?.content).toContain('\\bibitem{knuth1984}');
  });

  it('returns empty array on cache miss', async () => {
    const mockStore = {
      get: vi.fn(() => {
        const req: any = { result: undefined };
        setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
        return req;
      }),
    };

    const mockDb: any = {
      objectStoreNames: { contains: () => true },
      transaction: vi.fn(() => ({
        objectStore: () => mockStore,
        oncomplete: null,
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

    const loaded = await loadAuxiliaryArtifacts('unknown-project');
    expect(loaded).toEqual([]);
  });
});
