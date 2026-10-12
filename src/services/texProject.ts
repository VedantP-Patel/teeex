/**
 * Teeex — project to TeX engine mapping.
 *
 * Decides *what* gets compiled and *which* auxiliary passes are needed. Kept
 * separate from the engine service so it can be tested without loading the
 * WASM runtime.
 */

import type { ProjectFile } from '../types/latex';
import { mountVirtualTeXFileSystem } from './virtualFileSystem';
import { getCachedPackageContent } from './bundledPackages';

/** A file as the engine's virtual filesystem expects it. */
export interface EngineFile {
  path: string;
  content: string | Uint8Array;
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
    out.push({ path: alias, content: entry.content });
  }

  // Pre-seed academic classes and styles directly into working directory if referenced
  const entryFile = files.find((file) => file.name === entryPath);
  const entryContent = entryFile?.content || '';

  if (
    /\\documentclass\s*(?:\[[^\]]*\])?\s*\{[^}]*\bIEEEtran\b[^}]*\}/i.test(entryContent) &&
    !seen.has('IEEEtran.cls')
  ) {
    const cached = getCachedPackageContent('IEEEtran.cls');
    if (cached) {
      seen.add('IEEEtran.cls');
      out.push({ path: 'IEEEtran.cls', content: cached });
    }
  }

  if (
    /\\usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*\bcite\b[^}]*\}/i.test(entryContent) &&
    !seen.has('cite.sty')
  ) {
    const cached = getCachedPackageContent('cite.sty');
    if (cached) {
      seen.add('cite.sty');
      out.push({ path: 'cite.sty', content: cached });
    }
  }

  if (
    /\\documentclass\s*(?:\[[^\]]*\])?\s*\{[^}]*\bacmart\b[^}]*\}/i.test(entryContent) &&
    !seen.has('acmart.cls')
  ) {
    const cached = getCachedPackageContent('acmart.cls');
    if (cached) {
      seen.add('acmart.cls');
      out.push({ path: 'acmart.cls', content: cached });
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
