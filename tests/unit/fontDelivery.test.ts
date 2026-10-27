import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const FONTS_DIR = join(ROOT, 'public', 'fonts');

const EXPECTED_FONTS = [
  'PlusJakartaSans-Variable.woff2',
  'JetBrainsMono-Variable.woff2',
  'JetBrainsMono-Italic-Variable.woff2',
  'Newsreader-Variable.woff2',
  'Newsreader-Italic-Variable.woff2',
];

function loadCompleteCss(filePath: string): string {
  const content = readFileSync(filePath, 'utf8');
  return content.replace(/@import\s+['"](\.\/[^'"]+)['"];/g, (_, rel) => {
    const resolved = resolve(join(ROOT, 'src'), rel);
    return existsSync(resolved) ? loadCompleteCss(resolved) : '';
  });
}

describe('Self-Hosted Typography & Zero-Leak Delivery (S4g)', () => {
  it('all 5 WOFF2 variable font files exist in public/fonts/', () => {
    for (const font of EXPECTED_FONTS) {
      const p = join(FONTS_DIR, font);
      expect(existsSync(p), `Font ${font} must exist on disk`).toBe(true);
    }
  });

  it('all font files contain valid WOFF2 binary magic header (0x77 0x4F 0x46 0x32)', () => {
    for (const font of EXPECTED_FONTS) {
      const p = join(FONTS_DIR, font);
      const buf = readFileSync(p);
      expect(buf.length).toBeGreaterThan(15_000);

      // WOFF2 magic number is ASCII 'wOF2'
      expect(buf[0], `${font} byte 0`).toBe(0x77); // 'w'
      expect(buf[1], `${font} byte 1`).toBe(0x4f); // 'O'
      expect(buf[2], `${font} byte 2`).toBe(0x46); // 'F'
      expect(buf[3], `${font} byte 3`).toBe(0x32); // '2'
    }
  });

  it('total typography footprint is under 250 KB', () => {
    let totalBytes = 0;
    for (const font of EXPECTED_FONTS) {
      totalBytes += statSync(join(FONTS_DIR, font)).size;
    }
    const totalKb = totalBytes / 1024;
    expect(totalKb).toBeGreaterThan(170);
    expect(totalKb).toBeLessThan(250);
  });

  it('src/index.css defines local @font-face rules with font-display: swap', () => {
    const css = loadCompleteCss(join(ROOT, 'src', 'index.css'));

    expect(css).toContain("font-family: 'Plus Jakarta Sans'");
    expect(css).toContain("url('/fonts/PlusJakartaSans-Variable.woff2')");

    expect(css).toContain("font-family: 'JetBrains Mono'");
    expect(css).toContain("url('/fonts/JetBrainsMono-Variable.woff2')");
    expect(css).toContain("url('/fonts/JetBrainsMono-Italic-Variable.woff2')");

    expect(css).toContain("font-family: 'Newsreader'");
    expect(css).toContain("url('/fonts/Newsreader-Variable.woff2')");
    expect(css).toContain("url('/fonts/Newsreader-Italic-Variable.woff2')");

    expect(css).toContain('font-display: swap');
  });

  it('index.html contains strictly 0 external Google Fonts links or preconnects', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
  });
});
