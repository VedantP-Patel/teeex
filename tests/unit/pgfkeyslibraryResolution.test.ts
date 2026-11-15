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

const PGF_EXTENSION_FILES = [
  'pgfkeyslibraryfiltered.code.tex',
  'pgfsys-common-pdf.def',
  'pgf.cfg',
  'pgfsyssoftpath.code.tex',
  'pgfsysprotocol.code.tex',
  'pgfmathutil.code.tex',
  'pgfmathparser.code.tex',
  'pgfmathfunctions.code.tex',
  'pgfmathfunctions.basic.code.tex',
  'pgfmathfunctions.trigonometric.code.tex',
  'pgfmathfunctions.random.code.tex',
  'pgfmathfunctions.comparison.code.tex',
  'pgfmathfunctions.base.code.tex',
  'pgfmathfunctions.round.code.tex',
  'pgfmathfunctions.misc.code.tex',
  'pgfmathfunctions.integerarithmetics.code.tex',
  'pgfmathcalc.code.tex',
  'pgfmathfloat.code.tex',
  'pgfint.code.tex',
  'pgf.revision.tex',
  'tikzlibraryarrows.code.tex',
  'tikzlibrarycalc.code.tex',
  'tikzlibrarypositioning.code.tex',
  'tikzlibraryshapes.code.tex',
  'tikzlibraryshapes.geometric.code.tex',
  'tikzlibraryfit.code.tex',
  'tikzlibrarybackgrounds.code.tex',
  'tikzlibrarymatrix.code.tex',
  'tikzlibrarypatterns.code.tex',
  'tikzlibrarydecorations.code.tex',
  'tikzlibrarydecorations.pathmorphing.code.tex',
  'tikzlibrarydecorations.markings.code.tex',
  'tikzlibraryintersections.code.tex',
  'pgflibraryshapes.code.tex',
  'pgflibraryarrows.code.tex',
  'pgflibraryplotmarks.code.tex',
  'pgflibraryshapes.geometric.code.tex',
  'pgflibrarypatterns.code.tex',
  'pgflibrarydecorations.pathmorphing.code.tex',
  'pgflibrarydecorations.markings.code.tex',
  'pgflibraryintersections.code.tex',
  'pgflibraryshapes.misc.code.tex',
  'pgflibraryshapes.symbols.code.tex',
];

describe('PGF Keys Library and Transitive Runtime Resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers all 43 PGF runtime files in BUNDLED_PACKAGES with format 26', () => {
    expect(PGF_EXTENSION_FILES.length).toBe(43);
    for (const name of PGF_EXTENSION_FILES) {
      expect(BUNDLED_PACKAGE_NAMES.has(name), `${name} should be in BUNDLED_PACKAGE_NAMES`).toBe(true);
      const entry = BUNDLED_PACKAGES.find((p) => p.name === name);
      expect(entry, `${name} must have a definition`).toBeDefined();
      expect(entry?.format).toBe(26);
    }
  });

  it('verifies all 43 package files exist in public/packages/ matching integrity pins', () => {
    const hashesFile = path.resolve(__dirname, '../../scripts/essential-package-hashes.json');
    const hashes = JSON.parse(fs.readFileSync(hashesFile, 'utf8'));

    for (const name of PGF_EXTENSION_FILES) {
      const filePath = path.resolve(__dirname, '../../public/packages', name);
      expect(fs.existsSync(filePath), `${name} must exist in public/packages`).toBe(true);

      const content = fs.readFileSync(filePath);
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');
      expect(hashes[name], `Hash pin must exist for ${name}`).toBeDefined();
      expect(content.length).toBe(hashes[name].bytes);
      expect(sha256).toBe(hashes[name].sha256);
    }
  });

  it('extracts and mounts pgfkeyslibraryfiltered.code.tex and core PGF files when \\usepackage{tikz} is used', async () => {
    const mainTex = `
      \\documentclass[10pt,twocolumn,a4paper]{article}
      \\usepackage{tikz}
      \\begin{document}
      \\begin{tikzpicture}
        \\draw (0,0) -- (1,1);
      \\end{tikzpicture}
      \\end{document}
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      for (const name of PGF_EXTENSION_FILES) {
        if (urlStr.includes(`/packages/${name}`)) {
          return new Response(`% mock content of ${name}`, {
            status: 200,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
        }
      }
      return new Response('Not Found', { status: 404 });
    });

    try {
      await preloadDocumentPackages(mainTex, 'https://teeex.pages.dev/api/texlive');

      const files: ProjectFile[] = [
        { id: '1', name: 'main.tex', content: mainTex, type: 'tex', size: mainTex.length },
      ];

      const engineFiles = toEngineFiles(files, 'main.tex');
      const engineFilePaths = new Set(engineFiles.map((f) => f.path));

      // Core PGF runtime must be mounted
      expect(engineFilePaths.has('pgfkeyslibraryfiltered.code.tex')).toBe(true);
      expect(engineFilePaths.has('pgfsys-common-pdf.def')).toBe(true);
      expect(engineFilePaths.has('pgf.cfg')).toBe(true);
      expect(engineFilePaths.has('pgfsyssoftpath.code.tex')).toBe(true);
      expect(engineFilePaths.has('pgfsysprotocol.code.tex')).toBe(true);
      expect(engineFilePaths.has('pgfmathutil.code.tex')).toBe(true);
      expect(engineFilePaths.has('pgfmathparser.code.tex')).toBe(true);
      expect(engineFilePaths.has('pgfmathfunctions.code.tex')).toBe(true);
      expect(engineFilePaths.has('pgfmathfloat.code.tex')).toBe(true);
      expect(engineFilePaths.has('pgfint.code.tex')).toBe(true);
      expect(engineFilePaths.has('pgf.revision.tex')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('preloads TikZ libraries specified via \\usetikzlibrary and \\usepgflibrary', async () => {
    const texSource = `
      \\documentclass{article}
      \\usepackage{tikz}
      \\usetikzlibrary{calc, positioning, shapes.geometric}
      \\usepgflibrary{arrows, plotmarks}
      \\begin{document}
      \\begin{tikzpicture}
        \\node (a) {Test};
      \\end{tikzpicture}
      \\end{document}
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      for (const name of PGF_EXTENSION_FILES) {
        if (urlStr.includes(`/packages/${name}`)) {
          return new Response(`% mock content of ${name}`, {
            status: 200,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
        }
      }
      return new Response('Not Found', { status: 404 });
    });

    try {
      const loaded = await preloadDocumentPackages(texSource, 'https://teeex.pages.dev/api/texlive');
      const loadedNames = new Set(loaded.map((p) => p.name));

      expect(loadedNames.has('tikzlibrarycalc.code.tex')).toBe(true);
      expect(loadedNames.has('tikzlibrarypositioning.code.tex')).toBe(true);
      expect(loadedNames.has('tikzlibraryshapes.geometric.code.tex')).toBe(true);
      expect(loadedNames.has('pgflibraryarrows.code.tex')).toBe(true);
      expect(loadedNames.has('pgflibraryplotmarks.code.tex')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
