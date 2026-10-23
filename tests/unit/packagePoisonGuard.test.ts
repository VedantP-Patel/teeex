import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  BUNDLED_PACKAGES,
  isHtmlResponse,
  readResponseLimited,
  preloadDocumentPackages,
  MAX_PRELOADED_FILES,
  _resetPackageCachesForTesting,
} from '../../src/services/bundledPackages';

const ROOT = resolve(__dirname, '../..');
const PACKAGES_DIR = join(ROOT, 'public', 'packages');

describe('Stage 3: Package Poison Guard & In-Flight Coalescing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetPackageCachesForTesting();
  });

  afterEach(() => {
    vi.clearAllMocks();
    _resetPackageCachesForTesting();
  });

  describe('isHtmlResponse Detection', () => {
    it('isHtmlResponse detects text/html content-type header', () => {
      const dummyBuf = new Uint8Array([1, 2, 3]);
      expect(isHtmlResponse(dummyBuf, 'text/html')).toBe(true);
      expect(isHtmlResponse(dummyBuf, 'text/html; charset=utf-8')).toBe(true);
      expect(isHtmlResponse(dummyBuf, 'TEXT/HTML')).toBe(true);
      expect(isHtmlResponse(dummyBuf, 'application/octet-stream')).toBe(false);
      expect(isHtmlResponse(dummyBuf, 'text/plain')).toBe(false);
      expect(isHtmlResponse(dummyBuf, null)).toBe(false);
    });

    it('isHtmlResponse sniffs HTML markup even if content-type header is missing or octet-stream', () => {
      const htmlDoctype = new TextEncoder().encode('<!DOCTYPE html><html><body>Error</body></html>');
      const htmlFragment = new TextEncoder().encode('<html><head><title>404</title></head></html>');
      const validTex = new TextEncoder().encode('\\ProvidesPackage{mypkg}[2026/01/01]');
      const binaryTfm = new Uint8Array([0x00, 0x11, 0x00, 0x02, 0x5a, 0x6b]);

      expect(isHtmlResponse(htmlDoctype, 'application/octet-stream')).toBe(true);
      expect(isHtmlResponse(htmlFragment, undefined)).toBe(true);
      expect(isHtmlResponse(validTex, 'application/octet-stream')).toBe(false);
      expect(isHtmlResponse(binaryTfm, 'application/octet-stream')).toBe(false);
    });
  });

  describe('Streaming Remote Package Limits (readResponseLimited)', () => {
    it('rejects an oversized Content-Length immediately', async () => {
      const headers = new Headers({ 'content-length': (8 * 1024 * 1024 + 500).toString() });
      const mockRes = new Response(new Uint8Array([1, 2, 3]), { headers });

      await expect(readResponseLimited(mockRes, 8 * 1024 * 1024)).rejects.toThrow(
        /Content-Length.*exceeds limit/i
      );
    });

    it('rejects a streamed body that exceeds the 8 MiB cap', async () => {
      let chunkCount = 0;
      const stream = new ReadableStream({
        pull(controller) {
          if (chunkCount++ < 3) {
            controller.enqueue(new Uint8Array(3 * 1024 * 1024)); // 3 x 3 MiB = 9 MiB
          } else {
            controller.close();
          }
        },
      });

      const mockRes = new Response(stream);
      await expect(readResponseLimited(mockRes, 8 * 1024 * 1024)).rejects.toThrow(
        /exceeded limit.*while streaming/i
      );
    });
  });

  describe('In-Flight Request Deduplication', () => {
    it('makes only one network request for concurrent requests to the same package', async () => {
      let fetchCallCount = 0;
      const validPackageContent = new TextEncoder().encode('\\ProvidesPackage{concurrentpkg}\n');

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        fetchCallCount++;
        // Simulate a slight network delay
        await new Promise((resolve) => setTimeout(resolve, 30));
        return new Response(validPackageContent, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      });

      // Call preloadDocumentPackages twice simultaneously for the same remote package
      const doc = '\\usepackage{concurrentpkg}';
      const [res1, res2] = await Promise.all([
        preloadDocumentPackages(doc, 'https://mock.texlive.org'),
        preloadDocumentPackages(doc, 'https://mock.texlive.org'),
      ]);

      expect(fetchCallCount).toBe(1);
      expect(res1.length).toBe(1);
      expect(res2.length).toBe(1);
      expect(res1[0]?.name).toBe('concurrentpkg.sty');
      expect(res2[0]?.name).toBe('concurrentpkg.sty');
    });
  });

  describe('160-File Cap Budget Enforcement', () => {
    it('limits a document with 200 distinct imports to at most 160 prefetched files', async () => {
      // Generate document with 200 distinct packages
      const packages = Array.from({ length: 200 }, (_, i) => `pkg${i}`);
      const doc = `\\usepackage{${packages.join(',')}}`;

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        return new Response(new TextEncoder().encode('\\ProvidesPackage{stub}\n'), {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      });

      const results = await preloadDocumentPackages(doc, 'https://mock.texlive.org');
      expect(results.length).toBeLessThanOrEqual(MAX_PRELOADED_FILES);
      expect(results.length).toBe(160);
    });
  });

  describe('Transient Network Failures Remain Retryable', () => {
    it('does not permanently blacklist packages on 500 server error, allowing subsequent retries', async () => {
      let attempt = 0;
      const validContent = new TextEncoder().encode('\\ProvidesPackage{retrypkg}\n');

      global.fetch = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          // First attempt: Server returns 500 Internal Server Error
          return new Response('Internal Server Error', { status: 500 });
        }
        // Second attempt: Server recovers
        return new Response(validContent, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      });

      const doc = '\\usepackage{retrypkg}';

      // First run: fails to resolve package due to 500 error
      const firstRun = await preloadDocumentPackages(doc, 'https://mock.texlive.org');
      expect(firstRun.length).toBe(0);

      // Second run: succeeds and fetches the package because 500 was NOT permanently cached
      const secondRun = await preloadDocumentPackages(doc, 'https://mock.texlive.org');
      expect(secondRun.length).toBe(1);
      expect(secondRun[0]?.name).toBe('retrypkg.sty');
    });
  });

  describe('Essential Packages Registration in BUNDLED_PACKAGES', () => {
    it('lipsum.sty and lipsum.ltd are registered in BUNDLED_PACKAGES', () => {
      const lipsumSty = BUNDLED_PACKAGES.find((p) => p.name === 'lipsum.sty');
      const lipsumLtd = BUNDLED_PACKAGES.find((p) => p.name === 'lipsum.ltd');

      expect(lipsumSty, 'lipsum.sty must be registered').toBeDefined();
      expect(lipsumSty?.format).toBe(26);

      expect(lipsumLtd, 'lipsum.ltd must be registered').toBeDefined();
      expect(lipsumLtd?.format).toBe(26);
    });

    it('lipsum files are provisioned into public/packages/ with valid size', () => {
      const styPath = join(PACKAGES_DIR, 'lipsum.sty');
      const ltdPath = join(PACKAGES_DIR, 'lipsum.ltd');

      expect(existsSync(styPath), 'lipsum.sty must exist in public/packages/').toBe(true);
      expect(existsSync(ltdPath), 'lipsum.ltd must exist in public/packages/').toBe(true);

      expect(statSync(styPath).size).toBeGreaterThan(10_000);
      expect(statSync(ltdPath).size).toBeGreaterThan(50_000);
    });
  });
});
