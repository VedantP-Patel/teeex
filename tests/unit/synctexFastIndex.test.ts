import { describe, it, expect } from 'vitest';
import {
  findNearestLine,
  forwardSync,
  inverseSync,
  type SyncTexIndex,
  type SyncTexBox,
} from '../../src/services/synctex';

describe('SyncTeX Fast Indexing & Binary Search', () => {
  describe('findNearestLine', () => {
    const sorted = [10, 20, 30, 40, 50];

    it('returns exact match when target is present', () => {
      expect(findNearestLine(sorted, 10)).toBe(10);
      expect(findNearestLine(sorted, 30)).toBe(30);
      expect(findNearestLine(sorted, 50)).toBe(50);
    });

    it('returns closest line when target is between lines', () => {
      expect(findNearestLine(sorted, 12)).toBe(10);
      expect(findNearestLine(sorted, 18)).toBe(20);
      expect([20, 30]).toContain(findNearestLine(sorted, 25)); // 20 or 30 (equidistant diff 5)
      expect(findNearestLine(sorted, 34)).toBe(30);
      expect(findNearestLine(sorted, 38)).toBe(40);
    });

    it('clamps to bounds when target is outside range', () => {
      expect(findNearestLine(sorted, 1)).toBe(10);
      expect(findNearestLine(sorted, 100)).toBe(50);
    });

    it('returns null for empty array', () => {
      expect(findNearestLine([], 25)).toBeNull();
    });
  });

  describe('forwardSync with lineIndex', () => {
    const mockBox = (tag: number, line: number, page: number): SyncTexBox => ({
      kind: 'hbox',
      tag,
      line,
      column: 0,
      x: 72,
      y: 100 + line * 12,
      width: 200,
      height: 10,
      depth: 2,
    });

    const index: SyncTexIndex = {
      version: 1,
      files: new Map([
        [1, 'main.tex'],
        [2, 'chapters/intro.tex'],
      ]),
      pages: new Map([
        [1, [mockBox(1, 10, 1), mockBox(1, 20, 1)]],
        [2, [mockBox(1, 30, 2), mockBox(2, 5, 2)]],
      ]),
      lineIndex: new Map([
        [
          1,
          new Map([
            [10, [{ page: 1, box: mockBox(1, 10, 1) }]],
            [20, [{ page: 1, box: mockBox(1, 20, 1) }]],
            [30, [{ page: 2, box: mockBox(1, 30, 2) }]],
          ]),
        ],
        [
          2,
          new Map([[5, [{ page: 2, box: mockBox(2, 5, 2) }]]]),
        ],
      ]),
      sortedLines: new Map([
        [1, [10, 20, 30]],
        [2, [5]],
      ]),
    };

    it('resolves exact line in O(1)', () => {
      const match = forwardSync(index, 'main.tex', 20);
      expect(match).not.toBeNull();
      expect(match?.page).toBe(1);
      expect(match?.matchedLine).toBe(20);
      expect(match?.exact).toBe(true);
      expect(match?.rects.length).toBeGreaterThan(0);
    });

    it('finds nearest line on page when exact line is commented or blank', () => {
      const match = forwardSync(index, 'main.tex', 22);
      expect(match).not.toBeNull();
      expect(match?.page).toBe(1);
      expect(match?.matchedLine).toBe(20);
      expect(match?.exact).toBe(false);
    });

    it('navigates to the correct page for multi-page indexes', () => {
      const match = forwardSync(index, 'main.tex', 31);
      expect(match).not.toBeNull();
      expect(match?.page).toBe(2);
      expect(match?.matchedLine).toBe(30);
    });

    it('resolves secondary file lines correctly', () => {
      const match = forwardSync(index, 'chapters/intro.tex', 5);
      expect(match).not.toBeNull();
      expect(match?.page).toBe(2);
      expect(match?.matchedLine).toBe(5);
      expect(match?.exact).toBe(true);
    });

    it('returns null when file is not found in index', () => {
      expect(forwardSync(index, 'nonexistent.tex', 10)).toBeNull();
    });
  });

  describe('inverseSync with dense spatial pruning', () => {
    // Generate a dense page with 120 boxes spanning y from 50 to 650
    const boxes: SyncTexBox[] = [];
    for (let i = 0; i < 120; i++) {
      boxes.push({
        kind: 'hbox',
        tag: 1,
        line: i + 1,
        column: 0,
        x: 72,
        y: 50 + i * 5,
        width: 300,
        height: 8,
        depth: 2,
      });
    }

    const index: SyncTexIndex = {
      version: 1,
      files: new Map([[1, 'main.tex']]),
      pages: new Map([[1, boxes]]),
    };

    it('correctly maps coordinates on dense page to exact line', () => {
      // Click at x=100, y=100 (which corresponds to line ~10 with y=100)
      const match = inverseSync(index, 1, 100, 100);
      expect(match).not.toBeNull();
      expect(match?.file).toBe('main.tex');
      expect(match?.line).toBe(12); // Box with vertical center closest to y=100
    });

    it('gracefully handles clicks in bottom margin of dense page', () => {
      const match = inverseSync(index, 1, 100, 700);
      expect(match).not.toBeNull();
      expect(match?.file).toBe('main.tex');
      expect(match?.line).toBe(120); // Closest box at bottom
    });
  });
});
