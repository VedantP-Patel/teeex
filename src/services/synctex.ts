/**
 * Teeex — SyncTeX parser and accurate bidirectional source ↔ page mapping.
 */

const SP_PER_PT = 65536;

export type SyncTexNodeKind = 'hbox' | 'vbox' | 'point';

export interface SyncTexBox {
  kind: SyncTexNodeKind;
  tag: number;
  line: number;
  column: number;
  /** Points from the page's left edge. */
  x: number;
  /** Points from the page's top edge, at the box baseline. */
  y: number;
  width: number;
  height: number;
  depth: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SyncTexIndex {
  version: number;
  files: Map<number, string>;
  pages: Map<number, SyncTexBox[]>;
  /** Fast O(1) lookup by tag and source line */
  lineIndex?: Map<number, Map<number, Array<{ page: number; box: SyncTexBox }>>>;
  /** Sorted unique line numbers per tag for fast binary search */
  sortedLines?: Map<number, number[]>;
}

export interface ForwardMatch {
  page: number;
  rects: Rect[];
  matchedLine: number;
  exact: boolean;
}

export interface InverseMatch {
  file: string;
  line: number;
  column: number;
  exact: boolean;
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress SyncTeX output (DecompressionStream unavailable).');
  }
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function normaliseTexPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

interface Scale {
  unit: number;
  magnification: number;
  xOffset: number;
  yOffset: number;
}

function toPoints(value: number, scale: Scale, offset: number): number {
  return ((value * scale.unit + offset) / SP_PER_PT) * scale.magnification;
}

function parseRecord(
  kind: SyncTexNodeKind,
  body: string,
  scale: Scale,
): SyncTexBox | null {
  const match = body.match(
    /^(\d+),(\d+)(?:,(\d+))?(?::(-?\d+),(-?\d+)(?::(-?\d+),(-?\d+),(-?\d+))?)?/,
  );
  if (!match) return null;

  const [, tag, line, column, x, y, width, height, depth] = match;
  if (x === undefined || y === undefined) return null;

  const parsedLine = Number(line);
  if (!parsedLine || parsedLine <= 0) return null;

  const rawWidth = width === undefined ? 0 : Number(width);
  const rawHeight = height === undefined ? 0 : Number(height);
  const rawDepth = depth === undefined ? 0 : Number(depth);

  return {
    kind,
    tag: Number(tag),
    line: parsedLine,
    column: column === undefined ? 0 : Number(column),
    x: toPoints(Number(x), scale, scale.xOffset),
    y: toPoints(Number(y), scale, scale.yOffset),
    width: toPoints(rawWidth, scale, 0),
    height: toPoints(rawHeight, scale, 0),
    depth: toPoints(rawDepth, scale, 0),
  };
}

export function boxToRect(box: SyncTexBox): Rect {
  const x = box.width < 0 ? box.x + box.width : box.x;
  const width = Math.abs(box.width);
  // Point records (g, k, x, $) don't carry height; give them a standard 10pt line height above baseline
  const effectiveHeight = box.kind === 'point' && box.height === 0 ? 10 : Math.max(0, box.height);
  const effectiveDepth = box.kind === 'point' && box.depth === 0 ? 3 : Math.max(0, box.depth);
  const top = box.y - effectiveHeight;
  const height = effectiveHeight + effectiveDepth;

  return {
    x,
    y: top,
    width: width > 0 ? width : 8,
    height: height > 0 ? height : 12,
  };
}

export async function parseSyncTex(input: Uint8Array): Promise<SyncTexIndex> {
  const bytes = isGzip(input) ? await gunzip(input) : input;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

  const files = new Map<number, string>();
  const pages = new Map<number, SyncTexBox[]>();
  const scale: Scale = { unit: 1, magnification: 1, xOffset: 0, yOffset: 0 };

  let version = 1;
  let inContent = false;
  let currentPage: number | null = null;
  let boxes: SyncTexBox[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.length === 0) continue;

    if (!inContent) {
      if (line.startsWith('SyncTeX Version:')) {
        version = Number.parseInt(line.slice(16), 10) || 1;
        continue;
      }
      if (line.startsWith('Input:')) {
        const separator = line.indexOf(':', 6);
        if (separator !== -1) {
          const tag = Number.parseInt(line.slice(6, separator), 10);
          if (Number.isFinite(tag)) {
            files.set(tag, normaliseTexPath(line.slice(separator + 1)));
          }
        }
        continue;
      }
      if (line.startsWith('Magnification:')) {
        const value = Number.parseFloat(line.slice(14));
        if (Number.isFinite(value) && value > 0) scale.magnification = value / 1000;
        continue;
      }
      if (line.startsWith('Unit:')) {
        const value = Number.parseFloat(line.slice(5));
        if (Number.isFinite(value) && value > 0) scale.unit = value;
        continue;
      }
      if (line.startsWith('X Offset:')) {
        const value = Number.parseFloat(line.slice(9));
        if (Number.isFinite(value)) scale.xOffset = value;
        continue;
      }
      if (line.startsWith('Y Offset:')) {
        const value = Number.parseFloat(line.slice(9));
        if (Number.isFinite(value)) scale.yOffset = value;
        continue;
      }
      if (line === 'Content:') {
        inContent = true;
      }
      continue;
    }

    if (line.startsWith('Postamble:')) break;

    const marker = line[0];

    if (marker === '{') {
      const page = Number.parseInt(line.slice(1), 10);
      currentPage = Number.isFinite(page) ? page : null;
      boxes = [];
      continue;
    }

    if (marker === '}') {
      if (currentPage !== null && boxes.length > 0) {
        const existing = pages.get(currentPage);
        pages.set(currentPage, existing ? existing.concat(boxes) : boxes);
      }
      currentPage = null;
      boxes = [];
      continue;
    }

    if (currentPage === null) continue;
    if (marker === ']' || marker === ')' || marker === 'r') continue;

    if (marker === '(' || marker === 'h') {
      const box = parseRecord('hbox', line.slice(1), scale);
      if (box) boxes.push(box);
    } else if (marker === 'x' || marker === '$' || marker === 'g' || marker === 'k') {
      const box = parseRecord('point', line.slice(1), scale);
      if (box) boxes.push(box);
    } else if (marker === '[' || marker === 'v') {
      const box = parseRecord('vbox', line.slice(1), scale);
      if (box) boxes.push(box);
    }
  }

