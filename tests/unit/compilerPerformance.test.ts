import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchPackageThrottled, type BundledPackageDef, type LoadedPackage } from '../../src/services/bundledPackages';
import { texEngine, type CompileInput } from '../../src/services/latexCompiler';

const ROOT = resolve(__dirname, '../..');
const SW_PATH = join(ROOT, 'public', 'sw.js');
const MAIN_PATH = join(ROOT, 'src', 'main.tsx');

describe('Stage 18 Compiler Performance & Optimization Pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    texEngine.terminate();
  });

  describe('High-Concurrency Package Hydration (Concurrency 16)', () => {
    it('fetches multiple packages in parallel with concurrency 16', async () => {
      let activeFetches = 0;
      let maxObservedConcurrency = 0;

      const mockItems: BundledPackageDef[] = Array.from({ length: 24 }, (_, i) => ({
        name: `test-pkg-${i}.sty`,
        format: 26,
      }));

      // Mock global fetch
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        activeFetches++;
        if (activeFetches > maxObservedConcurrency) {
          maxObservedConcurrency = activeFetches;
        }
        // Small artificial delay to verify concurrency overlap
        await new Promise((r) => setTimeout(r, 20));
        activeFetches--;

        const content = new TextEncoder().encode(`% package content for ${url}`);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/x-tex' }),
          arrayBuffer: async () => content.buffer,
        } as unknown as Response;
      });

      try {
        const loaded: LoadedPackage[] = [];
        const result = await fetchPackageThrottled(mockItems, 16, (pkg) => {
          loaded.push(pkg);
        });

        expect(result.length).toBe(24);
        expect(loaded.length).toBe(24);
        // Concurrency should have reached up to 16
        expect(maxObservedConcurrency).toBeGreaterThan(1);
        expect(maxObservedConcurrency).toBeLessThanOrEqual(16);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Pass-1 Instant Streaming Architecture', () => {
    it('accepts onIntermediateResult in CompileInput interface', () => {
      const input: CompileInput = {
        files: [
          {
            id: '1',
            name: 'main.tex',
            content: '\\documentclass{article}\\begin{document}Hello\\end{document}',
            type: 'tex',
          },
        ],
        onIntermediateResult: vi.fn(),
      };
      expect(typeof input.onIntermediateResult).toBe('function');
    });

    it('returns structured failure when no entry file exists without hanging', async () => {
      const intermediateSpy = vi.fn();
      const outcome = await texEngine.compile({
        files: [],
        onIntermediateResult: intermediateSpy,
      });

      expect(outcome.ok).toBe(false);
      expect(outcome.diagnostics[0]?.code).toBe('fatal');
      expect(intermediateSpy).not.toHaveBeenCalled();
    });
  });

  describe('Cold-Start Acceleration & Non-Blocking Prewarm', () => {
    it('main.tsx prewarms WASM engine immediately without 1200ms idle delay', () => {
      const mainCode = readFileSync(MAIN_PATH, 'utf8');
      expect(mainCode).toContain("texEngine.prewarm('pdflatex')");
      // Must NOT contain the old requestIdleCallback 1200ms timeout
      expect(mainCode).not.toContain('{ timeout: 1200 }');
    });

    it('sw.js precaches top core academic packages', () => {
      const swCode = readFileSync(SW_PATH, 'utf8');
      expect(swCode).toContain('/packages/IEEEtran.cls');
      expect(swCode).toContain('/packages/booktabs.sty');
      expect(swCode).toContain('/packages/microtype.sty');
      expect(swCode).toContain('/packages/cite.sty');
    });
  });
});
