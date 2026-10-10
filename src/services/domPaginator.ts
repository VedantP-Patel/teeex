/**
 * Teeex Studio — DOM-Based True Paginator
 *
 * This module provides pixel-accurate pagination by actually rendering
 * the HTML into a hidden off-screen container and measuring real element heights
 * using the browser's own layout engine. This produces correct pagination that
 * matches the PDF output, unlike heuristic height-estimation approaches.
 */

/** A4 page dimensions in pixels at 96 DPI */
const A4_HEIGHT_PX = 1122; // 297mm at 96dpi
const A4_WIDTH_PX = 794;   // 210mm at 96dpi

export interface PaginationOptions {
  /** The HTML content to paginate */
  html: string;
  /** Body content area height in px (A4 height minus header/footer/padding) */
  pageContentHeight: number;
  /** Whether two-column layout is active */
  isTwoCol: boolean;
  /** Whether the first page has an academic header section consuming extra space */
  hasAcademicHeader: boolean;
  /** Estimated header height in px for first page reduction */
  academicHeaderHeight: number;
  /** Paper padding in CSS string like "18mm 16mm" */
  padding: string;
  /** Font family for measurement container */
  fontFamily: string;
  /** Font size for measurement container */
  fontSize: string;
  /** Line height for measurement container */
  lineHeight: number;
  /** Column gap if two-column */
  columnGap: string;
}

/**
 * Parses a CSS padding shorthand like "18mm 16mm" to vertical padding in px
 */
function parsePaddingVertical(padding: string): number {
  const parts = padding.trim().split(/\s+/);
  const topStr = parts[0] || '0';
  return cssLengthToPx(topStr) * 2; // top + bottom
}

/**
 * Parses a CSS padding shorthand like "18mm 16mm" to horizontal padding in px
 */
function parsePaddingHorizontal(padding: string): number {
  const parts = padding.trim().split(/\s+/);
  const sideStr = parts[1] || parts[0] || '0';
  return cssLengthToPx(sideStr) * 2; // left + right
}

function cssLengthToPx(val: string): number {
  const num = parseFloat(val);
  if (isNaN(num)) return 0;
  if (val.endsWith('mm')) return num * 3.7795275591;
  if (val.endsWith('cm')) return num * 37.795275591;
  if (val.endsWith('in')) return num * 96;
  if (val.endsWith('pt')) return num * 1.3333333;
  if (val.endsWith('em')) return num * 16;
  if (val.endsWith('rem')) return num * 16;
  if (val.endsWith('px')) return num;
  return num;
}

/**
 * Creates a hidden measurement container in the document body.
 * This container mirrors the actual rendering environment so measurements are accurate.
 */
function createMeasurementContainer(opts: PaginationOptions): HTMLDivElement {
  const hPad = parsePaddingHorizontal(opts.padding);
  const innerContentWidth = Math.max(300, A4_WIDTH_PX - hPad);

  const container = document.createElement('div');
  container.id = 'teeex-paginator-measurement-zone';
  container.style.cssText = `
    position: fixed;
    top: -9999px;
    left: -9999px;
    visibility: hidden;
    pointer-events: none;
    z-index: -99999;
    width: ${innerContentWidth}px;
    box-sizing: border-box;
    font-family: ${opts.fontFamily};
    font-size: ${opts.fontSize};
    line-height: ${opts.lineHeight};
    color: #111827;
    background: #ffffff;
  `;
  document.body.appendChild(container);
  return container;
}

/**
 * Measures the rendered height of an HTML block by inserting it into a
 * hidden measurement container with the correct page content width.
 */
