import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BUNDLED_PACKAGES,
  BUNDLED_PACKAGE_NAMES,
  preloadDocumentPackages,
  deleteMissFromIndexedDb,
  getBundledPackages,
} from '../../src/services/bundledPackages';
import { toEngineFiles } from '../../src/services/texProject';

describe('xkeyval Suite Package Resolution and Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers all 7 xkeyval suite components in BUNDLED_PACKAGES', () => {
    const required = [
      'xkeyval.sty',
      'xkeyval.tex',
      'xkvutils.tex',
      'xkvtxhdr.tex',
      'keyval.tex',
      'xkvltxp.sty',
      'xkvview.sty',
    ];

    for (const name of required) {
      expect(BUNDLED_PACKAGE_NAMES.has(name), `${name} should be in BUNDLED_PACKAGE_NAMES`).toBe(true);
      const entry = BUNDLED_PACKAGES.find((p) => p.name === name);
      expect(entry?.format).toBe(26);
    }
  });

  it('preloads xkeyval suite packages when document declares \\usepackage{xkeyval}', async () => {
    const texSource = `
      \\documentclass[10pt,twocolumn,a4paper]{article}
      \\usepackage{xkeyval}
      \\flushbottom
      \\begin{document}
      Hello xkeyval
      \\end{document}
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/packages/xkeyval.sty')) {
        return new Response('\\ProvidesPackage{xkeyval}[2025/11/04 v2.10 package option processing]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/xkeyval.tex')) {
        return new Response('\\let\\XKeyValLoaded\\endinput\n\\input xkvutils\n\\input xkvtxhdr\n', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/xkvutils.tex')) {
        return new Response('\\let\\XKeyValUtilsLoaded\\endinput\n\\input keyval\n', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/xkvtxhdr.tex')) {
        return new Response('% xkvtxhdr.tex plain TeX headers\n', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/keyval.tex')) {
        return new Response('% keyval.tex\n', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/xkvltxp.sty')) {
        return new Response('\\ProvidesPackage{xkvltxp}[2025/11/04 v2.10]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/xkvview.sty')) {
        return new Response('\\ProvidesPackage{xkvview}[2025/11/04 v2.10]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    try {
      const loaded = await preloadDocumentPackages(texSource, 'https://teeex.pages.dev/api/texlive');
      const loadedNames = new Set(loaded.map((p) => p.name));

      expect(loadedNames.has('xkeyval.sty')).toBe(true);
      expect(loadedNames.has('xkeyval.tex')).toBe(true);
      expect(loadedNames.has('xkvutils.tex')).toBe(true);
      expect(loadedNames.has('keyval.tex')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('supports unbraced plain TeX \\input statements in dependency extraction', async () => {
    const texSource = `
      \\documentclass{article}
      \\input xkeyval \\fi
      \\begin{document}
      Unbraced input test
      \\end{document}
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/packages/xkeyval.tex')) {
        return new Response('\\let\\XKeyValLoaded\\endinput\n', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    try {
      const loaded = await preloadDocumentPackages(texSource, 'https://teeex.pages.dev/api/texlive');
      const loadedNames = new Set(loaded.map((p) => p.name));
      expect(loadedNames.has('xkeyval.tex')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('purges xkeyval misses from IndexedDB safely', async () => {
    await expect(
      deleteMissFromIndexedDb([
        '26/xkeyval.sty',
        '26/xkeyval.tex',
        '26/xkvutils.tex',
        '26/xkvtxhdr.tex',
        '26/keyval.tex',
      ])
    ).resolves.not.toThrow();
  });

  it('mounts companion files and extensionless aliases in toEngineFiles when xkeyval is declared', async () => {
    // Warm package memory cache
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/packages/xkeyval.sty')) {
        return new Response('\\ProvidesPackage{xkeyval}[2025/11/04]', { status: 200 });
      }
      if (urlStr.includes('/packages/xkeyval.tex')) {
        return new Response('\\let\\XKeyValLoaded\\endinput\n', { status: 200 });
      }
      if (urlStr.includes('/packages/xkvutils.tex')) {
        return new Response('\\let\\XKeyValUtilsLoaded\\endinput\n', { status: 200 });
      }
      return new Response('% ok', { status: 200 });
    });

    try {
      await getBundledPackages();

      const files = [
        {
          id: '1',
          name: 'main.tex',
          content: '\\documentclass{article}\n\\usepackage{xkeyval}\n\\begin{document}Hi\\end{document}',
          version: 1,
        },
      ];

      const engineFiles = toEngineFiles(files, 'main.tex');
      const paths = new Set(engineFiles.map((f) => f.path));

      expect(paths.has('xkeyval.sty'), 'Should have xkeyval.sty').toBe(true);
      expect(paths.has('xkeyval.tex'), 'Should have xkeyval.tex').toBe(true);
      expect(paths.has('xkeyval'), 'Should have extensionless xkeyval alias').toBe(true);
      expect(paths.has('xkvutils.tex'), 'Should have xkvutils.tex').toBe(true);
      expect(paths.has('xkvutils'), 'Should have extensionless xkvutils alias').toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
