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

describe('xstring Suite Package Resolution and Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers xstring.sty and xstring.tex in BUNDLED_PACKAGES', () => {
    const required = ['xstring.sty', 'xstring.tex'];
    for (const name of required) {
      expect(BUNDLED_PACKAGE_NAMES.has(name), `${name} should be in BUNDLED_PACKAGE_NAMES`).toBe(true);
      const entry = BUNDLED_PACKAGES.find((p) => p.name === name);
      expect(entry?.format).toBe(26);
    }
  });

  it('verifies xstring package files exist in public/packages/ matching integrity pins', () => {
    const hashesFile = path.resolve(__dirname, '../../scripts/essential-package-hashes.json');
    const hashes = JSON.parse(fs.readFileSync(hashesFile, 'utf8'));

    for (const name of ['xstring.sty', 'xstring.tex']) {
      const filePath = path.resolve(__dirname, '../../public/packages', name);
      expect(fs.existsSync(filePath), `${name} must exist in public/packages`).toBe(true);

      const content = fs.readFileSync(filePath);
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');
      expect(content.length).toBe(hashes[name].bytes);
      expect(sha256).toBe(hashes[name].sha256);
    }
  });

  it('extracts and mounts xstring companion files and extensionless aliases when newtxtext is used', async () => {
    const mainTex = `
      \\documentclass[10pt,twocolumn,a4paper]{article}
      \\usepackage{newtxtext}
      \\flushbottom
      \\begin{document}
      Hello NewTX with xstring
      \\end{document}
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/packages/newtxtext.sty')) {
        return new Response('\\ProvidesPackage{newtxtext}[2024/04/01 v1.744]\\RequirePackage{xstring}', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/xstring.sty')) {
        return new Response('\\input xstring.tex\n\\ProvidesPackage{xstring}', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/xstring.tex')) {
        return new Response('% xstring implementation', {
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

      expect(engineFilePaths.has('xstring.sty')).toBe(true);
      expect(engineFilePaths.has('xstring.tex')).toBe(true);
      expect(engineFilePaths.has('xstring')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('extracts and mounts xstring when explicitly imported via \\usepackage{xstring}', async () => {
    const mainTex = `
      \\documentclass{article}
      \\usepackage{xstring}
      \\begin{document}
      \\StrSubstitute{Hello}{e}{a}
      \\end{document}
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/packages/xstring.sty')) {
        return new Response('\\input xstring.tex\n\\ProvidesPackage{xstring}', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/xstring.tex')) {
        return new Response('% xstring implementation', {
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

      expect(engineFilePaths.has('xstring.sty')).toBe(true);
      expect(engineFilePaths.has('xstring.tex')).toBe(true);
      expect(engineFilePaths.has('xstring')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('preloads xstring files through preloadDocumentPackages', async () => {
    const texSource = `
      \\documentclass{article}
      \\usepackage{newtxtext}
      \\begin{document}
      Test
      \\end{document}
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/packages/newtxtext.sty')) {
        return new Response('\\ProvidesPackage{newtxtext}[2024/04/01 v1.744]\\RequirePackage{xstring}', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/xstring.sty')) {
        return new Response('\\input xstring.tex\\ProvidesPackage{xstring}', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      if (urlStr.includes('/packages/xstring.tex')) {
        return new Response('% xstring implementation', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    try {
      const loaded = await preloadDocumentPackages(texSource, 'https://teeex.pages.dev/api/texlive');
      const loadedNames = new Set(loaded.map((p) => p.name));

      expect(loadedNames.has('xstring.sty')).toBe(true);
      expect(loadedNames.has('xstring.tex')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