function measureBlockHeight(
  container: HTMLDivElement,
  blockHtml: string,
  columnCount: number,
  columnGap: string
): number {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    column-count: ${columnCount};
    column-gap: ${columnGap};
    width: 100%;
    box-sizing: border-box;
    overflow: visible;
  `;
  wrapper.innerHTML = blockHtml;
  container.appendChild(wrapper);

  // Force layout computation
  const height = wrapper.getBoundingClientRect().height || wrapper.offsetHeight;
  container.removeChild(wrapper);
  return Math.ceil(height);
}

/**
 * Core DOM-based pagination function.
 *
 * This function:
 * 1. Inserts HTML blocks into a hidden off-screen container
 * 2. Measures their actual rendered pixel heights
 * 3. Distributes blocks across pages based on real measurements
 *
 * Result is a list of HTML strings, one per page.
 */
export function paginateByDom(opts: PaginationOptions): string[] {
  // Split the HTML string at explicit page-break markers
  const explicitChunks = opts.html.split(/<div class="latex-page-break"[^>]*><\/div>/gi);

  // If no content, return empty
  if (!opts.html.trim()) return [''];

  const pages: string[] = [];
  const verticalPaddingPx = parsePaddingVertical(opts.padding);
  const baseContentHeight = opts.pageContentHeight > 0
    ? opts.pageContentHeight
    : A4_HEIGHT_PX - verticalPaddingPx;

  const columnCount = opts.isTwoCol ? 2 : 1;

  // Create measurement container
  let measureContainer: HTMLDivElement | null = null;
  try {
    measureContainer = createMeasurementContainer(opts);
  } catch {
    // DOM not available (SSR/test env) — fall back to rough estimates
    return explicitChunks.map(c => c.trim()).filter(c => c.length > 0);
  }

  try {
    for (let ci = 0; ci < explicitChunks.length; ci++) {
      const chunk = explicitChunks[ci].trim();
      if (!chunk) continue;

      // Titlepage gets its own page as-is
      if (chunk.includes('latex-titlepage')) {
        pages.push(chunk);
        continue;
      }

      // Extract top-level HTML blocks from this chunk
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = chunk;
      const topLevelNodes = Array.from(tempDiv.childNodes);

      const blockHtmls: string[] = [];
      for (const node of topLevelNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim() || '';
          if (text) blockHtmls.push(`<p class="latex-paragraph">${text}</p>`);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          blockHtmls.push((node as HTMLElement).outerHTML);
        }
      }

      if (blockHtmls.length === 0) {
        pages.push(chunk);
        continue;
      }

      // Determine content height for this chunk's first page
      const isFirstChunk = ci === 0;
      const firstPageContentHeight = isFirstChunk && opts.hasAcademicHeader
        ? baseContentHeight - opts.academicHeaderHeight
        : baseContentHeight;

      let currentPageBlocks: string[] = [];
      let currentHeight = 0;
      let isFirstPage = pages.length === 0;

      for (const blockHtml of blockHtmls) {
        // Measure this block
        const blockHeight = measureBlockHeight(
          measureContainer,
          blockHtml,
          columnCount,
          opts.columnGap
        );

        const pageCapacity = (isFirstPage && isFirstChunk)
          ? firstPageContentHeight
          : baseContentHeight;

        if (currentHeight + blockHeight > pageCapacity && currentPageBlocks.length > 0) {
          // Flush current page
          pages.push(currentPageBlocks.join('\n'));
          currentPageBlocks = [blockHtml];
          currentHeight = blockHeight;
          isFirstPage = false;
        } else {
          currentPageBlocks.push(blockHtml);
          currentHeight += blockHeight;
        }
      }

      // Flush last page of this chunk
      if (currentPageBlocks.length > 0) {
        pages.push(currentPageBlocks.join('\n'));
      }
    }
  } finally {
    // Always clean up measurement container
    if (measureContainer && measureContainer.parentNode) {
      measureContainer.parentNode.removeChild(measureContainer);
    }
  }

  return pages.length > 0 ? pages : [opts.html];
}

/**
 * Heuristic-based fallback paginator used when DOM is unavailable.
 * This is the fast path used on first render before DOM measurements are available.
 * It's intentionally conservative (slightly under-fills pages) to avoid content overflow.
 */
export function paginateByHeuristic(
  html: string,
  isTwoCol: boolean,
  hasTitlePage: boolean,
  academicHeaderHeight: number = 200
): string[] {
  if (!html) return [''];

  const explicitChunks = html.split(/<div class="latex-page-break"[^>]*><\/div>/gi);
  const finalPages: string[] = [];

  // A4 at 96dpi is 1122px. Minus typical padding (~108px each side), ≈906px content.
  // With 2-col layout, text height is roughly doubled due to column distribution.
  const baseCapacity = isTwoCol ? 1700 : 900;

  for (let cIdx = 0; cIdx < explicitChunks.length; cIdx++) {
    const chunk = explicitChunks[cIdx].trim();
    if (!chunk) continue;

    if (chunk.includes('latex-titlepage')) {
      finalPages.push(chunk);
      continue;
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = chunk;
    const blockHtmls: string[] = [];
    for (const node of Array.from(tempDiv.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim() || '';
        if (text) blockHtmls.push(`<p class="latex-paragraph">${text}</p>`);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        blockHtmls.push((node as HTMLElement).outerHTML);
      }
    }

    if (blockHtmls.length === 0) {
      finalPages.push(chunk);
      continue;
    }

    const isFirstChunk = cIdx === 0 && !hasTitlePage;
    let currentPageBlocks: string[] = [];
    let currentHeight = 0;
    let pageCapacity = isFirstChunk
      ? baseCapacity - academicHeaderHeight
      : baseCapacity;

    for (const blockHtml of blockHtmls) {
      const blockHeight = estimateBlockHeight(blockHtml, isTwoCol);

      if (currentHeight + blockHeight > pageCapacity && currentPageBlocks.length > 0) {
        finalPages.push(currentPageBlocks.join('\n'));
        currentPageBlocks = [blockHtml];
        currentHeight = blockHeight;
        pageCapacity = baseCapacity;
      } else {
        currentPageBlocks.push(blockHtml);
        currentHeight += blockHeight;
      }
    }

    if (currentPageBlocks.length > 0) {
      finalPages.push(currentPageBlocks.join('\n'));
    }
  }

  return finalPages.length > 0 ? finalPages : [html];
}

/**
 * Estimates block height from HTML string without DOM measurement.
 * More accurate than before but still heuristic-based.
 */
function estimateBlockHeight(blockHtml: string, isTwoCol: boolean): number {
  const col = isTwoCol ? 2 : 1;
  const avgLineHeight = 19; // px per line of text at 12px font

  // Try to extract text content length for paragraph height estimation
  const textContent = blockHtml.replace(/<[^>]+>/g, '').trim();
  const textLen = textContent.length;

  // Classify block type
  if (blockHtml.startsWith('<h2') || blockHtml.includes('class="latex-section"')) {
    return 55 + (textLen > 40 ? avgLineHeight : 0);
  }
  if (blockHtml.startsWith('<h3') || blockHtml.includes('class="latex-subsection"')) {
    return 38;
  }
  if (blockHtml.startsWith('<h4') || blockHtml.includes('class="latex-subsubsection"')) {
    return 28;
  }
  if (blockHtml.includes('latex-figure-container')) {
    // Figures: detect if there's an actual image vs placeholder
    const hasImg = blockHtml.includes('<img ');
    return hasImg ? 260 : 120;
  }
  if (blockHtml.includes('latex-math-display')) {
    // Count KaTeX elements (each line ≈ 35px)
    const lines = (blockHtml.match(/class="base"/g) || []).length || 1;
    return 20 + lines * 35;
  }
  if (blockHtml.includes('latex-abstract')) {
    const lines = Math.max(3, Math.ceil(textLen / (col === 2 ? 50 : 85)));
    return 55 + lines * avgLineHeight;
  }
  if (blockHtml.includes('latex-floating-table') || blockHtml.startsWith('<table') || blockHtml.includes('table-container')) {
    const rows = (blockHtml.match(/<tr/gi) || []).length;
    return 45 + rows * 28 + (blockHtml.includes('latex-table-caption') ? 25 : 0);
  }
  if (blockHtml.includes('latex-minipage-row')) {
    return 220;
  }
  if (blockHtml.includes('latex-toc')) {
    const items = (blockHtml.match(/latex-toc-item/g) || []).length;
    return 48 + items * 22;
  }
  if (blockHtml.includes('latex-algorithm')) {
    const lines = (blockHtml.match(/latex-alg-line/g) || []).length;
    return 55 + lines * 20;
  }
  if (blockHtml.includes('latex-theorem') || blockHtml.includes('latex-proof')) {
    const lines = Math.max(2, Math.ceil(textLen / (col === 2 ? 50 : 80)));
    return 50 + lines * avgLineHeight;
  }
  if (blockHtml.includes('latex-verbatim')) {
    const codeLines = (blockHtml.match(/\n/g) || []).length;
    return 40 + codeLines * 18;
  }
  if (blockHtml.includes('latex-tcolorbox') || blockHtml.includes('latex-quote')) {
    const lines = Math.max(2, Math.ceil(textLen / (col === 2 ? 50 : 80)));
    return 30 + lines * avgLineHeight;
  }
  if (blockHtml.includes('latex-vspace-neg')) {
    const mMatch = blockHtml.match(/margin-top:\s*(-?[0-9.]+)(px|pt|mm|cm|in|em)/i);
    if (mMatch) {
      const val = parseFloat(mMatch[1]);
      const unit = mMatch[2].toLowerCase();
      const px = unit === 'pt' ? val * 1.333 : unit === 'mm' ? val * 3.78 : unit === 'cm' ? val * 37.8 : unit === 'in' ? val * 96 : unit === 'em' ? val * 16 : val;
      return Math.min(0, px);
    }
    return 0;
  }
  if (blockHtml.includes('latex-vspace') || blockHtml.includes('latex-vfill')) {
    const hMatch = blockHtml.match(/height:\s*([0-9.]+)(px|pt|mm|cm|in|em)/i);
    if (hMatch) {
      const val = parseFloat(hMatch[1]);
      const unit = hMatch[2].toLowerCase();
      const px = unit === 'pt' ? val * 1.333 : unit === 'mm' ? val * 3.78 : unit === 'cm' ? val * 37.8 : unit === 'in' ? val * 96 : unit === 'em' ? val * 16 : val;
      return Math.max(0, Math.ceil(px));
    }
    return 18;
  }
  if (blockHtml.startsWith('<ul') || blockHtml.startsWith('<ol') || blockHtml.startsWith('<dl')) {
    const items = (blockHtml.match(/<(?:li|dt)/gi) || []).length;
    return 12 + items * 22;
  }
  if (blockHtml.includes('latex-bibliography')) {
    const items = (blockHtml.match(/latex-bib-item/g) || []).length;
    return 40 + items * 24;
  }
  if (blockHtml.startsWith('<blockquote')) {
    const lines = Math.max(2, Math.ceil(textLen / (col === 2 ? 55 : 85)));
    return 20 + lines * avgLineHeight;
  }

  // Default: paragraph height estimation based on text length and column width
  if (textLen === 0) return 6;
  const charsPerLine = col === 2 ? 65 : 100;
  const estimatedLines = Math.max(1, Math.ceil(textLen / charsPerLine));
  return estimatedLines * avgLineHeight + 4; // +4 for paragraph margin
}
