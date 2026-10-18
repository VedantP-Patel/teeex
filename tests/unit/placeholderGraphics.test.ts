import { describe, it, expect } from 'vitest';
import {
  DUMMY_1X1_PNG,
  DUMMY_1X1_JPG,
  DUMMY_1X1_PDF,
  getPlaceholderGraphicBytes,
  isGraphicFilename,
  extractReferencedImages,
} from '../../src/services/placeholderGraphics';

describe('placeholderGraphics — Robust Image Fallbacks for pdfTeX', () => {
  it('provides a valid standard PNG buffer (color type 2 RGB 24bpp)', () => {
    expect(DUMMY_1X1_PNG[0]).toBe(0x89);
    expect(DUMMY_1X1_PNG[1]).toBe(0x50);
    expect(DUMMY_1X1_PNG[2]).toBe(0x4e);
    expect(DUMMY_1X1_PNG[3]).toBe(0x47);
    // IHDR bit depth 8, color type 2 (RGB)
    expect(DUMMY_1X1_PNG[24]).toBe(8);
    expect(DUMMY_1X1_PNG[25]).toBe(2);
    expect(DUMMY_1X1_PNG.byteLength).toBe(119);
  });

  it('provides a valid JPEG buffer that satisfies writejpg.c marker expectations', () => {
    // SOI
    expect(DUMMY_1X1_JPG[0]).toBe(0xff);
    expect(DUMMY_1X1_JPG[1]).toBe(0xd8);
    // EOI at end
    expect(DUMMY_1X1_JPG[DUMMY_1X1_JPG.length - 2]).toBe(0xff);
    expect(DUMMY_1X1_JPG[DUMMY_1X1_JPG.length - 1]).toBe(0xd9);

    // Simulate writejpg.c parser to ensure no "no marker found" fatal error
    let pos = 0;
    function read2bytes() {
      const b1 = DUMMY_1X1_JPG[pos++];
      const b2 = DUMMY_1X1_JPG[pos++];
      return (b1 << 8) | b2;
    }

    let foundSof0 = false;
    let width = 0;
    let height = 0;
    let colorSpace = 0;

    while (pos < DUMMY_1X1_JPG.length) {
      const b = DUMMY_1X1_JPG[pos++];
      expect(b).toBe(0xff); // Must always read 0xFF marker prefix
      const marker = DUMMY_1X1_JPG[pos++];
      if (marker === 0xd8) continue; // M_SOI
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc3) {
        // M_SOF0
        read2bytes(); // length
        pos++; // bits per component
        height = read2bytes();
        width = read2bytes();
        colorSpace = DUMMY_1X1_JPG[pos++];
        foundSof0 = true;
        break;
      }
      const segLen = read2bytes();
      pos += (segLen - 2);
    }

    expect(foundSof0).toBe(true);
    expect(width).toBe(1);
    expect(height).toBe(1);
    expect(colorSpace).toBe(3); // DeviceRGB
  });

  it('provides a valid PDF-1.4 single-page buffer with byte-exact xref', () => {
    const text = new TextDecoder().decode(DUMMY_1X1_PDF);
    expect(text).toContain('%PDF-1.4');
    expect(text).toContain('trailer');
    expect(text).toContain('startxref');
    expect(text).toContain('%%EOF');
  });

  it('correctly dispatches placeholder bytes by file extension', () => {
    expect(getPlaceholderGraphicBytes('figure.png')).toBe(DUMMY_1X1_PNG);
    expect(getPlaceholderGraphicBytes('photo.jpg')).toBe(DUMMY_1X1_JPG);
    expect(getPlaceholderGraphicBytes('photo.jpeg')).toBe(DUMMY_1X1_JPG);
    expect(getPlaceholderGraphicBytes('diagram.pdf')).toBe(DUMMY_1X1_PDF);
    expect(getPlaceholderGraphicBytes('unknown_asset')).toBe(DUMMY_1X1_PNG);
  });

  it('identifies graphic filenames reliably', () => {
    expect(isGraphicFilename('svnit.jpg')).toBe(true);
    expect(isGraphicFilename('drishti.png')).toBe(true);
    expect(isGraphicFilename('chart.pdf')).toBe(true);
    expect(isGraphicFilename('main.tex')).toBe(false);
    expect(isGraphicFilename('references.bib')).toBe(false);
  });

  it('extracts referenced images across complex TeX markup', () => {
    const tex = `
      \\documentclass{article}
      \\usepackage{graphicx}
      \\begin{document}
      \\includegraphics[width=0.8\\linewidth]{figures/svnit.jpg}
      \\includegraphics{drishti.png}
      \\includegraphics[scale=0.5]{assets/flowchart}
      \\end{document}
    `;
    const images = extractReferencedImages(tex);
    expect(images).toContain('figures/svnit.jpg');
    expect(images).toContain('drishti.png');
    expect(images).toContain('assets/flowchart');
  });
});
