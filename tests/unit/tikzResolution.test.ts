import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  BUNDLED_PACKAGES,
  BUNDLED_PACKAGE_NAMES,
  MAX_PRELOADED_FILES,
  preloadDocumentPackages,
} from '../../src/services/bundledPackages';
import { toEngineFiles, type ProjectFile } from '../../src/services/texProject';

const TIKZ_PGF_FILES = [
  'tikz.sty',
  'tikz.code.tex',
  'pgf.sty',
  'pgfrcs.sty',
  'pgfrcs.code.tex',
  'pgfcore.sty',
  'pgfcore.code.tex',
  'pgfsys.sty',
  'pgfsys.code.tex',
  'pgfsys-pdftex.def',
  'pgffor.sty',
  'pgffor.code.tex',
  'pgfkeys.sty',
  'pgfkeys.code.tex',
  'pgfmath.sty',
  'pgfmath.code.tex',
  'pgfutil-common.tex',
  'pgfutil-latex.def',
  'pgfcomp-version-0-65.sty',
  'pgfcomp-version-1-18.sty',
  'pgfcorepoints.code.tex',
  'pgfcorepathconstruct.code.tex',
  'pgfcorepathusage.code.tex',
  'pgfcorescopes.code.tex',
  'pgfcoregraphicstate.code.tex',
  'pgfcoretransformations.code.tex',
  'pgfcorequick.code.tex',
  'pgfcoreobjects.code.tex',
  'pgfcorepathprocessing.code.tex',
  'pgfcorearrows.code.tex',
  'pgfcoreshade.code.tex',
  'pgfcoreimage.code.tex',
  'pgfcoreexternal.code.tex',
  'pgfcorelayers.code.tex',
  'pgfcoretransparency.code.tex',
  'pgfcorepatterns.code.tex',
  'pgfcorerdf.code.tex',
];

describe('TikZ and PGF Suite Package Resolution and Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers all 37 TikZ and PGF files in BUNDLED_PACKAGES with format 26', () => {
    expect(TIKZ_PGF_FILES.length).toBe(37);
    for (const name of TIKZ_PGF_FILES) {
      expect(BUNDLED_PACKAGE_NAMES.has(name), `${name} should be in BUNDLED_PACKAGE_NAMES`).toBe(true);
      const entry = BUNDLED_PACKAGES.find((p) => p.name === name);
      expect(entry, `${name} must have a definition`).toBeDefined();
      expect(entry?.format).toBe(26);
    }
  });

  it('has expanded preloading budget for heavy packages like TikZ', () => {
    expect(MAX_PRELOADED_FILES).toBeGreaterThanOrEqual(240);
  });

  it('verifies all 37 TikZ package files exist in public/packages/ matching integrity pins', () => {
    const hashesFile = path.resolve(__dirname, '../../scripts/essential-package-hashes.json');
    const hashes = JSON.parse(fs.readFileSync(hashesFile, 'utf8'));

    for (const name of TIKZ_PGF_FILES) {
      const filePath = path.resolve(__dirname, '../../public/packages', name);
      expect(fs.existsSync(filePath), `${name} must exist in public/packages`).toBe(true);

      const content = fs.readFileSync(filePath);
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');
      expect(hashes[name], `Hash pin must exist for ${name}`).toBeDefined();
      expect(content.length).toBe(hashes[name].bytes);
      expect(sha256).toBe(hashes[name].sha256);
    }
  });

  it('extracts and mounts TikZ suite when \\usepackage{tikz} is used', async () => {
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
      for (const name of TIKZ_PGF_FILES) {
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

      for (const name of TIKZ_PGF_FILES) {
        expect(engineFilePaths.has(name), `${name} should be mounted in engineFiles`).toBe(true);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('preloads TikZ suite through preloadDocumentPackages', async () => {
    const texSource = `
      \\documentclass{article}
      \\usepackage{tikz}
      \\begin{document}
      Test tikz preloading
      \\end{document}
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      for (const name of TIKZ_PGF_FILES) {
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

      for (const name of TIKZ_PGF_FILES) {
        expect(loadedNames.has(name), `${name} should be loaded`).toBe(true);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
