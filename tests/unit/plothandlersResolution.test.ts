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
  'pgflibraryplothandlers.code.tex',
  'tikzlibrarytopaths.code.tex',
  'tikzlibrarytrees.code.tex',
  'tikzlibraryscopes.code.tex',
  'tikzlibraryshadows.code.tex',
  'tikzlibrarychains.code.tex',
  'tikzlibrarythrough.code.tex',
  'tikzlibrarydecorations.shapes.code.tex',
  'pgflibraryfpu.code.tex',
  'tikzlibraryfpu.code.tex',
  'tikzlibraryshapes.misc.code.tex',
  'tikzlibraryshapes.symbols.code.tex',
  'tikzlibraryshapes.arrows.code.tex',
  'tikzlibraryshapes.callouts.code.tex',
  'tikzlibraryshapes.multipart.code.tex',
  'pgflibraryshapes.arrows.code.tex',
  'pgflibraryshapes.callouts.code.tex',
  'pgflibraryshapes.multipart.code.tex',
];

describe('PGF plothandlers, topaths, and TikZ Extensions Suite Resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers all 18 new packages in BUNDLED_PACKAGES with format 26', () => {
    for (const name of NEW_PACKAGES) {
      expect(BUNDLED_PACKAGE_NAMES.has(name), `${name} should be in BUNDLED_PACKAGE_NAMES`).toBe(true);
      const entry = BUNDLED_PACKAGES.find((p) => p.name === name);
      expect(entry, `${name} must have a definition`).toBeDefined();
      expect(entry?.format).toBe(26);
    }
  });

  it('verifies all 18 package files exist in public/packages/ matching cryptographic integrity pins', () => {
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

  it('eagerly preloads plothandlers and topaths when \\usepackage{tikz} is used', async () => {
    const mainTex = `
      \\documentclass[10pt,twocolumn,a4paper]{article}
      \\usepackage{tikz}
      \\begin{document}
      \\begin{tikzpicture}
        \\draw (0,0) to (1,1);
      \\end{tikzpicture}
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

      // Core plothandlers and topaths must be preloaded eagerly without explicit declaration
      expect(loadedNames.has('pgflibraryplothandlers.code.tex')).toBe(true);
      expect(loadedNames.has('tikzlibrarytopaths.code.tex')).toBe(true);

      const files: ProjectFile[] = [
        { id: '1', name: 'main.tex', content: mainTex, type: 'tex', size: mainTex.length },
      ];

      const engineFiles = toEngineFiles(files, 'main.tex');
      const paths = new Set(engineFiles.map((f) => f.path));

      // Verify presence of mounted files
      expect(paths.has('pgflibraryplothandlers.code.tex')).toBe(true);
      expect(paths.has('tikzlibrarytopaths.code.tex')).toBe(true);

      // Verify extensionless aliases
      expect(paths.has('pgflibraryplothandlers.code')).toBe(true);
      expect(paths.has('tikzlibrarytopaths.code')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
