// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerServiceWorker,
  requestPersistentStorage,
  checkEngineCacheStatus,
} from '../../src/services/serviceWorker';

describe('Service Worker & Persistent Cache Manager (Stage 8)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('requestPersistentStorage()', () => {
    it('requests persistent storage when navigator.storage.persist is available', async () => {
      const persistMock = vi.fn().mockResolvedValue(true);
      const persistedMock = vi.fn().mockResolvedValue(false);

      Object.defineProperty(window.navigator, 'storage', {
        value: {
          persist: persistMock,
          persisted: persistedMock,
        },
        writable: true,
        configurable: true,
      });

      const granted = await requestPersistentStorage();
      expect(granted).toBe(true);
      expect(persistMock).toHaveBeenCalledTimes(1);
    });

    it('returns false safely when storage API is not supported in environment', async () => {
      Object.defineProperty(window.navigator, 'storage', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const granted = await requestPersistentStorage();
      expect(granted).toBe(false);
    });
  });

  describe('checkEngineCacheStatus()', () => {
    it('detects cached WASM and Data from CacheStorage', async () => {
      const matchMock = vi.fn().mockImplementation((req: string) => {
        if (req.includes('busytex.wasm')) {
          return Promise.resolve(new Response(new Uint8Array(100)));
        }
        if (req.includes('texlive-basic.data')) {
          return Promise.resolve(new Response(new Uint8Array(200)));
        }
        return Promise.resolve(undefined);
      });

      const openMock = vi.fn().mockResolvedValue({
        match: matchMock,
      });

      Object.defineProperty(window, 'caches', {
        value: {
          open: openMock,
          keys: vi.fn().mockResolvedValue(['teeex-engine-v1.4.0']),
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(window.navigator, 'storage', {
        value: {
          persisted: vi.fn().mockResolvedValue(true),
          estimate: vi.fn().mockResolvedValue({ usage: 140000000, quota: 2000000000 }),
        },
        writable: true,
        configurable: true,
      });

      const status = await checkEngineCacheStatus();

      expect(status.hasWasm).toBe(true);
      expect(status.hasData).toBe(true);
      expect(status.isEngineCached).toBe(true);
      expect(status.persistedStorage).toBe(true);
      expect(status.cachedBytes).toBe(140000000);
    });

    it('flags partial cache when WASM is cached but data is missing', async () => {
      const matchMock = vi.fn().mockImplementation((req: string) => {
        if (req.includes('busytex.wasm')) {
          return Promise.resolve(new Response(new Uint8Array(100)));
        }
        return Promise.resolve(undefined);
      });

      Object.defineProperty(window, 'caches', {
        value: {
          open: vi.fn().mockResolvedValue({ match: matchMock }),
          keys: vi.fn().mockResolvedValue(['teeex-engine-v1.4.0']),
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(window.navigator, 'storage', {
        value: {
          persisted: vi.fn().mockResolvedValue(false),
          estimate: vi.fn().mockResolvedValue({ usage: 32505856, quota: 1000000000 }),
        },
        writable: true,
        configurable: true,
      });

      const status = await checkEngineCacheStatus();

      expect(status.hasWasm).toBe(true);
      expect(status.hasData).toBe(false);
      expect(status.isEngineCached).toBe(false);
    });
  });

  describe('registerServiceWorker()', () => {
    it('registers sw.js when serviceWorker is present in navigator', async () => {
      const registerMock = vi.fn().mockResolvedValue({
        addEventListener: vi.fn(),
      });

      Object.defineProperty(window.navigator, 'serviceWorker', {
        value: {
          register: registerMock,
          addEventListener: vi.fn(),
        },
        writable: true,
        configurable: true,
      });

      const reg = await registerServiceWorker();
      expect(registerMock).toHaveBeenCalledWith('/sw.js', { scope: '/' });
      expect(reg).not.toBeNull();
    });
  });
});
