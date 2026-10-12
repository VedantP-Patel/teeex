/**
 * Teeex — SyncTeX parser and bidirectional source ↔ page mapping.
 *
 * SyncTeX is the engine's own record of where every box it typeset came from.
 * It is the only accurate basis for source/preview synchronisation; matching
 * rendered text back to source by substring search — which this project did
 * previously, behind a "SyncTeX: Active" badge — silently fails on repeated
 * phrases, macro-generated text, math, and anything inside a table.
 *
 * Format reference: SyncTeX version 1, as emitted by pdfTeX/XeTeX/LuaTeX.
 *
 *   SyncTeX Version:1
 *   Input:<tag>:<path>
 *   Magnification:1000
 *   Unit:1
 *   X Offset:0
 *   Y Offset:0
 *   Content:
 *   {<page>                                  page begin
 *   [<tag>,<line>:<x>,<y>:<w>,<h>,<d>        vbox begin        ] end
 *   (<tag>,<line>:<x>,<y>:<w>,<h>,<d>        hbox begin        ) end
 *   h<tag>,<line>:<x>,<y>:<w>,<h>,<d>        void hbox
 *   v<tag>,<line>:<x>,<y>:<w>,<h>,<d>        void vbox
 *   k<tag>,<line>:<x>,<y>:<w>               kern
 *   g|x|$<tag>,<line>:<x>,<y>               glue / current / math
 *   }                                        page end
 *
 * All coordinates are TeX scaled points (65536 sp = 1 pt), measured from the
 * top-left of the page with y increasing downward — the opposite of PDF user
 * space, which is why viewers must convert rather than pass values through.
 */

const SP_PER_PT = 65536;

export interface SyncTexBox {
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
  /** Input tag → path, exactly as TeX recorded it. */
  files: Map<number, string>;
  /** Page number (1-based) → boxes on that page. */
  pages: Map<number, SyncTexBox[]>;
}

export interface ForwardMatch {
  page: number;
  rects: Rect[];
  /** The line actually matched, which may differ if `line` held no boxes. */
  matchedLine: number;
  exact: boolean;
}

export interface InverseMatch {
  file: string;
  line: number;
  column: number;
  /** True when the point fell inside a box rather than merely near one. */
  exact: boolean;
}

/** gzip magic; pdfTeX writes .synctex.gz unless asked for plain output. */
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

/**
 * Converts a TeX path as recorded in an Input line to a project-relative path.
 * TeX writes what it opened — `./main.tex`, `sections/intro.tex`, sometimes an
 * absolute path — none of which match project file names directly.
 */
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

/** sp → pt, applying the file's unit, magnification and offsets. */
function toPoints(value: number, scale: Scale, offset: number): number {
  return ((value * scale.unit + offset) / SP_PER_PT) * scale.magnification;
}

/**
 * Parses `<tag>,<line>[,<column>]` followed by optional `:<x>,<y>[:<w>,<h>,<d>]`.
 * Returns null for records that do not carry a source reference.
 */
function parseRecord(
  body: string,
  scale: Scale,
): SyncTexBox | null {
  // tag,line[,column][:x,y[:w,h,d]]
  const match = body.match(
    /^(\d+),(\d+)(?:,(\d+))?(?::(-?\d+),(-?\d+)(?::(-?\d+),(-?\d+),(-?\d+))?)?/,
  );
  if (!match) return null;

  const [, tag, line, column, x, y, width, height, depth] = match;

  // Records without coordinates (some glue/kern forms) cannot be positioned.
  if (x === undefined || y === undefined) return null;

  const rawWidth = width === undefined ? 0 : Number(width);
  const rawHeight = height === undefined ? 0 : Number(height);
  const rawDepth = depth === undefined ? 0 : Number(depth);

  return {
    tag: Number(tag),
    line: Number(line),
    column: column === undefined ? 0 : Number(column),
    x: toPoints(Number(x), scale, scale.xOffset),
    y: toPoints(Number(y), scale, scale.yOffset),
    // Dimensions are deltas, so offsets must not be applied to them.
    width: toPoints(rawWidth, scale, 0),
    height: toPoints(rawHeight, scale, 0),
    depth: toPoints(rawDepth, scale, 0),
  };
}