  // Build fast O(1) lineIndex and sorted line numbers for sub-millisecond forward lookup
  const lineIndex = new Map<number, Map<number, Array<{ page: number; box: SyncTexBox }>>>();

  for (const [page, pBoxes] of pages) {
    for (const box of pBoxes) {
      if (box.kind === 'vbox') continue;
      let fileMap = lineIndex.get(box.tag);
      if (!fileMap) {
        fileMap = new Map();
        lineIndex.set(box.tag, fileMap);
      }
      let lineList = fileMap.get(box.line);
      if (!lineList) {
        lineList = [];
        fileMap.set(box.line, lineList);
      }
      lineList.push({ page, box });
    }
  }

  const sortedLines = new Map<number, number[]>();
  for (const [tag, fileMap] of lineIndex) {
    const sorted = Array.from(fileMap.keys()).sort((a, b) => a - b);
    sortedLines.set(tag, sorted);
  }

  return { version, files, pages, lineIndex, sortedLines };
}

function tagFor(index: SyncTexIndex, file: string): number | null {
  const wanted = normaliseTexPath(file);

  for (const [tag, path] of index.files) {
    if (path === wanted) return tag;
  }
  for (const [tag, path] of index.files) {
    if (path.endsWith(`/${wanted}`) || wanted.endsWith(`/${path}`)) return tag;
  }
  return null;
}

export function findNearestLine(sorted: number[], target: number): number | null {
  if (sorted.length === 0) return null;
  let low = 0;
  let high = sorted.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const val = sorted[mid];
    if (val === target) return val;
    if (val < target) low = mid + 1;
    else high = mid - 1;
  }

  if (low >= sorted.length) return sorted[high];
  if (high < 0) return sorted[low];

  const diffLow = Math.abs(sorted[low] - target);
  const diffHigh = Math.abs(sorted[high] - target);
  return diffLow < diffHigh ? sorted[low] : sorted[high];
}

export function forwardSync(
  index: SyncTexIndex,
  file: string,
  line: number,
): ForwardMatch | null {
  const tag = tagFor(index, file);
  if (tag === null) return null;

  // 1. Fast O(1) / O(log N) lookup if lineIndex is available
  if (index.lineIndex && index.sortedLines) {
    const fileMap = index.lineIndex.get(tag);
    const sorted = index.sortedLines.get(tag);

    if (fileMap && sorted && sorted.length > 0) {
      let targetLine = line;
      let exact = fileMap.has(line);

      if (!exact) {
        const nearest = findNearestLine(sorted, line);
        if (nearest !== null) {
          targetLine = nearest;
        }
      }

      const entries = fileMap.get(targetLine);
      if (entries && entries.length > 0) {
        const page = entries[0].page;
        const pageEntries = entries.filter((e) => e.page === page);
        const hboxes = pageEntries.filter((e) => e.box.kind === 'hbox').map((e) => e.box);
        const rectBoxes = hboxes.length > 0 ? hboxes : pageEntries.map((e) => e.box);

        return {
          page,
          rects: rectBoxes.slice(0, 6).map(boxToRect),
          matchedLine: targetLine,
          exact,
        };
      }
    }
  }

  // 2. Fallback path for manually constructed mock indexes without lineIndex
  let best: { page: number; boxes: SyncTexBox[]; line: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [page, boxes] of index.pages) {
    for (const box of boxes) {
      if (box.tag !== tag || box.kind === 'vbox') continue;

      const distance = Math.abs(box.line - line);
      if (distance > bestDistance) continue;

      if (distance < bestDistance) {
        bestDistance = distance;
        best = { page, boxes: [box], line: box.line };
      } else if (best && best.page === page && box.line === best.line && box.kind === 'hbox') {
        best.boxes.push(box);
      }
    }
  }

  if (!best) return null;

  return {
    page: best.page,
    rects: best.boxes.slice(0, 6).map(boxToRect),
    matchedLine: best.line,
    exact: bestDistance === 0,
  };
}

function isAuxiliaryMacroFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith('.cls') ||
    lower.endsWith('.sty') ||
    lower.endsWith('.clo') ||
    lower.endsWith('.aux') ||
    lower.endsWith('.toc') ||
    lower.endsWith('.bbl') ||
    lower.endsWith('.blg') ||
    lower.endsWith('.out') ||
    lower.endsWith('.def') ||
    lower.endsWith('.ldf') ||
    lower.endsWith('.fd') ||
    lower.endsWith('.log')
  );
}

/**
 * Preview → source (`inverseSync`).
 * Matches horizontal text boxes (`hbox`) and inline nodes (`point`) on the clicked line,
 * heavily weighting vertical proximity (`dy`) so clicking a line of text always
 * resolves to that exact horizontal line rather than an enclosing vertical box.
 */
export function inverseSync(
  index: SyncTexIndex,
  page: number,
  x: number,
  y: number,
): InverseMatch | null {
  const boxes = index.pages.get(page);
  if (!boxes || boxes.length === 0) return null;

  // 1. Filter out internal class/package boxes BEFORE spatial pruning
  // so external .cls/.sty definitions do not crowd out user document text
  const validBoxes = boxes.filter((b) => {
    const file = index.files.get(b.tag);
    return file && !isAuxiliaryMacroFile(file);
  });

  // Prefer hbox and point records over vbox containers
  const pool = validBoxes.length > 0 ? validBoxes : boxes;
  const primaryBoxes = pool.filter((b) => b.kind !== 'vbox');
  const candidates = primaryBoxes.length > 0 ? primaryBoxes : pool;

  // Spatial candidate pruning on dense pages: only test boxes within vertical reach (80pt)
  let candidateList = candidates;
  if (candidates.length > 80) {
    const nearby = candidates.filter((b) => Math.abs(b.y - y) <= 80);
    if (nearby.length > 0) {
      candidateList = nearby;
    }
  }

  let bestContainingHbox: { box: SyncTexBox; score: number } | null = null;
  let bestNearest: { box: SyncTexBox; score: number } | null = null;

  for (const box of candidateList) {
    const file = index.files.get(box.tag);
    if (!file || isAuxiliaryMacroFile(file)) continue;

    const rect = boxToRect(box);

    // Expand hit box slightly for comfortable clicking on text lines and equations
    const insideX = x >= rect.x - 6 && x <= rect.x + rect.width + 6;
    const insideY = y >= rect.y - 3 && y <= rect.y + rect.height + 3;

    if (insideX && insideY && box.kind === 'hbox' && rect.width > 4 && rect.height < 80) {
      // Score by vertical distance to box vertical center + small area tie-breaker
      const centerY = rect.y + rect.height / 2;
      const score = Math.abs(y - centerY) * 10 + rect.height;
      if (!bestContainingHbox || score < bestContainingHbox.score) {
        bestContainingHbox = { box, score };
      }
    }

    const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.width));
    const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.height));
    // Weight vertical distance 6x higher than horizontal distance so clicking in the
    // margin or between words on a line still picks that exact line of text!
    const kindPenalty = box.kind === 'hbox' ? 0 : box.kind === 'point' ? 4 : 30;
    const distScore = dy * 6 + dx + kindPenalty;

    if (!bestNearest || distScore < bestNearest.score) {
      bestNearest = { box, score: distScore };
    }
  }

  const chosen = bestContainingHbox?.box ?? bestNearest?.box;
  if (!chosen) return null;

  const file = index.files.get(chosen.tag);
  if (!file) return null;

  return {
    file,
    line: chosen.line,
    column: chosen.column,
    exact: Boolean(bestContainingHbox),
  };
}