import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  inverseSync,
  normaliseTexPath,
  type SyncTexIndex,
  type SyncTexBox,
} from '../../src/services/synctex';
import {
  saveCompiledPdfSnapshot,
  loadCompiledPdfSnapshot,
  loadCompiledSnapshot,
} from '../../src/services/pdfSnapshotCache';

describe('Bidirectional SyncTeX — Inverse Search & Interaction (Stage 24)', () => {
  describe('Auxiliary Macro & Class Box Pruning in inverseSync', () => {
    it('does not allow .cls and .sty boxes to crowd out or displace user document boxes', () => {
      const clsBox: SyncTexBox = {
        kind: 'hbox',
        tag: 2, // article.cls
        line: 45,
        column: 0,
        x: 72,
        y: 100,
        width: 300,
        height: 10,
        depth: 2,
      };

      const userBox: SyncTexBox = {
        kind: 'hbox',
        tag: 1, // main.tex
        line: 25,
        column: 0,
        x: 72,
        y: 102,
        width: 300,
        height: 10,
        depth: 2,
      };

      const index: SyncTexIndex = {
        version: 1,
        files: new Map([
          [1, 'main.tex'],
          [2, '/usr/share/texmf/tex/latex/base/article.cls'],
          [3, '/usr/share/texmf/tex/latex/lm/lmodern.sty'],
        ]),
        pages: new Map([[1, [clsBox, userBox]]]),
      };

      const match = inverseSync(index, 1, 100, 101);
      expect(match).not.toBeNull();
      expect(match?.file).toBe('main.tex');
      expect(match?.line).toBe(25);
    });

    it('successfully matches user document box when dense .sty boxes surround the click point', () => {
      // 90 boxes from lmodern.sty clustered at y = 100..150
      const styBoxes: SyncTexBox[] = Array.from({ length: 90 }, (_, i) => ({
        kind: 'hbox' as const,
        tag: 2,
        line: i + 1,
        column: 0,
        x: 50,
        y: 100 + i * 0.5,
        width: 200,
        height: 8,
        depth: 2,
      }));

      // 1 user box from main.tex at y = 120
      const userBox: SyncTexBox = {
        kind: 'hbox',
        tag: 1,
        line: 42,
        column: 0,
        x: 72,
        y: 120,
        width: 400,
        height: 10,
        depth: 2,
      };

      const index: SyncTexIndex = {
        version: 1,
        files: new Map([
          [1, 'main.tex'],
          [2, 'lmodern.sty'],
        ]),
        pages: new Map([[1, [...styBoxes, userBox]]]),
      };

      const match = inverseSync(index, 1, 100, 120);
      expect(match).not.toBeNull();
      expect(match?.file).toBe('main.tex');
      expect(match?.line).toBe(42);
    });

    it('resolves multi-file project clicks accurately (sections/methods.tex)', () => {
      const introBox: SyncTexBox = {
        kind: 'hbox',
        tag: 2,
        line: 14,
        column: 0,
        x: 72,
        y: 80,
        width: 350,
        height: 10,
        depth: 2,
      };

      const methodsBox: SyncTexBox = {
        kind: 'hbox',
        tag: 3,
        line: 88,
        column: 0,
        x: 72,
        y: 200,
        width: 350,
        height: 10,
        depth: 2,
      };

      const index: SyncTexIndex = {
        version: 1,
        files: new Map([
          [1, 'main.tex'],
          [2, 'sections/intro.tex'],
          [3, 'sections/methods.tex'],
        ]),
        pages: new Map([[1, [introBox, methodsBox]]]),
      };

      const matchIntro = inverseSync(index, 1, 100, 80);
      expect(matchIntro?.file).toBe('sections/intro.tex');
      expect(matchIntro?.line).toBe(14);

      const matchMethods = inverseSync(index, 1, 100, 200);
      expect(matchMethods?.file).toBe('sections/methods.tex');
      expect(matchMethods?.line).toBe(88);
    });
  });

  describe('Path Normalization and File Resolution', () => {
    it('normalizes paths with leading ./ and slashes', () => {
      expect(normaliseTexPath('./main.tex')).toBe('main.tex');
      expect(normaliseTexPath('/sections/intro.tex')).toBe('sections/intro.tex');
      expect(normaliseTexPath('.\\chapters\\concl.tex')).toBe('chapters/concl.tex');
    });

    it('matches target file regardless of relative prefix format', () => {
      const files = [
        { id: 'f-1', name: 'main.tex', content: '', isEntry: true },
        { id: 'f-2', name: 'sections/intro.tex', content: '' },
      ];

      const resolveTarget = (fileFromSync: string) => {
        const cleanFile = normaliseTexPath(fileFromSync);
        return (
          files.find((f) => f.name === fileFromSync) ??
          files.find((f) => normaliseTexPath(f.name) === cleanFile) ??
          files.find((f) => f.name.endsWith(`/${cleanFile}`) || cleanFile.endsWith(`/${f.name}`)) ??
          files.find((f) => f.isEntry || f.name === 'main.tex')
        );
      };

      expect(resolveTarget('./main.tex')?.id).toBe('f-1');
      expect(resolveTarget('main.tex')?.id).toBe('f-1');
      expect(resolveTarget('./sections/intro.tex')?.id).toBe('f-2');
      expect(resolveTarget('intro.tex')?.id).toBe('f-2');
    });
  });

  describe('Stationary Click vs Drag-Selection Logic', () => {
    function shouldTriggerJump({
      clientX,
      clientY,
      downX,
      downY,
      hasSelection,
      isCtrlOrMeta,
      isLinkAnnotation,
    }: {
      clientX: number;
      clientY: number;
      downX: number;
      downY: number;
      hasSelection: boolean;
      isCtrlOrMeta: boolean;
      isLinkAnnotation: boolean;
    }): boolean {
      if (isLinkAnnotation) return false;
      const moved = Math.hypot(clientX - downX, clientY - downY);
      if ((moved > 6 || hasSelection) && !isCtrlOrMeta) {
        return false;
      }
      return true;
    }

    it('triggers inverse sync on a stationary click (< 6px movement, no text selection)', () => {
      const canJump = shouldTriggerJump({
        clientX: 100,
        clientY: 200,
        downX: 101,
        downY: 202,
        hasSelection: false,
        isCtrlOrMeta: false,
        isLinkAnnotation: false,
      });
      expect(canJump).toBe(true);
    });

    it('does NOT trigger jump when user drags to highlight text (movement > 6px)', () => {
      const canJump = shouldTriggerJump({
        clientX: 180,
        clientY: 200,
        downX: 100,
        downY: 200,
        hasSelection: false,
        isCtrlOrMeta: false,
        isLinkAnnotation: false,
      });
      expect(canJump).toBe(false);
    });

    it('does NOT trigger jump when native text selection is active', () => {
      const canJump = shouldTriggerJump({
        clientX: 100,
        clientY: 200,
        downX: 100,
        downY: 200,
        hasSelection: true,
        isCtrlOrMeta: false,
        isLinkAnnotation: false,
      });
      expect(canJump).toBe(false);
    });

    it('always triggers jump on Ctrl or Meta click even if text is selected', () => {
      const canJump = shouldTriggerJump({
        clientX: 100,
        clientY: 200,
        downX: 100,
        downY: 200,
        hasSelection: true,
        isCtrlOrMeta: true,
        isLinkAnnotation: false,
      });
      expect(canJump).toBe(true);
    });

    it('never triggers inverse sync jump when clicking on a link annotation', () => {
      const canJump = shouldTriggerJump({
        clientX: 100,
        clientY: 200,
        downX: 100,
        downY: 200,
        hasSelection: false,
        isCtrlOrMeta: false,
        isLinkAnnotation: true,
      });
      expect(canJump).toBe(false);
    });
  });

  describe('Persistent Snapshot Cache with SyncTeX Bytes', () => {
    const origIndexedDB = (globalThis as any).indexedDB;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      (globalThis as any).indexedDB = origIndexedDB;
    });

    it('saves and loads both PDF and SyncTeX bytes simultaneously', async () => {
      const memoryStore = new Map<string, any>();

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
        transaction: vi.fn(() => {
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
      const sampleSyncTex = new Uint8Array([83, 121, 110, 99, 84, 101, 88]); // SyncTeX

      await saveCompiledPdfSnapshot('proj-synctex', samplePdf, sampleSyncTex);

      const fullSnapshot = await loadCompiledSnapshot('proj-synctex');
      expect(fullSnapshot).not.toBeNull();
      expect(fullSnapshot?.pdf).toEqual(samplePdf);
      expect(fullSnapshot?.synctex).toEqual(sampleSyncTex);

      // Backwards-compatible loadCompiledPdfSnapshot returns only Uint8Array
      const pdfOnly = await loadCompiledPdfSnapshot('proj-synctex');
      expect(pdfOnly).toEqual(samplePdf);
    });
  });
});
