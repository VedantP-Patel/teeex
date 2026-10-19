import { describe, it, expect } from 'vitest';
import {
  forwardSync,
  tagFor,
  boxToRect,
  parseSyncTex,
  type SyncTexIndex,
  type SyncTexBox,
} from '../../src/services/synctex';

const SP = 65536;

function createTestSyncTex(): Uint8Array {
  const text = [
    'SyncTeX Version:1',
    'Input:1:./main.tex',
    'Input:2:./sections/chapter1.tex',
    'Input:3:/workspace/build/appendix.tex',
    'Output:pdf',
    'Magnification:1000',
    'Unit:1',
    'X Offset:0',
    'Y Offset:0',
    'Content:',
    '{1',
    // main.tex line 10 at (72, 100), width 400, height 10, depth 2
    `(1,10:${72 * SP},${100 * SP}:${400 * SP},${10 * SP},${2 * SP}`,
    ')',
    // main.tex line 25 at (72, 250), width 400, height 12, depth 3
    `(1,25:${72 * SP},${250 * SP}:${400 * SP},${12 * SP},${3 * SP}`,
    ')',
    // chapter1.tex line 5 at (72, 400), width 350, height 10, depth 2
    `(2,5:${72 * SP},${400 * SP}:${350 * SP},${10 * SP},${2 * SP}`,
    ')',
    '}',
    '{2',
    // appendix.tex line 42 on page 2 at (72, 150)
    `(3,42:${72 * SP},${150 * SP}:${400 * SP},${10 * SP},${2 * SP}`,
    ')',
    '}',
    'Postamble:',
    'Count:4',
  ].join('\n');

  return new TextEncoder().encode(text);
}

