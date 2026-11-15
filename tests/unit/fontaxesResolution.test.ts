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

describe('fontaxes Suite Package Resolution and Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers fontaxes.sty, fontaxes-v1.sty, and figureversions.sty in BUNDLED_PACKAGES', () => {
    const required = ['fontaxes.sty', 'fontaxes-v1.sty', 'figureversions.sty'];
    for (const name of required) {
      expect(BUNDLED_PACKAGE_NAMES.has(name), `${name} should be in BUNDLED_PACKAGE_NAMES`).toBe(true);
      const entry = BUNDLED_PACKAGES.find((p) => p.name === name);
      expect(entry?.format).toBe(26);
    }
  });

  it('verifies fontaxes package files exist in public/packages/ matching integrity pins', () => {
    const hashesFile = path.resolve(__dirname, '../../scripts/essential-package-hashes.json');
    const hashes = JSON.parse(fs.readFileSync(hashesFile, 'utf8'));

    for (const name of ['fontaxes.sty', 'fontaxes-v1.sty', 'figureversions.sty']) {
      const filePath = path.resolve(__dirname, '../../public/packages', name);
      expect(fs.existsSync(filePath), `${name} must exist in public/packages`).toBe(true);

      const content = fs.readFileSync(filePath);
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');
      expect(content.length).toBe(hashes[name].bytes);
      expect(sha256).toBe(hashes[name].sha256);
    }
  });

  it('extracts and mounts fontaxes companion files when newtxtext is used', async () => {
    const mainTex = `
      \\documentclass[10pt,twocolumn,a4paper]{article}
      \\usepackage{newtxtext}
      \\flushbottom
      \\begin{document}
      Hello NewTX with fontaxes
      \\end{document}
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/packages/newtxtext.sty')) {
        return new Response('\\ProvidesPackage{newtxtext}[2024/04/01 v1.744]\\RequirePackage{fontaxes}', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/fontaxes.sty')) {
        return new Response('\\ProvidesPackage{fontaxes}[2026-01-02 v2.0.2]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/fontaxes-v1.sty')) {
        return new Response('\\ProvidesPackage{fontaxes-v1}[2020/03/25]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/figureversions.sty')) {
        return new Response('\\ProvidesPackage{figureversions}[2025-04-29]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
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

      expect(engineFilePaths.has('fontaxes.sty')).toBe(true);
      expect(engineFilePaths.has('fontaxes-v1.sty')).toBe(true);
      expect(engineFilePaths.has('figureversions.sty')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('extracts and mounts fontaxes when explicitly imported via \\usepackage{fontaxes}', async () => {
    const mainTex = `
      \\documentclass[10pt,twocolumn,a4paper]{article}
      \\usepackage{fontaxes}
      \\flushbottom
      \\begin{document}
      \\fontprimaryshape{it}
      \\end{document}
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/packages/fontaxes.sty')) {
        return new Response('\\ProvidesPackage{fontaxes}[2026-01-02 v2.0.2]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/fontaxes-v1.sty')) {
        return new Response('\\ProvidesPackage{fontaxes-v1}[2020/03/25]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/figureversions.sty')) {
        return new Response('\\ProvidesPackage{figureversions}[2025-04-29]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
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

      expect(engineFilePaths.has('fontaxes.sty')).toBe(true);
      expect(engineFilePaths.has('fontaxes-v1.sty')).toBe(true);
      expect(engineFilePaths.has('figureversions.sty')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('preloads fontaxes suite through preloadDocumentPackages', async () => {
    const texSource = `
      \\documentclass{article}
      \\usepackage{fontaxes}
      \\begin{document}
      Test fontaxes preloading
      \\end{document}
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/packages/fontaxes.sty')) {
        return new Response('\\ProvidesPackage{fontaxes}[2026-01-02 v2.0.2]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/fontaxes-v1.sty')) {
        return new Response('\\ProvidesPackage{fontaxes-v1}[2020/03/25]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/figureversions.sty')) {
        return new Response('\\ProvidesPackage{figureversions}[2025-04-29]', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    try {
      const loaded = await preloadDocumentPackages(texSource, 'https://teeex.pages.dev/api/texlive');
      const loadedNames = new Set(loaded.map((p) => p.name));

      expect(loadedNames.has('fontaxes.sty')).toBe(true);
      expect(loadedNames.has('fontaxes-v1.sty')).toBe(true);
      expect(loadedNames.has('figureversions.sty')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
