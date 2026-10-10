/**
 * Teeex Studio — Publication PDF Export Service
 * Isolates the rendered academic document and triggers pristine print-to-PDF
 * with 100% pixel-perfect parity to the on-screen live preview.
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

  // Clone document sheet node
  const clone = element.cloneNode(true) as HTMLElement;

  // Remove any pulse/interaction highlight classes and outline borders from clone
  clone.querySelectorAll('.synctex-forward-pulse, .synctex-target').forEach(el => {
    el.classList.remove('synctex-forward-pulse');
  });

  // Remove UI-only page badge pills
  clone.querySelectorAll('.latex-page-pill-tag').forEach(el => {
    el.remove();
  });

  // Normalize clone inline styles to eliminate on-screen zoom transforms and match physical page
  clone.style.transform = 'none';
  clone.style.transformOrigin = 'unset';
  clone.style.margin = '0 auto';
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  clone.style.width = '210mm';
  clone.style.minHeight = '297mm';
  clone.style.maxWidth = '210mm';
  clone.style.padding = formatConfig.padding;
  clone.style.boxSizing = 'border-box';

  // Normalize all child discrete pages if present
  clone.querySelectorAll<HTMLElement>('.latex-paper-page').forEach(page => {
    page.style.transform = 'none';
    page.style.transformOrigin = 'unset';
    page.style.margin = '0 auto';
    page.style.boxShadow = 'none';
    page.style.borderRadius = '0';
    page.style.width = '210mm';
    page.style.minHeight = '297mm';
    page.style.maxHeight = '297mm';
    page.style.height = '297mm';
    page.style.pageBreakAfter = 'always';
    page.style.breakAfter = 'page';
    page.style.boxSizing = 'border-box';
  });

  // Create isolated hidden iframe for printing
  const iframe = document.createElement('iframe');
  iframe.id = 'teeex-pdf-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.zIndex = '-9999';

  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  // Extract KaTeX styles and fonts from parent document
  const headElements = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
    .map(el => el.outerHTML)
    .join('\n');

  const printHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title || 'LaTeX Document'}</title>
  ${headElements}
  <style>
    @page {
      size: A4 portrait;
      margin: 0; /* Sheet padding provides the authentic academic margins */
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
    }

    .latex-paper-sheet {
      width: 210mm !important;
      min-height: 297mm !important;
      max-width: 210mm !important;
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

    .paper-body {
      column-count: ${isTwoColumn ? 2 : 1} !important;
      column-gap: ${isTwoColumn ? formatConfig.columnGap : 'normal'} !important;
      column-rule: ${isTwoColumn && format === 'ieee' ? '1px solid #cbd5e1' : 'none'} !important;
      text-align: justify !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .paper-meta-header {
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6b7280;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 6px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    h1, h2, h3, h4, p, span, div, td, th {
      color: #000000 !important;
    }

    /* IEEE Roman section header styles */
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

    /* Prevent awkward equation or heading page-break splits */
    h1, h2, h3, .latex-section-heading {
      break-after: avoid !important;
      page-break-after: avoid !important;
    }

    .latex-math-display, .latex-figure-container, .table-container {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      margin: 12px 0 !important;
    }

    .latex-paper-page {
      width: 210mm !important;
      height: 297mm !important;
      min-height: 297mm !important;
      max-height: 297mm !important;
      padding: ${formatConfig.padding} !important;
      margin: 0 auto !important;
      box-sizing: border-box !important;
      page-break-after: always !important;
      break-after: page !important;
      overflow: hidden !important;
      background: #ffffff !important;
      box-shadow: none !important;
    }

    .latex-paper-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }

    .latex-page-break, .page-break {
      page-break-before: always !important;
      break-before: page !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      display: block !important;
    }

    .latex-page-pill-tag {
      display: none !important;
    }
  </style>
</head>
<body class="format-${format}">
  ${clone.outerHTML}
</body>
</html>
`;

  iframeDoc.open();
  iframeDoc.write(printHtml);
  iframeDoc.close();

  // Wait for KaTeX fonts/math to settle in iframe before invoking print
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.warn('Iframe print error, falling back to window.print', err);
      window.print();
    } finally {
      // Clean up iframe after print dialog closes
      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      }, 3000);
    }
  }, 400);
}
