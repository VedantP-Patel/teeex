/**
 * Teeex — project to TeX engine mapping.
 *
 * Decides *what* gets compiled and *which* auxiliary passes are needed. Kept
 * separate from the engine service so it can be tested without loading the
 * WASM runtime.
 */

import type { ProjectFile } from '../types/latex';
import { mountVirtualTeXFileSystem } from './virtualFileSystem';
import { BUNDLED_PACKAGES, getCachedPackageContent } from './bundledPackages';

/** A file as the engine's virtual filesystem expects it. */
export interface EngineFile {
  path: string;
  content: string | Uint8Array;
  hash?: string;
}

export function computeCitationSignature(files: ProjectFile[], citations?: string[]): string {
  const bibFiles = files.filter((f) => f.name.endsWith('.bib'));
  let bibHash = 0x811c9dc5;
  for (const bf of bibFiles) {
    for (let i = 0; i < bf.content.length; i++) {
      bibHash = Math.imul(bibHash ^ bf.content.charCodeAt(i), 0x01000193);
    }
  }
  const citKey = (citations || []).slice().sort().join(';');
  return `${(bibHash >>> 0).toString(36)}:${citKey}`;
}

/**
 * Picks the file to compile.
 *
 * Compiling whichever file is open in the editor is wrong: an `\input`-ed
 * section has no preamble and cannot compile standalone, so editing
 * `sections/intro.tex` would always fail. The entry file is the only valid
 * root.
 *
 * Detection falls back through explicit marking, then convention, then the
 * strongest available signal — a `\documentclass`, which only a root document
 * has.
 */
export function resolveEntryFile(files: ProjectFile[]): ProjectFile | null {
  const texFiles = files.filter((file) => file.name.endsWith('.tex'));
  if (texFiles.length === 0) return null;

  return (
    texFiles.find((file) => file.isEntry) ??
    texFiles.find((file) => file.name === 'main.tex') ??
    texFiles.find((file) =>
      /\\documentclass\s*(?:\[[^\]]*\])?\s*\{/.test(file.content),
    ) ??
    texFiles[0]
  );
}

/**
 * Project files as engine filesystem entries, excluding the entry file (which
 * is passed separately as the compile input).
 *
 * Binary assets must stay binary. Image files carry their bytes in `dataUrl`,
 * not `content`; handing TeX the empty `content` string — as this previously
 * did — means `\includegraphics` can never resolve a figure.
 * `mountVirtualTeXFileSystem` already decodes data URLs to `Uint8Array`, and
 * aliases each file under the several paths LaTeX might reference it by.
 */
export function toEngineFiles(
  files: ProjectFile[],
  entryPath: string,
): EngineFile[] {
  const mounted = mountVirtualTeXFileSystem(files);
  const seen = new Set<string>();
  const out: EngineFile[] = [];

  for (const [alias, entry] of mounted) {
    if (alias === entryPath) continue;
    // The mount aliases one payload under several keys; send each file once,
    // under the alias LaTeX is most likely to use.
    if (seen.has(alias)) continue;
    seen.add(alias);

    const c = entry.content;
    let hash = '';
    if (typeof c === 'string') {
      let h = 0x811c9dc5;
      for (let i = 0; i < Math.min(c.length, 300); i++) {
        h = Math.imul(h ^ c.charCodeAt(i), 0x01000193);
      }
      hash = `${c.length}:${(h >>> 0).toString(36)}`;
    } else {
      hash = `${c.byteLength}:${c[0] ?? 0}_${c[c.byteLength - 1] ?? 0}`;
    }

    out.push({ path: alias, content: entry.content, hash });
  }

  // Pre-seed academic classes, styles, and companion assets directly into working directory if referenced
  const entryFile = files.find((file) => file.name === entryPath);
  const entryContent = entryFile?.content || '';

  const requestedClasses = new Set<string>();
  for (const match of entryContent.matchAll(/\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/gi)) {
    for (const name of match[1].split(',')) {
      const trimmed = name.trim();
      if (trimmed) requestedClasses.add(trimmed.toLowerCase());
    }
  }

  const requestedPackages = new Set<string>();
  for (const match of entryContent.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/gi)) {
    for (const name of match[1].split(',')) {
      const trimmed = name.trim();
      if (trimmed) requestedPackages.add(trimmed.toLowerCase());
    }
  }

  for (const pkg of BUNDLED_PACKAGES) {
    if (seen.has(pkg.name)) continue;

    let shouldMount = false;
    const lowerName = pkg.name.toLowerCase();

    if (lowerName.endsWith('.cls')) {
      const base = lowerName.slice(0, -4);
      if (requestedClasses.has(base)) shouldMount = true;
    } else if (lowerName.endsWith('.sty')) {
      const base = lowerName.slice(0, -4);
      if (requestedPackages.has(base)) {
        shouldMount = true;
      } else if (base === 'caption3' && (requestedPackages.has('caption') || requestedPackages.has('subcaption'))) {
        shouldMount = true;
      } else if (base === 'everysel' && requestedPackages.has('ragged2e')) {
        shouldMount = true;
      }
    } else if (lowerName === 'microtype-pdftex.def' && requestedPackages.has('microtype')) {
      shouldMount = true;
    } else if (lowerName === 'tfrupee.tfm' && requestedPackages.has('tfrupee')) {
      shouldMount = true;
    } else if (
      (lowerName.endsWith('.tfm') || lowerName.endsWith('.fd')) &&
      (requestedClasses.has('ieeetran') || requestedClasses.has('acmart'))
    ) {
      shouldMount = true;
    }

    if (shouldMount) {
      const cached = getCachedPackageContent(pkg.name);
      if (cached) {
        seen.add(pkg.name);
        out.push({ path: pkg.name, content: cached });
      }
    }
  }

  return out;
}

/**
 * Whether a BibTeX pass is needed.
 *
 * Running BibTeX unconditionally costs a pass on every compile and emits
 * spurious "I found no \citation commands" errors into the log, which then
 * surface as diagnostics on a document that is actually fine.
 */
export function needsBibtex(files: ProjectFile[], source: string): boolean {
  const hasBibFile = files.some((file) => file.name.endsWith('.bib'));
  const usesBibliography =
    /\\(?:bibliography|addbibresource|printbibliography|bibliographystyle)\b/.test(
      source,
    );
  return hasBibFile && usesBibliography;
}

export function needsMakeindex(source: string): boolean {
  return /\\(?:makeindex|printindex)\b/.test(source);
}
