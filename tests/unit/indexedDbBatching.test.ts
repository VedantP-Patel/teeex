// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('IndexedDB Batch Writing with Relaxed Durability', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves cleanly on empty package list without creating transactions', async () => {
    const { saveBatchToIndexedDb } = await import('../../src/services/bundledPackages');
    await expect(saveBatchToIndexedDb([])).resolves.toBeUndefined();
  });

  it('saves batch of packages successfully into mocked transaction store', async () => {
    const putCalls: any[] = [];
    let transactionOptions: any = null;

    const mockStore = {
      put: vi.fn((item) => {
        putCalls.push(item);
      }),
    };

    const mockTx = {
      objectStore: vi.fn(() => mockStore),
      oncomplete: null as any,
      onerror: null as any,
    };

    const mockDb = {
      transaction: vi.fn((storeName: string, mode: string, options?: any) => {
        transactionOptions = options;
        setTimeout(() => {
          if (mockTx.oncomplete) mockTx.oncomplete();
        }, 0);
        return mockTx;
      }),
    };

    const origIndexedDB = window.indexedDB;
    try {
      const mockReq = {
        result: mockDb,
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
      };

      (window as any).indexedDB = {
        open: vi.fn(() => {
          setTimeout(() => {
            if (mockReq.onsuccess) mockReq.onsuccess({ target: mockReq });
          }, 0);
          return mockReq;
        }),
      };

      const { saveBatchToIndexedDb } = await import('../../src/services/bundledPackages');

      const pkgs = [
        {
          name: 'pkg-a.sty',
          format: 26,
          content: new Uint8Array([1, 2, 3]),
        },
        {
          name: 'pkg-b.cls',
          format: 26,
          content: new Uint8Array([4, 5, 6]),
        },
      ];

      await saveBatchToIndexedDb(pkgs);

      // Verify transaction was requested with relaxed durability
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(transactionOptions).toEqual({ durability: 'relaxed' });

      // Verify all packages were stored in the single batch transaction
      expect(mockStore.put).toHaveBeenCalledTimes(2);
      expect(putCalls[0].name).toBe('pkg-a.sty');
      expect(putCalls[1].name).toBe('pkg-b.cls');
    } finally {
      (window as any).indexedDB = origIndexedDB;
    }
  });

  it('falls back to standard transaction if relaxed durability option throws', async () => {
    const putCalls: any[] = [];
    let attempts = 0;

    const mockStore = {
      put: vi.fn((item) => {
        putCalls.push(item);
      }),
    };

    const mockTx = {
      objectStore: vi.fn(() => mockStore),
      oncomplete: null as any,
      onerror: null as any,
    };

    const mockDb = {
      transaction: vi.fn((storeName: string, mode: string, options?: any) => {
        attempts++;
        if (options && options.durability) {
          // Simulate older browser throwing on third options parameter
          throw new TypeError('Options not supported');
        }
        setTimeout(() => {
          if (mockTx.oncomplete) mockTx.oncomplete();
        }, 0);
        return mockTx;
      }),
    };

    const origIndexedDB = window.indexedDB;
    try {
      const mockReq = {
        result: mockDb,
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
      };

      (window as any).indexedDB = {
        open: vi.fn(() => {
          setTimeout(() => {
            if (mockReq.onsuccess) mockReq.onsuccess({ target: mockReq });
          }, 0);
          return mockReq;
        }),
      };

      const { saveBatchToIndexedDb } = await import('../../src/services/bundledPackages');

      const pkgs = [
        {
          name: 'fallback.sty',
          format: 26,
          content: new Uint8Array([7, 8, 9]),
        },
      ];

      await saveBatchToIndexedDb(pkgs);

      // Verified: First attempt with options threw, second attempt without options succeeded
      expect(attempts).toBe(2);
      expect(mockStore.put).toHaveBeenCalledTimes(1);
      expect(putCalls[0].name).toBe('fallback.sty');
    } finally {
      (window as any).indexedDB = origIndexedDB;
    }
  });
});
