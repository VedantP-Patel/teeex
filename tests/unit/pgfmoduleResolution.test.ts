import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  BUNDLED_PACKAGES,
  BUNDLED_PACKAGE_NAMES,
  preloadDocumentPackages,
} from '../../src/services/bundledPackages';
import { toEngineFiles, type ProjectFile } from '../../src/services/texProject';

const NEW_PACKAGES = [
  'pgfmoduleshapes.code.tex',
  'pgfmoduleplot.code.tex',
  'pgfmodulematrix.code.tex',
  'pgfmoduledecorations.code.tex',
  'pgfmodulenonlineartransformations.code.tex',
  'pgfmoduleparser.code.tex',
  'pgfmoduleoo.code.tex',
  'pgfmoduleanimations.code.tex',
  'pgfsysanimations.code.tex',
  'pgflibraryarrows.meta.code.tex',
  'tikzlibraryarrows.meta.code.tex',
  'cuted.sty',
  'capt-of.sty',
  'tocloft.sty',
  'lmodern.sty',
  'flushend.sty',
];

describe('PGF Modules and NAITRAK SDDR Suite Resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers all 16 new packages in BUNDLED_PACKAGES with format 26', () => {
    for (const name of NEW_PACKAGES) {
      expect(BUNDLED_PACKAGE_NAMES.has(name), `${name} should be in BUNDLED_PACKAGE_NAMES`).toBe(true);
      const entry = BUNDLED_PACKAGES.find((p) => p.name === name);
      expect(entry, `${name} must have a definition`).toBeDefined();
      expect(entry?.format).toBe(26);
    }
  });

  it('verifies all 16 package files exist in public/packages/ matching cryptographic integrity pins', () => {
    const hashesFile = path.resolve(__dirname, '../../scripts/essential-package-hashes.json');
    const hashes = JSON.parse(fs.readFileSync(hashesFile, 'utf8'));

    for (const name of NEW_PACKAGES) {
      const filePath = path.resolve(__dirname, '../../public/packages', name);
      expect(fs.existsSync(filePath), `${name} must exist in public/packages`).toBe(true);

      const content = fs.readFileSync(filePath);
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');
      expect(hashes[name], `Hash pin must exist for ${name}`).toBeDefined();
      expect(content.length).toBe(hashes[name].bytes);
      expect(sha256).toBe(hashes[name].sha256);
    }
  });

  it('extracts, preloads, and mounts PGF modules and styling packages with extensionless aliases', async () => {
    const mainTex = `
      \\documentclass[10pt,twocolumn,a4paper]{article}
      \\usepackage{tikz}
      \\usepackage{cuted}
      \\usepackage{capt-of}
      \\usepackage{tocloft}
      \\usepackage{lmodern}
      \\usepackage{flushend}
      \\usepgfmodule{shapes,plot}
      \\usetikzlibrary{shapes.geometric,arrows.meta,positioning,calc}
      \\begin{document}
      \\begin{strip}
        Hello NAITRAK
      \\end{strip}
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

      // Core PGF module files
      expect(loadedNames.has('pgfmoduleshapes.code.tex')).toBe(true);
      expect(loadedNames.has('pgfmoduleplot.code.tex')).toBe(true);

      // Arrow meta libraries
      expect(loadedNames.has('pgflibraryarrows.meta.code.tex') || loadedNames.has('tikzlibraryarrows.meta.code.tex')).toBe(true);

      // Document packages
      expect(loadedNames.has('cuted.sty')).toBe(true);
      expect(loadedNames.has('capt-of.sty')).toBe(true);
      expect(loadedNames.has('tocloft.sty')).toBe(true);
      expect(loadedNames.has('lmodern.sty')).toBe(true);
      expect(loadedNames.has('flushend.sty')).toBe(true);

      const files: ProjectFile[] = [
        { id: '1', name: 'main.tex', content: mainTex, type: 'tex', size: mainTex.length },
      ];

      const engineFiles = toEngineFiles(files, 'main.tex');
      const paths = new Set(engineFiles.map((f) => f.path));

      // Verify presence of mounted files
      expect(paths.has('pgfmoduleshapes.code.tex')).toBe(true);
      expect(paths.has('pgfmoduleplot.code.tex')).toBe(true);
      expect(paths.has('cuted.sty')).toBe(true);
      expect(paths.has('capt-of.sty')).toBe(true);
      expect(paths.has('tocloft.sty')).toBe(true);
      expect(paths.has('lmodern.sty')).toBe(true);
      expect(paths.has('flushend.sty')).toBe(true);

      // Verify extensionless aliases are generated for style and tex files
      expect(paths.has('cuted')).toBe(true);
      expect(paths.has('capt-of')).toBe(true);
      expect(paths.has('tocloft')).toBe(true);
      expect(paths.has('lmodern')).toBe(true);
      expect(paths.has('flushend')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
