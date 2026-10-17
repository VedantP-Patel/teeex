import { describe, expect, it } from 'vitest';
import {
  boxToRect,
  forwardSync,
  inverseSync,
  normaliseTexPath,
  parseSyncTex,
} from '../../src/services/synctex';

const SP = 65536; // scaled points per point

/**
 * A minimal but structurally real SyncTeX v1 file.
 *
 * Page 1 holds two boxes from main.tex (lines 10 and 20) and one from
 * sections/intro.tex (line 5). Coordinates are in scaled points, measured from
 * the top-left of the page.
 */
function sampleSyncTex(): Uint8Array {
  const text = [
    'SyncTeX Version:1',
    'Input:1:./main.tex',
    'Input:2:./sections/intro.tex',
    'Output:pdf',
    'Magnification:1000',
    'Unit:1',
    'X Offset:0',
    'Y Offset:0',
    'Content:',
    '{1',
    // vbox spanning the text block
    `[1,1:${4 * SP},${700 * SP}:${500 * SP},${650 * SP},0`,
    // line 10 at (72, 100), 400pt wide, 10pt tall, 2pt deep
    `(1,10:${72 * SP},${100 * SP}:${400 * SP},${10 * SP},${2 * SP}`,
    ')',
    // line 20 at (72, 200)
    `(1,20:${72 * SP},${200 * SP}:${400 * SP},${10 * SP},${2 * SP}`,
    ')',
    // intro.tex line 5 at (72, 300)
    `(2,5:${72 * SP},${300 * SP}:${400 * SP},${10 * SP},0`,
    ')',
    ']',
    '}',
    '{2',
    `(1,40:${72 * SP},${100 * SP}:${400 * SP},${10 * SP},0`,
    ')',
    '}',
    'Postamble:',
    'Count:4',
    '',
  ].join('\n');

  return new TextEncoder().encode(text);
}

describe('normaliseTexPath', () => {
  it('strips the leading ./ TeX writes', () => {
    expect(normaliseTexPath('./main.tex')).toBe('main.tex');
  });

  it('normalises backslashes so Windows paths match project names', () => {
    expect(normaliseTexPath('sections\\intro.tex')).toBe('sections/intro.tex');
  });
});

describe('parseSyncTex', () => {
  it('reads the input map', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    expect(index.files.get(1)).toBe('main.tex');
    expect(index.files.get(2)).toBe('sections/intro.tex');
  });

  it('groups boxes by page', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    expect(index.pages.size).toBe(2);
    // Page 1: the vbox plus three hboxes.
    expect(index.pages.get(1)).toHaveLength(4);
    expect(index.pages.get(2)).toHaveLength(1);
  });

  it('converts scaled points to points', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    const box = index.pages.get(1)!.find((b) => b.line === 10)!;

    expect(box.x).toBeCloseTo(72, 5);
    expect(box.y).toBeCloseTo(100, 5);
    expect(box.width).toBeCloseTo(400, 5);
    expect(box.height).toBeCloseTo(10, 5);
    expect(box.depth).toBeCloseTo(2, 5);
  });

  it('applies magnification', async () => {
    const doubled = new TextEncoder().encode(
      new TextDecoder()
        .decode(sampleSyncTex())
        .replace('Magnification:1000', 'Magnification:2000'),
    );

    const index = await parseSyncTex(doubled);
    const box = index.pages.get(1)!.find((b) => b.line === 10)!;
    expect(box.x).toBeCloseTo(144, 5);
  });

  it('transparently handles gzipped output', async () => {
    const raw = sampleSyncTex();
    const gzipped = new Uint8Array(
      await new Response(
        new Blob([raw as unknown as BlobPart])
          .stream()
          .pipeThrough(new CompressionStream('gzip')),
      ).arrayBuffer(),
    );

    // pdfTeX writes .synctex.gz by default, so this is the common case.
    const index = await parseSyncTex(gzipped);
    expect(index.files.get(1)).toBe('main.tex');
    expect(index.pages.get(1)).toHaveLength(4);
  });

  it('ignores content after Postamble', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    expect(index.pages.has(3)).toBe(false);
  });

  it('returns an empty index for junk rather than throwing', async () => {
    const index = await parseSyncTex(new TextEncoder().encode('not synctex'));
    expect(index.pages.size).toBe(0);
    expect(index.files.size).toBe(0);
  });
});

