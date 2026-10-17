import { useEffect, useRef } from 'react';

export interface LaunchedFile {
  name: string;
  content: string;
  handle?: FileSystemFileHandle;
}

interface LaunchParams {
  readonly targetURL: string;
  readonly files: FileSystemFileHandle[];
}

interface LaunchQueue {
  setConsumer(consumer: (launchParams: LaunchParams) => void | Promise<void>): void;
}

declare global {
  interface Window {
    launchQueue?: LaunchQueue;
  }
}

/**
 * Hook to consume OS file opening events when Teeex is registered as a PWA file handler
 * for .tex, .bib, .sty, and .cls documents.
 */
export function useFileHandling(onFileOpen?: (file: LaunchedFile) => void) {
  const onFileOpenRef = useRef(onFileOpen);
  onFileOpenRef.current = onFileOpen;

  useEffect(() => {
    if (!('launchQueue' in window) || !window.launchQueue) {
      return;
    }

    window.launchQueue.setConsumer(async (launchParams: LaunchParams) => {
      if (!launchParams.files || launchParams.files.length === 0) {
        return;
      }

      for (const handle of launchParams.files) {
        try {
          if (handle.kind === 'file') {
            const file = await handle.getFile();
            const content = await file.text();
            if (onFileOpenRef.current) {
              onFileOpenRef.current({
                name: file.name,
                content,
                handle,
              });
            }
          }
        } catch (err) {
          console.error('[Teeex File Handling] Failed reading launched file:', handle.name, err);
        }
      }
    });
  }, []);
}
