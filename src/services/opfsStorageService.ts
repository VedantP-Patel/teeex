/**
 * Teeex — Origin Private File System (OPFS) Storage Service.
 *
 * Provides high-throughput, native disk I/O using the browser's sandboxed
 * Origin Private File System (`navigator.storage.getDirectory()`).
 * Bypasses IndexedDB serialization overhead for zero-copy binary and document storage.
 */

export interface OpfsEntry {
  path: string;
  content: string | Uint8Array;
}

let rootDirPromise: Promise<FileSystemDirectoryHandle | null> | null = null;

export function _resetOpfsForTesting(): void {
  rootDirPromise = null;
}

export function isOpfsSupported(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator && typeof navigator.storage.getDirectory === 'function';
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (!isOpfsSupported()) return null;
  if (rootDirPromise) return rootDirPromise;

  rootDirPromise = (async () => {
    try {
      const root = await navigator.storage.getDirectory();
      // Ensure 'teeex-projects' directory exists
      return await root.getDirectoryHandle('teeex-projects', { create: true });
    } catch (err) {
      console.warn('[OPFS] Unable to initialize Origin Private File System root:', err);
      return null;
    }
  })();

  return rootDirPromise;
}

/**
 * Saves a file into the Origin Private File System under a project directory.
 */
export async function writeOpfsFile(
  projectId: string,
  relativePath: string,
  content: string | Uint8Array
): Promise<boolean> {
  try {
    const root = await getOpfsRoot();
    if (!root) return false;

    // Get or create project folder
    const cleanProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const projectDir = await root.getDirectoryHandle(cleanProjectId, { create: true });

    // Handle nested directories if any
    const segments = relativePath.split('/').filter(Boolean);
    let currentDir = projectDir;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (seg) {
        currentDir = await currentDir.getDirectoryHandle(seg, { create: true });
      }
    }

    const fileName = segments[segments.length - 1] || 'unnamed.txt';
    const fileHandle = await currentDir.getFileHandle(fileName, { create: true });

    const writable = await fileHandle.createWritable();
    if (typeof content === 'string') {
      await writable.write(content);
    } else {
      // Create a plain ArrayBuffer copy to ensure standard ArrayBuffer compatibility
      const copy = new Uint8Array(content.byteLength);
      copy.set(content);
      await writable.write(copy.buffer);
    }
    await writable.close();
    return true;
  } catch (err) {
    console.warn('[OPFS] Failed to write file to OPFS:', relativePath, err);
    return false;
  }
}

/**
 * Reads a file from the Origin Private File System.
 */
export async function readOpfsFile(
  projectId: string,
  relativePath: string,
  asBinary = false
): Promise<string | Uint8Array | null> {
  try {
    const root = await getOpfsRoot();
    if (!root) return null;

    const cleanProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const projectDir = await root.getDirectoryHandle(cleanProjectId, { create: false });

    const segments = relativePath.split('/').filter(Boolean);
    let currentDir = projectDir;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (seg) {
        currentDir = await currentDir.getDirectoryHandle(seg, { create: false });
      }
    }

    const fileName = segments[segments.length - 1] || 'unnamed.txt';
    const fileHandle = await currentDir.getFileHandle(fileName, { create: false });
    const file = await fileHandle.getFile();

    if (asBinary) {
      const buf = await file.arrayBuffer();
      return new Uint8Array(buf);
    }
    return await file.text();
  } catch {
    return null;
  }
}

/**
 * Lists all file entries stored in a project's OPFS directory.
 */
export async function listOpfsFiles(projectId: string): Promise<string[]> {
  const result: string[] = [];
  try {
    const root = await getOpfsRoot();
    if (!root) return result;

    const cleanProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const projectDir = await root.getDirectoryHandle(cleanProjectId, { create: false });

    async function walk(dir: FileSystemDirectoryHandle, prefix = ''): Promise<void> {
      for await (const [name, handle] of (dir as any).entries()) {
        const fullPath = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === 'file') {
          result.push(fullPath);
        } else if (handle.kind === 'directory') {
          await walk(handle as FileSystemDirectoryHandle, fullPath);
        }
      }
    }

    await walk(projectDir);
  } catch {
    // Non-fatal if project folder doesn't exist yet
  }
  return result;
}
