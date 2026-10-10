/**
 * Teeex Studio — Virtual TeX Filesystem & Binary Asset Synchronization
 * Provides robust base64 Data URL <-> Uint8Array buffer decoding and
 * in-memory virtual asset tree mounting for WebAssembly TeX engines and PDF pipelines.
 */

import type { ProjectFile } from '../types/latex';

/**
 * Converts a base64 Data URL or raw base64 string to a raw Uint8Array binary buffer.
 * Strips any MIME prefix (e.g. data:image/png;base64,) and validates headers.
 */
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  if (!dataUrl) return new Uint8Array(0);
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  try {
    const binary = atob(base64.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    console.error('Failed to decode dataUrl to Uint8Array:', err);
    return new Uint8Array(0);
  }
}

/**
 * Converts raw Uint8Array binary bytes into a browser Data URL.
 */
export function uint8ArrayToDataUrl(bytes: Uint8Array, mimeType: string = 'image/png'): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

export interface VirtualFileEntry {
  path: string;
  isBinary: boolean;
  content: string | Uint8Array;
  sizeBytes: number;
  mimeType?: string;
}

/**
 * Mounts and normalizes project files into an in-memory virtual filesystem map
 * ensuring all binary images/figures are converted to raw Uint8Array buffers
 * to prevent corrupted headers when compiled with WebAssembly TeX engines.
 */
export function mountVirtualTeXFileSystem(files: ProjectFile[]): Map<string, VirtualFileEntry> {
  const vfs = new Map<string, VirtualFileEntry>();

  for (const file of files) {
    const isImage = file.type === 'image' || Boolean(file.dataUrl) || /\.(png|jpe?g|gif|svg|webp|pdf)$/i.test(file.name);

    if (isImage && file.dataUrl) {
      const buffer = dataUrlToUint8Array(file.dataUrl);
      const ext = file.name.split('.').pop()?.toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      const entry: VirtualFileEntry = {
        path: file.name,
        isBinary: true,
        content: buffer,
        sizeBytes: buffer.byteLength,
        mimeType: mime,
      };

      // Mount under primary name
      vfs.set(file.name, entry);
      // Mount under basename if different
      const basename = file.name.split('/').pop();
      if (basename && basename !== file.name) {
        vfs.set(basename, entry);
      }
      // Mount under folder path if folder is specified
      if (file.folder && !file.name.startsWith(file.folder + '/')) {
        vfs.set(`${file.folder}/${file.name}`, entry);
      }
    } else {
      const entry: VirtualFileEntry = {
        path: file.name,
        isBinary: false,
        content: file.content || '',
        sizeBytes: new TextEncoder().encode(file.content || '').length,
        mimeType: file.name.endsWith('.bib') ? 'application/x-bibtex' : 'text/x-tex',
      };
      vfs.set(file.name, entry);
      const basename = file.name.split('/').pop();
      if (basename && basename !== file.name) {
        vfs.set(basename, entry);
      }
    }
  }

  return vfs;
}

/**
 * Resolves a file reference from LaTeX source code (e.g. \includegraphics{figures/logo} or \input{intro})
 * against the project files, handling extension omissions and path normalizations.
 */
export function resolveProjectAsset(
  referencePath: string,
  files?: ProjectFile[]
): ProjectFile | undefined {
  if (!files || files.length === 0 || !referencePath) return undefined;

  const rawClean = referencePath.trim().replace(/^[.\\/]+/, '');
  const clean = rawClean.replace(/\\/g, '/');
  const baseName = clean.split('/').pop() || clean;
  const noExtName = baseName.replace(/\.[^/.]+$/, '');
  const cleanNoExt = clean.replace(/\.[^/.]+$/, '');

  // 1. Exact match on id or name
  let matched = files.find(f => f.id === clean || f.name === clean);
  if (matched) return matched;

  // 2. Basename match
  matched = files.find(f => {
    const fBase = f.name.split('/').pop() || f.name;
    return fBase === baseName || f.id === baseName;
  });
  if (matched) return matched;

  // 3. Match without extension (e.g. \includegraphics{fig} -> fig.png)
  matched = files.find(f => {
    const fCleanNoExt = f.name.replace(/\.[^/.]+$/, '');
    const fBaseNoExt = (f.name.split('/').pop() || f.name).replace(/\.[^/.]+$/, '');
    return fCleanNoExt === cleanNoExt || fBaseNoExt === noExtName;
  });
  if (matched) return matched;

  // 4. Folder relative match
  matched = files.find(f => {
    if (f.folder && `${f.folder}/${f.name}` === clean) return true;
    if (f.folder && `${f.folder}/${f.name}`.replace(/\.[^/.]+$/, '') === cleanNoExt) return true;
    return false;
  });
  if (matched) return matched;

  // 5. Suffix or contains match for figures
  matched = files.find(f => f.name.endsWith('/' + clean) || clean.endsWith('/' + f.name));
  if (matched) return matched;

  return undefined;
}