/** The visual extent of a box, in points from the page's top-left corner. */
export function boxToRect(box: SyncTexBox): Rect {
  // Width may be negative for right-to-left material; normalise so callers can
  // treat every rect as x,y,w,h with positive extents.
  const x = box.width < 0 ? box.x + box.width : box.x;
  const width = Math.abs(box.width);
  const top = box.y - Math.max(0, box.height);
  const height = Math.max(0, box.height) + Math.max(0, box.depth);

  return {
    x,
    y: top,
    width,
    // A zero-height box still needs to be clickable and visible.
    height: height > 0 ? height : 1,
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
        // Input:<tag>:<path> — the path may itself contain ':'.
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
        // Written in thousandths; 1000 means unscaled.
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
        // A page may legitimately appear more than once in the stream.
        const existing = pages.get(currentPage);
        pages.set(currentPage, existing ? existing.concat(boxes) : boxes);
      }
      currentPage = null;
      boxes = [];
      continue;
    }

    if (currentPage === null) continue;

    // Box-close markers and rules carry no source reference.
    if (marker === ']' || marker === ')' || marker === 'r') continue;

    if (
      marker === '[' ||
      marker === '(' ||
      marker === 'h' ||
      marker === 'v' ||
      marker === 'k' ||
      marker === 'g' ||
      marker === 'x' ||
      marker === '$'
    ) {
      const box = parseRecord(line.slice(1), scale);
      if (box) boxes.push(box);
    }
  }

  return { version, files, pages };
}

function tagFor(index: SyncTexIndex, file: string): number | null {
  const wanted = normaliseTexPath(file);

  for (const [tag, path] of index.files) {
    if (path === wanted) return tag;
  }
  // TeX may have recorded an absolute path for a file the project knows by a
  // relative one, so fall back to a suffix match on the full path segment.
  for (const [tag, path] of index.files) {
    if (path.endsWith(`/${wanted}`) || wanted.endsWith(`/${path}`)) return tag;
  }
  return null;
}

/**
 * Source → preview. Returns the page and highlight rectangles for a source
 * line, falling back to the nearest line that produced output — most source
 * lines (comments, blank lines, macro definitions) typeset nothing at all.
 */
export function forwardSync(
  index: SyncTexIndex,
  file: string,
  line: number,
): ForwardMatch | null {
  const tag = tagFor(index, file);
  if (tag === null) return null;

  let best: { page: number; boxes: SyncTexBox[]; line: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [page, boxes] of index.pages) {
    for (const box of boxes) {
      if (box.tag !== tag) continue;

      const distance = Math.abs(box.line - line);
      if (distance > bestDistance) continue;

      if (distance < bestDistance) {
        bestDistance = distance;
        best = { page, boxes: [box], line: box.line };
      } else if (best && best.page === page && box.line === best.line) {
        best.boxes.push(box);
      }
    }
  }

  if (!best) return null;

  return {
    page: best.page,
    rects: best.boxes.map(boxToRect),
    matchedLine: best.line,
    exact: bestDistance === 0,
  };
}

/**
 * Preview → source. `x`/`y` are points from the page's top-left corner.
 *
 * Prefers the smallest box containing the point, so clicking a word inside a
 * table cell resolves to that cell rather than the enclosing page box.
 */
export function inverseSync(
  index: SyncTexIndex,
  page: number,
  x: number,
  y: number,
): InverseMatch | null {
  const boxes = index.pages.get(page);
  if (!boxes || boxes.length === 0) return null;

  let containing: { box: SyncTexBox; area: number } | null = null;
  let nearest: { box: SyncTexBox; distance: number } | null = null;

  for (const box of boxes) {
    const rect = boxToRect(box);

    const insideX = x >= rect.x && x <= rect.x + rect.width;
    const insideY = y >= rect.y && y <= rect.y + rect.height;

    if (insideX && insideY) {
      const area = Math.max(rect.width, 1) * Math.max(rect.height, 1);
      if (!containing || area < containing.area) {
        containing = { box, area };
      }
      continue;
    }

    if (!containing) {
      const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.width));
      const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.height));
      const distance = Math.hypot(dx, dy);
      if (!nearest || distance < nearest.distance) {
        nearest = { box, distance };
      }
    }
  }

  const chosen = containing?.box ?? nearest?.box;
  if (!chosen) return null;

  const file = index.files.get(chosen.tag);
  if (!file) return null;

  return {
    file,
    line: chosen.line,
    column: chosen.column,
    exact: Boolean(containing),
  };
}
