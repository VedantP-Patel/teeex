import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BUNDLED_PACKAGES,
  BUNDLED_PACKAGE_NAMES,
  preloadDocumentPackages,
  deleteMissFromIndexedDb,
  openPackagesDb,
} from '../../src/services/bundledPackages';

describe('newtx Package Resolution and Upstream Fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers all newtx suite components in BUNDLED_PACKAGES', () => {
    const required = [
      'newtxtext.sty',
      'newtxmath.sty',
      'newtx.sty',
      'xpatch.sty',
      'mweights.sty',
      'binhex.tex',
      'xstring.sty',
      'xstring.tex',
      'fontaxes.sty',
      'fontaxes-v1.sty',
      'figureversions.sty',
    ];

    for (const name of required) {
      expect(BUNDLED_PACKAGE_NAMES.has(name), `${name} should be in BUNDLED_PACKAGE_NAMES`).toBe(true);
      const entry = BUNDLED_PACKAGES.find((p) => p.name === name);
      expect(entry?.format).toBe(26);
    }
  });

  it('preloads newtx packages and font metrics when document includes newtxtext', async () => {
    const texSource = `
      \\documentclass{article}
      \\usepackage{newtxtext}
      \\usepackage{microtype}
      \\begin{document}
      Hello NewTX
      \\end{document}
    `;

    // Mock fetch for bundled /packages/ endpoints
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/packages/newtxtext.sty')) {
        return new Response('\\ProvidesPackage{newtxtext}[2024/04/01 v1.744]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/microtype.sty')) {
        return new Response('\\ProvidesPackage{microtype}[2023/11/17 v3.1b]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('ot1ntxtlf.fd') || urlStr.includes('t1ntxtlf.fd')) {
        return new Response('\\ProvidesFile{ntxtlf.fd}', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('.tfm')) {
        return new Response(new Uint8Array([0, 1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'application/x-tex-tfm' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    try {
      const loaded = await preloadDocumentPackages(texSource, 'https://texlive.mock.local');
      const loadedNames = new Set(loaded.map((p) => p.name));

      expect(loadedNames.has('newtxtext.sty')).toBe(true);
      expect(loadedNames.has('microtype.sty')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('falls back to DEFAULT_UPSTREAM_ENDPOINT when primary endpoint returns 404', async () => {
    const texSource = `
      \\documentclass{article}
      \\usepackage{customfallbackpkg}
      \\begin{document}
      Fallback Test
      \\end{document}
    `;

    const attempts: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      attempts.push(urlStr);

      // Primary endpoint returns 404
      if (urlStr.startsWith('http://localhost:5173/api/texlive')) {
        return new Response('Not Found', { status: 404 });
      }

      // Upstream fallback endpoint returns valid package
      if (urlStr.startsWith('https://texlive2026.texlyre.org')) {
        return new Response('\\ProvidesPackage{customfallbackpkg}[2026/01/01]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }

      return new Response('Not Found', { status: 404 });
    });

    try {
      const loaded = await preloadDocumentPackages(texSource, 'http://localhost:5173/api/texlive');
      expect(loaded.length).toBe(1);
      expect(loaded[0]?.name).toBe('customfallbackpkg.sty');
      expect(attempts.some((u) => u.startsWith('http://localhost:5173/api/texlive'))).toBe(true);
      expect(attempts.some((u) => u.startsWith('https://texlive2026.texlyre.org'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('can delete misses from IndexedDB without throwing', async () => {
    await expect(deleteMissFromIndexedDb(['26/newtxtext.sty', '26/sample.sty'])).resolves.not.toThrow();
  });
});