describe('boxToRect', () => {
  it('places the rect above the baseline and spans height plus depth', () => {
    const rect = boxToRect({
      kind: 'h',
      tag: 1,
      line: 1,
      column: 0,
      x: 72,
      y: 100,
      width: 400,
      height: 10,
      depth: 2,
    });

    // The baseline is at y=100, so the box top is 10pt above it.
    expect(rect.y).toBeCloseTo(90, 5);
    expect(rect.height).toBeCloseTo(12, 5);
    expect(rect.x).toBeCloseTo(72, 5);
  });

  it('normalises a negative width to a positive extent', () => {
    const rect = boxToRect({
      kind: 'h',
      tag: 1,
      line: 1,
      column: 0,
      x: 100,
      y: 50,
      width: -40,
      height: 10,
      depth: 0,
    });

    expect(rect.x).toBeCloseTo(60, 5);
    expect(rect.width).toBeCloseTo(40, 5);
  });

  it('gives a zero-height box a clickable extent', () => {
    const rect = boxToRect({
      kind: 'h',
      tag: 1,
      line: 1,
      column: 0,
      x: 0,
      y: 0,
      width: 10,
      height: 0,
      depth: 0,
    });
    expect(rect.height).toBeGreaterThan(0);
  });
});

describe('forwardSync', () => {
  it('finds the page and rect for an exact source line', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    const match = forwardSync(index, 'main.tex', 20)!;

    expect(match.page).toBe(1);
    expect(match.exact).toBe(true);
    expect(match.matchedLine).toBe(20);
    expect(match.rects[0].y).toBeCloseTo(190, 5);
  });

  it('falls back to the nearest line that produced output', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    // Line 21 typeset nothing (a comment, say); line 20 is nearest.
    const match = forwardSync(index, 'main.tex', 21)!;

    expect(match.exact).toBe(false);
    expect(match.matchedLine).toBe(20);
  });

  it('resolves lines in an included file to that file only', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    const match = forwardSync(index, 'sections/intro.tex', 5)!;

    expect(match.exact).toBe(true);
    expect(match.rects[0].y).toBeCloseTo(290, 5);
  });

  it('matches a file TeX recorded under a longer path', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    expect(forwardSync(index, 'intro.tex', 5)).not.toBeNull();
  });

  it('returns null for a file the engine never read', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    expect(forwardSync(index, 'nowhere.tex', 1)).toBeNull();
  });
});

describe('inverseSync', () => {
  it('resolves a point inside a line box to that source line', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    // Inside the line-20 box: x in [72,472], y in [190,202].
    const match = inverseSync(index, 1, 200, 195)!;

    expect(match.file).toBe('main.tex');
    expect(match.line).toBe(20);
    expect(match.exact).toBe(true);
  });

  it('prefers the innermost box over the enclosing page box', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    const match = inverseSync(index, 1, 200, 95)!;

    // The line-10 hbox and the page vbox both contain this point; the smaller
    // one is the useful answer.
    expect(match.line).toBe(10);
  });

  it('attributes a click in an included file correctly', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    const match = inverseSync(index, 1, 100, 295)!;

    expect(match.file).toBe('sections/intro.tex');
    expect(match.line).toBe(5);
  });

  it('falls back to the nearest box for a click in a margin', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    const match = inverseSync(index, 2, 2000, 2000)!;

    expect(match.exact).toBe(false);
    expect(match.line).toBe(40);
  });

  it('returns null for a page with no records', async () => {
    const index = await parseSyncTex(sampleSyncTex());
    expect(inverseSync(index, 99, 10, 10)).toBeNull();
  });
});
