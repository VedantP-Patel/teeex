import { describe, it, expect } from 'vitest';
import type { PageGeometry } from '../../src/services/pdfRenderer';

const PAGE_GAP = 20;

function computePageOffsets(geometry: PageGeometry[], zoom: number): number[] {
  const out: number[] = [];
  let y = 0;
  for (const page of geometry) {
    out.push(y);
    y += page.height * zoom + PAGE_GAP;
  }
  return out;
}

function computeVisiblePages(
  geometry: PageGeometry[],
  offsets: number[],
  zoom: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = 1.5,
): { activePages: Set<number>; firstVisible: number } {
  if (geometry.length === 0) return { activePages: new Set(), firstVisible: 1 };

  const top = scrollTop;
  const viewH = Math.max(viewportHeight, 400);
  const bottom = top + viewH;
  const margin = viewH * overscan;

  const activePages = new Set<number>();
  let firstVisible = 1;

  for (let index = 0; index < geometry.length; index++) {
    const pageTop = offsets[index] ?? 0;
    const pageBottom = pageTop + geometry[index].height * zoom;

    if (pageBottom >= top - margin && pageTop <= bottom + margin) {
      activePages.add(geometry[index].pageNumber);
    }
    if (pageTop <= top + 60) {
      firstVisible = geometry[index].pageNumber;
    }
  }

  return { activePages, firstVisible };
}

describe('PDF Viewer Virtual Windowing & Page Offsets (Stage 3)', () => {
  const sample10Pages: PageGeometry[] = Array.from({ length: 10 }, (_, i) => ({
    pageNumber: i + 1,
    width: 612,
    height: 792,
    rotation: 0,
  }));

  it('computes exact monotonic page offsets including gap', () => {
    const zoom = 1;
    const offsets = computePageOffsets(sample10Pages, zoom);

    expect(offsets).toHaveLength(10);
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBe(792 + PAGE_GAP); // 812
    expect(offsets[2]).toBe(812 + 792 + PAGE_GAP); // 1624

    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
  });

  it('mounts only active pages within viewport + overscan margin (Stage 3 windowing)', () => {
    const zoom = 1;
    const offsets = computePageOffsets(sample10Pages, zoom);
    const viewportHeight = 800; // ~1 page visible

    // At top (scrollTop = 0): margin = 800 * 1.5 = 1200px
    const { activePages, firstVisible } = computeVisiblePages(
      sample10Pages,
      offsets,
      zoom,
      0,
      viewportHeight,
      1.5,
    );

    expect(firstVisible).toBe(1);
    expect(activePages.has(1)).toBe(true);
    expect(activePages.has(2)).toBe(true);
    expect(activePages.has(3)).toBe(true);
    // Pages far below must NOT be mounted
    expect(activePages.has(8)).toBe(false);
    expect(activePages.has(9)).toBe(false);
    expect(activePages.has(10)).toBe(false);
    expect(activePages.size).toBeLessThanOrEqual(4);
  });

  it('virtual window slides down when scrolled to middle page', () => {
    const zoom = 1;
    const offsets = computePageOffsets(sample10Pages, zoom);
    const viewportHeight = 800;

    // Scroll to Page 5 (offset ~3248)
    const scrollTarget = offsets[4]; // Page 5 top
    const { activePages, firstVisible } = computeVisiblePages(
      sample10Pages,
      offsets,
      zoom,
      scrollTarget,
      viewportHeight,
      1.5,
    );

    expect(firstVisible).toBe(5);
    // Page 1 and 2 must be unmounted and reclaimed
    expect(activePages.has(1)).toBe(false);
    expect(activePages.has(2)).toBe(false);

    // Active window should surround Page 5 (e.g. 4, 5, 6, 7)
    expect(activePages.has(5)).toBe(true);
    expect(activePages.size).toBeLessThanOrEqual(5);
  });

  it('handles zoom scaling on total layout height accurately', () => {
    const zoom = 1.5;
    const offsets = computePageOffsets(sample10Pages, zoom);

    // Page height at 1.5 zoom is 792 * 1.5 = 1188
    expect(offsets[1]).toBe(1188 + PAGE_GAP);

    const totalHeight = offsets[offsets.length - 1] + sample10Pages[9].height * zoom;
    expect(totalHeight).toBe(offsets[9] + 1188);
  });

  it('handles non-uniform mixed geometry (portrait + landscape)', () => {
    const mixedPages: PageGeometry[] = [
      { pageNumber: 1, width: 612, height: 792, rotation: 0 },
      { pageNumber: 2, width: 792, height: 612, rotation: 90 }, // Landscape page
      { pageNumber: 3, width: 612, height: 792, rotation: 0 },
    ];

    const offsets = computePageOffsets(mixedPages, 1);
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBe(792 + PAGE_GAP);
    expect(offsets[2]).toBe(792 + PAGE_GAP + 612 + PAGE_GAP);
  });
});
