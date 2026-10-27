import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function loadCompleteCss(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.replace(/@import\s+['"](\.\/[^'"]+)['"];/g, (_, rel) => {
    const resolved = path.resolve(path.dirname(filePath), rel);
    return fs.existsSync(resolved) ? loadCompleteCss(resolved) : '';
  });
}

describe('Design System W3C DTCG Tokens & A11y (src/index.css)', () => {
  const cssPath = path.resolve(__dirname, '../../src/index.css');
  const cssContent = loadCompleteCss(cssPath);

  it('defines 3-Tier Global Spacing scale (--space-*) conforming to 4px baseline', () => {
    const requiredSpacing = [
      '--space-0: 0px;',
      '--space-1: 4px;',
      '--space-2: 8px;',
      '--space-3: 12px;',
      '--space-4: 16px;',
      '--space-6: 24px;',
      '--space-8: 32px;',
      '--space-12: 48px;',
      '--space-16: 64px;',
    ];

    for (const token of requiredSpacing) {
      expect(cssContent).toContain(token);
    }
  });

  it('defines Typography scale (--font-size-*, --line-height-*)', () => {
    const requiredTypography = [
      '--font-size-2xs:',
      '--font-size-xs:',
      '--font-size-sm:',
      '--font-size-base:',
      '--font-size-lg:',
      '--font-size-xl:',
      '--font-size-2xl:',
      '--line-height-none: 1;',
      '--line-height-tight: 1.25;',
      '--line-height-normal: 1.5;',
      '--line-height-relaxed: 1.65;',
    ];

    for (const token of requiredTypography) {
      expect(cssContent).toContain(token);
    }
  });

  it('defines Authoritative Z-Index scale (--z-*)', () => {
    const requiredZ = [
      '--z-base: 1;',
      '--z-split-handle: 35;',
      '--z-dropdown: 50;',
      '--z-dock: 100;',
      '--z-toast: 500;',
      '--z-modal-backdrop: 1000;',
      '--z-modal: 1010;',
      '--z-command-palette: 2000;',
    ];

    for (const token of requiredZ) {
      expect(cssContent).toContain(token);
    }
  });

  it('defines Component Dimensions Tier 3 tokens', () => {
    const requiredDims = [
      '--navbar-height: 44px;',
      '--toolbar-height: 38px;',
      '--sidebar-width: 236px;',
      '--resizer-width: 5px;',
      '--dock-collapsed-height: 32px;',
      '--dock-expanded-height: 180px;',
    ];

    for (const token of requiredDims) {
      expect(cssContent).toContain(token);
    }
  });

  it('declares accessible :focus-visible rules with high contrast focus outline', () => {
    expect(cssContent).toContain(':focus-visible');
    expect(cssContent).toContain('outline: 2px solid var(--border-focus);');
    expect(cssContent).toContain('outline-offset: 2px;');
  });

  it('declares global prefers-reduced-motion media query to respect vestibular accessibility', () => {
    expect(cssContent).toContain('@media (prefers-reduced-motion: reduce)');
    expect(cssContent).toContain('animation-duration: 0.01ms !important;');
    expect(cssContent).toContain('transition-duration: 0.01ms !important;');
  });

  it('defines dual-theme obsidian dark and crisp slate light palettes', () => {
    // Dark default
    expect(cssContent).toContain('--bg-app: #080a0f;');
    expect(cssContent).toContain('--text-primary: #f1f5f9;');

    // Light mode
    expect(cssContent).toContain('[data-theme="light"]');
    expect(cssContent).toContain('--bg-app: #f1f5f9;');
    expect(cssContent).toContain('--text-primary: #0f172a;');
  });

  it('defines .panel-resizer styling with pointer-events and interactive state classes', () => {
    expect(cssContent).toContain('.panel-resizer');
    expect(cssContent).toContain('cursor: col-resize;');
    expect(cssContent).toContain('.panel-resizer:hover');
    expect(cssContent).toContain('.panel-resizer.is-dragging');
    expect(cssContent).toContain('.panel-resizer:focus-visible');
  });
});
