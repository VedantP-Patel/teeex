import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  BUNDLED_PACKAGES,
  BUNDLED_PACKAGE_NAMES,
  preloadDocumentPackages,
} from '../../src/services/bundledPackages';
import { toEngineFiles, type ProjectFile } from '../../src/services/texProject';

describe('xkeyval Transitive Resolution and Miss Poisoning Protection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('transensitively extracts and preloads xkeyval suite when only newtxtext is declared', async () => {
    // Document with only newtxtext, NO explicit xkeyval
    const mainTex = `
      \\documentclass[10pt,twocolumn,a4paper]{article}
      \\usepackage[T1]{fontenc}
      \\usepackage{newtxtext}
      \\begin{document}
      Hello NewTX
      \\end{document}
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      const fileName = urlStr.split('/').pop() || '';
      const localPath = path.resolve(__dirname, '../../public/packages', fileName);
      if (fs.existsSync(localPath)) {
        const data = fs.readFileSync(localPath);
        return new Response(data, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      return new Response('Not found', { status: 404 });
    });

    try {
      const loaded = await preloadDocumentPackages(mainTex, 'https://teeex.pages.dev/api/texlive');
      const loadedNames = new Set(loaded.map((p) => p.name));

      // xkeyval suite files must be preloaded transitively
      expect(loadedNames.has('xkeyval.sty')).toBe(true);
      expect(loadedNames.has('xkeyval.tex')).toBe(true);
      expect(loadedNames.has('xkvutils.tex')).toBe(true);
      expect(loadedNames.has('keyval.tex')).toBe(true);

      const files: ProjectFile[] = [
        { id: '1', name: 'main.tex', content: mainTex, type: 'tex', size: mainTex.length },
      ];

      const engineFiles = toEngineFiles(files, 'main.tex');
      const paths = new Set(engineFiles.map((f) => f.path));

      // Verify xkeyval files and extensionless aliases are mounted into MEMFS root
      expect(paths.has('xkeyval.sty')).toBe(true);
      expect(paths.has('xkeyval.tex')).toBe(true);
      expect(paths.has('xkeyval')).toBe(true);
      expect(paths.has('xkvutils.tex')).toBe(true);
      expect(paths.has('xkvutils')).toBe(true);
      expect(paths.has('keyval.tex')).toBe(true);
      expect(paths.has('keyval')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('recognizes extensionless keys like 26/xkeyval as bundled to prevent miss poisoning', () => {
    const isBundledOrAlias = (fname: string): boolean => {
      if (BUNDLED_PACKAGE_NAMES.has(fname)) return true;
      if (fname.indexOf('.') === -1) {
        const candidates = ['.tex', '.sty', '.cls', '.def', '.clo', '.fd'];
        for (const ext of candidates) {
          if (BUNDLED_PACKAGE_NAMES.has(fname + ext)) return true;
        }
      }
      return false;
    };

    const misses = [
      '26/xkeyval',
      '26/xstring',
      '26/fontaxes',
      '26/randomnonexistentpackage123',
    ];

    const filtered = misses.filter((m) => {
      const fname = m.slice(m.indexOf('/') + 1);
      return !isBundledOrAlias(fname);
    });

    const stale = misses.filter((m) => {
      const fname = m.slice(m.indexOf('/') + 1);
      return isBundledOrAlias(fname);
    });

    // 26/xkeyval, 26/xstring, and 26/fontaxes should be classified as stale misses and purged
    expect(filtered).toEqual(['26/randomnonexistentpackage123']);
    expect(stale).toEqual(['26/xkeyval', '26/xstring', '26/fontaxes']);
  });
});
