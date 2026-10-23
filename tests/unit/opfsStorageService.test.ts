// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isOpfsSupported,
  writeOpfsFile,
  readOpfsFile,
  listOpfsFiles,
  _resetOpfsForTesting,
} from '../../src/services/opfsStorageService';

class MockFileHandle {
  kind = 'file' as const;
  constructor(public name: string, public content: string | Uint8Array = '') {}

  async createWritable() {
    return {
      write: async (data: string | ArrayBuffer) => {
        if (typeof data === 'string') {
          this.content = data;
        } else {
          this.content = new Uint8Array(data);
        }
      },
      close: async () => {},
    };
  }

  async getFile() {
    const data = this.content;
    return {
      text: async () => (typeof data === 'string' ? data : new TextDecoder().decode(data)),
      arrayBuffer: async () => {
        if (typeof data === 'string') {
          return new TextEncoder().encode(data).buffer;
        }
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      },
    };
  }
}

class MockDirectoryHandle {
  kind = 'directory' as const;
  entriesMap = new Map<string, MockDirectoryHandle | MockFileHandle>();

  constructor(public name: string) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    let handle = this.entriesMap.get(name);
    if (!handle) {
      if (options?.create) {
        handle = new MockDirectoryHandle(name);
        this.entriesMap.set(name, handle);
      } else {
        throw new Error(`Directory not found: ${name}`);
      }
    }
    if (handle.kind !== 'directory') throw new Error(`${name} is not a directory`);
    return handle as MockDirectoryHandle;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    let handle = this.entriesMap.get(name);
    if (!handle) {
      if (options?.create) {
        handle = new MockFileHandle(name);
        this.entriesMap.set(name, handle);
      } else {
        throw new Error(`File not found: ${name}`);
      }
    }
    if (handle.kind !== 'file') throw new Error(`${name} is not a file`);
    return handle as MockFileHandle;
  }

  async *entries() {
    for (const [name, handle] of this.entriesMap.entries()) {
      yield [name, handle];
    }
  }
}

describe('opfsStorageService', () => {
  let mockRoot: MockDirectoryHandle;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetOpfsForTesting();
    mockRoot = new MockDirectoryHandle('root');

    Object.defineProperty(window.navigator, 'storage', {
      value: {
        getDirectory: vi.fn().mockResolvedValue(mockRoot),
      },
      writable: true,
      configurable: true,
    });
  });

  it('detects OPFS support correctly', () => {
    expect(isOpfsSupported()).toBe(true);

    Object.defineProperty(window.navigator, 'storage', {
      value: {},
      writable: true,
      configurable: true,
    });
    expect(isOpfsSupported()).toBe(false);
  });

  it('writes and reads a text file within a project', async () => {
    const success = await writeOpfsFile('proj-123', 'main.tex', '\\documentclass{article}');
    expect(success).toBe(true);

    const content = await readOpfsFile('proj-123', 'main.tex');
    expect(content).toBe('\\documentclass{article}');
  });

  it('writes and reads nested binary files', async () => {
    const binaryData = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const success = await writeOpfsFile('proj-123', 'figures/plot.pdf', binaryData);
    expect(success).toBe(true);

    const readBack = await readOpfsFile('proj-123', 'figures/plot.pdf', true);
    expect(readBack).toBeInstanceOf(Uint8Array);
    expect(Array.from(readBack as Uint8Array)).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  it('lists all files recursively within a project', async () => {
    await writeOpfsFile('proj-123', 'main.tex', 'content');
    await writeOpfsFile('proj-123', 'sections/intro.tex', 'intro');
    await writeOpfsFile('proj-123', 'sections/methods.tex', 'methods');

    const files = await listOpfsFiles('proj-123');
    expect(files).toContain('main.tex');
    expect(files).toContain('sections/intro.tex');
    expect(files).toContain('sections/methods.tex');
  });

  it('returns null when reading non-existent file', async () => {
    const result = await readOpfsFile('proj-123', 'missing.tex');
    expect(result).toBeNull();
  });
});