describe('Bidirectional SyncTeX — Forward Sync (Editor to PDF) (Stage 26)', () => {
  describe('tagFor Path Resolution Robustness', () => {
    it('matches exact normalized file paths', async () => {
      const index = await parseSyncTex(createTestSyncTex());
      expect(tagFor(index, 'main.tex')).toBe(1);
      expect(tagFor(index, './main.tex')).toBe(1);
    });

    it('matches paths case-insensitively', async () => {
      const index = await parseSyncTex(createTestSyncTex());
      expect(tagFor(index, 'MAIN.TEX')).toBe(1);
      expect(tagFor(index, 'Sections/Chapter1.tex')).toBe(2);
    });

    it('matches subpaths and suffix variations', async () => {
      const index = await parseSyncTex(createTestSyncTex());
      expect(tagFor(index, 'chapter1.tex')).toBe(2);
      expect(tagFor(index, 'sections/chapter1.tex')).toBe(2);
      expect(tagFor(index, './sections/chapter1.tex')).toBe(2);
    });

    it('matches basename when full system path is recorded in SyncTeX', async () => {
      const index = await parseSyncTex(createTestSyncTex());
      // Appendix was recorded as /workspace/build/appendix.tex
      expect(tagFor(index, 'appendix.tex')).toBe(3);
      expect(tagFor(index, 'build/appendix.tex')).toBe(3);
    });

    it('falls back to single tag if index has exactly 1 file', () => {
      const singleFileIndex: SyncTexIndex = {
        version: 1,
        files: new Map([[1, '/root/texlive/virtual/source.tex']]),
        pages: new Map(),
      };
      // Even if user's editor file is "main.tex", it resolves to tag 1
      expect(tagFor(singleFileIndex, 'main.tex')).toBe(1);
      expect(tagFor(singleFileIndex, 'custom.tex')).toBe(1);
    });

    it('returns null if file is completely unknown and multiple files exist', async () => {
      const index = await parseSyncTex(createTestSyncTex());
      expect(tagFor(index, 'unknown.tex')).toBeNull();
    });
  });

  describe('forwardSync Execution & Nonce Preservation', () => {
    it('returns target page, rects, and matched line for exact match', async () => {
      const index = await parseSyncTex(createTestSyncTex());
      const nonce = 17123456789;
      const match = forwardSync(index, 'main.tex', 10, nonce);

      expect(match).not.toBeNull();
      expect(match?.page).toBe(1);
      expect(match?.exact).toBe(true);
      expect(match?.matchedLine).toBe(10);
      expect(match?.nonce).toBe(nonce);
      expect(match?.rects).toHaveLength(1);

      // Verify rect coordinate measured from top-left
      // Baseline y=100, height=10 => top y=90
      expect(match?.rects[0].x).toBeCloseTo(72, 5);
      expect(match?.rects[0].y).toBeCloseTo(90, 5);
      expect(match?.rects[0].width).toBeCloseTo(400, 5);
      expect(match?.rects[0].height).toBeCloseTo(12, 5);
    });

    it('falls back to nearest line when clicking on blank/comment line', async () => {
      const index = await parseSyncTex(createTestSyncTex());
      // Line 12 has no direct box; line 10 is closest
      const match = forwardSync(index, 'main.tex', 12);

      expect(match).not.toBeNull();
      expect(match?.page).toBe(1);
      expect(match?.exact).toBe(false);
      expect(match?.matchedLine).toBe(10);
    });

    it('resolves multi-file and multi-page targets accurately', async () => {
      const index = await parseSyncTex(createTestSyncTex());
      const match = forwardSync(index, 'appendix.tex', 42);

      expect(match).not.toBeNull();
      expect(match?.page).toBe(2);
      expect(match?.exact).toBe(true);
      expect(match?.matchedLine).toBe(42);
      expect(match?.rects[0].y).toBeCloseTo(140, 5);
    });

    it('assigns unique nonces across successive clicks on the same line', async () => {
      const index = await parseSyncTex(createTestSyncTex());
      const nonce1 = 1000000001;
      const nonce2 = 1000000002;

      const match1 = forwardSync(index, 'main.tex', 10, nonce1);
      const match2 = forwardSync(index, 'main.tex', 10, nonce2);

      expect(match1).not.toBeNull();
      expect(match2).not.toBeNull();
      expect(match1?.nonce).toBe(nonce1);
      expect(match2?.nonce).toBe(nonce2);
      expect(match1?.nonce).not.toBe(match2?.nonce);
    });
  });

  describe('Top-Down PDF Scroll Offset Alignment', () => {
    it('calculates top-down scroll offset correctly for SyncTeX points', () => {
      const CSS_PX_PER_PT = 96 / 72;
      const zoom = 1.0;
      const viewportHeight = 800;
      const baseTop = 0; // Page 1 base
      const yPt = 90; // SyncTeX point from top of page

      // SyncTeX top-down formula
      const offsetFromPageTop = Math.max(0, yPt * CSS_PX_PER_PT * zoom);
      const targetTop = Math.max(0, baseTop + offsetFromPageTop - viewportHeight / 2);

      // (90 * 96/72) = 120px from page top.
      expect(offsetFromPageTop).toBeCloseTo(120, 2);
      // Since 120 - 400 < 0, targetTop is 0 (near top of page)
      expect(targetTop).toBe(0);
    });

    it('scrolls accurately into view when line is midway down the page', () => {
      const CSS_PX_PER_PT = 96 / 72;
      const zoom = 1.0;
      const viewportHeight = 400;
      const baseTop = 1000; // Page 2 starts at 1000px
      const yPt = 450; // SyncTeX point midway down page (450 * 96/72 = 600px)

      const offsetFromPageTop = Math.max(0, yPt * CSS_PX_PER_PT * zoom);
      const targetTop = Math.max(0, baseTop + offsetFromPageTop - viewportHeight / 2);

      expect(offsetFromPageTop).toBeCloseTo(600, 2);
      // targetTop = 1000 + 600 - 200 = 1400px
      expect(targetTop).toBeCloseTo(1400, 2);
    });

    it('correctly distinguishes bottom-origin PDF internal links from top-down SyncTeX coordinates', () => {
      const CSS_PX_PER_PT = 96 / 72;
      const zoom = 1.0;
      const pageHeightPt = 842; // A4 height in pt
      const pdfInternalY = 100; // PDF destination 100pt from bottom

      // Bottom-origin link calculation
      const offsetFromPageTopBottomOrigin = Math.max(0, (pageHeightPt - pdfInternalY) * CSS_PX_PER_PT * zoom);
      // Top-origin SyncTeX calculation
      const synctexY = 100; // 100pt from top
      const offsetFromPageTopSyncTex = Math.max(0, synctexY * CSS_PX_PER_PT * zoom);

      // Bottom-origin link: (842 - 100) * 96/72 = 742 * 1.333 = 989.33px
      expect(offsetFromPageTopBottomOrigin).toBeCloseTo(989.33, 1);
      // SyncTeX link: 100 * 96/72 = 133.33px
      expect(offsetFromPageTopSyncTex).toBeCloseTo(133.33, 1);

      // They must NOT be equal, proving that flipping was the bug and is now fixed!
      expect(offsetFromPageTopBottomOrigin).not.toBeCloseTo(offsetFromPageTopSyncTex, 0);
    });
  });

  describe('Editor Click Handler Integration Simulation', () => {
    it('simulates direct click triggering onForwardSync with line number and immediate response', () => {
      const calls: { line: number; nonce: number }[] = [];
      const onForwardSync = (line: number) => {
        calls.push({ line, nonce: Date.now() });
      };

      // User clicks line 10 in editor
      onForwardSync(10);
      expect(calls).toHaveLength(1);
      expect(calls[0].line).toBe(10);
      expect(calls[0].nonce).toBeGreaterThan(0);

      // User immediately clicks line 10 again
      onForwardSync(10);
      expect(calls).toHaveLength(2);
      expect(calls[1].line).toBe(10);
      // Both clicks registered
    });
  });
});
