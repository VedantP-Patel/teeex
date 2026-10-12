/**
 * Teeex — PDF export.
 *
 * Export writes out the exact bytes the TeX engine produced and the preview is
 * displaying. There is no second rendering path, so there is nothing for
 * export to get wrong.
 *
 * This replaces a DOM-print exporter that cloned the preview markup into an
 * iframe and called window.print() after a fixed 600 ms. That approach could
 * not work: the output depended on the user's print dialog (paper size,
 * margins, headers, scale), the delay raced webfont loading so line breaking
 * differed from the preview, and it re-derived layout from CSS instead of from
 * the document.
 */

/** Turns a project or document title into a safe, readable file name. */
export function pdfFileName(title: string): string {
  const base = title
    .normalize('NFKD')
    // Strip characters that are invalid in file names on any common platform.
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 120);

  return `${base || 'document'}.pdf`;
}

/**
 * Saves compiled PDF bytes to disk.
 *
 * Copies into a fresh buffer before wrapping in a Blob: the same bytes may be
 * held by the viewer, and transferring or detaching a shared ArrayBuffer here
 * would corrupt what is on screen.
 */
export function downloadPdf(bytes: Uint8Array, title: string): void {
  if (!bytes || bytes.byteLength === 0) {
    throw new Error('There is no compiled PDF to export yet.');
  }

  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);

  const blob = new Blob([owned as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = pdfFileName(title);
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoked on the next task so the navigation has started by then; doing it
    // synchronously cancels the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Opens the compiled PDF in a new tab, for printing or an external viewer. */
export function openPdfInNewTab(bytes: Uint8Array): void {
  if (!bytes || bytes.byteLength === 0) {
    throw new Error('There is no compiled PDF to open yet.');
  }

  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);

  const url = URL.createObjectURL(
    new Blob([owned as unknown as BlobPart], { type: 'application/pdf' }),
  );
  const opened = window.open(url, '_blank', 'noopener');

  if (!opened) {
    URL.revokeObjectURL(url);
    throw new Error('The browser blocked opening the PDF. Allow pop-ups for this site, or use Download instead.');
  }

  // The new tab owns the URL now; release our handle once it has loaded.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
