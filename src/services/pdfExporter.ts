/**
 * Teeex Studio — Publication PDF Export Service
 *
 * Uses CSS @media print with proper page-break rules for pixel-perfect PDF output.
 * The preview and PDF now share the same rendering pipeline — no overflow:hidden,
 * no content clipping, and complete KaTeX math/font support in the print context.
 */

import { PAPER_FORMATS, type PaperFormatId } from './paperFormats';
import { dataUrlToUint8Array } from './virtualFileSystem';

export { dataUrlToUint8Array };

export interface ExportPdfOptions {
  title: string;
  element: HTMLElement | null;
  format?: PaperFormatId | string;
  isTwoColumn?: boolean;
}

export function exportDocumentAsPdf({
  title,
  element,
  format = 'ieee',
  isTwoColumn = true,
}: ExportPdfOptions): void {
  if (!element) {
    window.print();
    return;
  }

  const formatConfig = PAPER_FORMATS[(format as PaperFormatId)] || PAPER_FORMATS.ieee;

  // Clone the rendered document element for isolation
  const clone = element.cloneNode(true) as HTMLElement;

  // Strip UI-only elements from the clone
  clone.querySelectorAll('.synctex-forward-pulse, .synctex-target').forEach(el => {
    el.classList.remove('synctex-forward-pulse');
  });
  clone.querySelectorAll('.latex-page-pill-tag, .no-print').forEach(el => el.remove());

  // Remove all zoom/transform styles from the clone root and children
  clone.style.cssText = '';
  clone.style.transform = 'none';
  clone.style.transformOrigin = 'unset';

  // Normalize each discrete page for proper CSS printing.
  // IMPORTANT: Do NOT use overflow:hidden — it cuts content.
  // Instead, use page-break-after: always + let the browser PDF engine handle pagination.
  clone.querySelectorAll<HTMLElement>('.latex-paper-page').forEach((page, idx, all) => {
    page.style.cssText = '';
    page.style.width = '210mm';
    page.style.height = '297mm';
    page.style.maxHeight = '297mm';
    page.style.boxSizing = 'border-box';
    page.style.padding = formatConfig.padding;
    page.style.margin = '0';
    page.style.background = '#ffffff';
    page.style.display = 'flex';
    page.style.flexDirection = 'column';
    page.style.position = 'relative';
    page.style.overflow = 'hidden';
    // Last page does not need forced break
    if (idx < all.length - 1) {
      page.style.pageBreakAfter = 'always';
      page.style.breakAfter = 'page';
    }
    // Remove the decorative box-shadow for print
    page.style.boxShadow = 'none';
    page.style.borderRadius = '0';
  });

  // Extract all stylesheets from the parent document head
  const headLinks = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
    .map(el => el.outerHTML)
    .join('\n');

  const headStyles = Array.from(document.head.querySelectorAll('style'))
    .map(el => el.outerHTML)
    .join('\n');

  const printHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <base href="${window.location.origin}/" />
  <title>${escapeHtmlAttr(title || 'LaTeX Document')}</title>
  ${headLinks}
  ${headStyles}
  <style>
    /* ========== Teeex PDF Print Styles ========== */
    @page {
      size: A4 portrait;
      margin: 0;
    }

    *, *::before, *::after {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      width: 210mm !important;
      font-family: ${formatConfig.fontFamily};
      font-size: ${formatConfig.fontSize};
      line-height: ${formatConfig.lineHeight};
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* ---- Page sheet: each discrete page is exactly A4 ---- */
    .latex-paper-page {
      width: 210mm !important;
      height: 297mm !important;
      max-height: 297mm !important;
      padding: ${formatConfig.padding} !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      display: flex !important;
      flex-direction: column !important;
      position: relative !important;
      background: #ffffff !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      page-break-after: always !important;
      break-after: page !important;
      overflow: hidden !important;
    }

    .latex-paper-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }

    /* ---- Paper sheet (flow mode fallback) ---- */
    .latex-paper-sheet {
      width: 210mm !important;
      min-height: 297mm !important;
      padding: ${formatConfig.padding} !important;
      margin: 0 auto !important;
      box-shadow: none !important;
      border: none !important;
      transform: none !important;
      background: #ffffff !important;
      color: #000000 !important;
      box-sizing: border-box !important;
      font-family: ${formatConfig.fontFamily} !important;
      font-size: ${formatConfig.fontSize} !important;
      line-height: ${formatConfig.lineHeight} !important;
    }

    /* ---- Body columns ---- */
    .paper-body {
      flex: 1 !important;
      min-height: 0 !important;
      column-count: ${isTwoColumn ? 2 : 1} !important;
      column-gap: ${isTwoColumn ? formatConfig.columnGap : 'normal'} !important;
      column-rule: ${isTwoColumn && format === 'ieee' ? '1px solid #cbd5e1' : 'none'} !important;
      text-align: justify !important;
    }

    /* ---- Typography ---- */
    h1, h2, h3, h4, p, span, div, td, th, li, dt, dd {
      color: #000000 !important;
    }

    /* ---- IEEE Format Section Styles ---- */
    .format-ieee .latex-section {
      text-align: center;
      text-transform: uppercase;
      font-size: 11.5px;
      letter-spacing: 0.08em;
      margin: 18px 0 8px 0;
      font-weight: 700;
    }

    .format-ieee .latex-subsection {
      font-style: italic;
      font-weight: 600;
      font-size: 12px;
    }

    .format-ieee .latex-abstract {
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 10px;
    }

    /* ---- Page break controls ---- */
    h1, h2, h3, .latex-section-heading {
      break-after: avoid !important;
      page-break-after: avoid !important;
    }

    /* ---- Avoid splitting these blocks across pages ---- */
    .latex-math-display,
    .latex-figure-container,
    .table-container,
    .latex-floating-table,
    .latex-minipage-row,
    .latex-toc,
    .latex-algorithm,
    .latex-theorem,
    .latex-proof,
    .latex-verbatim-container,
    .latex-tcolorbox,
    .latex-bib-item {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    /* ---- Explicit page break ---- */
    .latex-page-break, .page-break {
      page-break-before: always !important;
      break-before: page !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      display: block !important;
    }

    /* ---- Hide UI-only elements ---- */
    .latex-page-pill-tag,
    .no-print {
      display: none !important;
    }

    /* ---- KaTeX math rendering ---- */
    .katex-display {
      margin: 0.5em 0 !important;
    }
    .katex { font-size: 1em !important; }

    /* ---- Tables ---- */
    .latex-table {
      border-collapse: collapse !important;
      width: 100%;
      font-size: ${formatConfig.fontSize};
    }
    .latex-table td, .latex-table th {
      padding: 3px 6px !important;
      border: 1px solid #9ca3af !important;
      color: #000000 !important;
    }
    .latex-table thead th {
      background-color: #f3f4f6 !important;
      font-weight: 700 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .table-booktabs td, .table-booktabs th {
      border-left: none !important;
      border-right: none !important;
    }

    /* ---- Abstract ---- */
    .latex-abstract {
      border: 1px solid #d1d5db !important;
      padding: 8px 12px !important;
      margin: 12px 0 !important;
      break-inside: avoid !important;
    }
    .latex-abstract-title {
      font-weight: 700 !important;
      font-size: 10px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.08em !important;
      margin-bottom: 4px !important;
      text-align: center !important;
    }

    /* ---- Theorem environments ---- */
    .latex-theorem {
      border-left: 3px solid #3b82f6;
      padding: 6px 10px;
      margin: 10px 0;
    }

    /* ---- TOC ---- */
    .latex-toc {
      margin: 12px 0;
    }
    .latex-toc-title {
      font-weight: 700;
      text-align: center;
      margin-bottom: 8px;
    }
    .latex-toc-item {
      display: flex;
      align-items: baseline;
    }
    .latex-toc-leader {
      flex: 1;
      border-bottom: 1px dotted #6b7280;
      margin: 0 4px;
      height: 1em;
    }

    /* ---- Verbatim/code ---- */
    .latex-verbatim-container {
      background: #f8fafc !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 4px !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  </style>
</head>
<body class="format-${format}">
  ${clone.outerHTML}
</body>
</html>`;

  // Create an isolated hidden iframe for printing
  const iframe = document.createElement('iframe');
  iframe.id = 'teeex-pdf-print-frame';
  iframe.style.cssText = `
    position: fixed;
    top: -10000px;
    left: -10000px;
    width: 1px;
    height: 1px;
    border: none;
    z-index: -9999;
    visibility: hidden;
  `;

  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  iframeDoc.open();
  iframeDoc.write(printHtml);
  iframeDoc.close();

  // Wait for KaTeX fonts + layout to fully settle before printing
  const printDelay = 600;

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.warn('[Teeex] Iframe print failed, falling back to window.print:', err);
      window.print();
    } finally {
      // Clean up the iframe after print dialog closes
      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      }, 4000);
    }
  }, printDelay);
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
