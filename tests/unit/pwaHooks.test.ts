// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { usePwaInstall } from '../../src/hooks/usePwaInstall';
import { useFileHandling, type LaunchedFile } from '../../src/hooks/useFileHandling';

// @ts-expect-error test act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('PWA Desktop Hooks (Stage 8)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  describe('usePwaInstall()', () => {
    let pwaHook: ReturnType<typeof usePwaInstall>;

    function PwaTestComponent() {
      pwaHook = usePwaInstall();
      return null;
    }

    it('initializes with isInstallable false and isInstalled false in standard browser mode', async () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      await act(async () => {
        root.render(React.createElement(PwaTestComponent));
      });

      expect(pwaHook.isInstallable).toBe(false);
      expect(pwaHook.isInstalled).toBe(false);
    });

    it('detects existing standalone PWA mode', async () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('display-mode: standalone'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      await act(async () => {
        root.render(React.createElement(PwaTestComponent));
      });

      expect(pwaHook.isInstalled).toBe(true);
      expect(pwaHook.isInstallable).toBe(false);
    });

    it('transitions to isInstallable when beforeinstallprompt event fires', async () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });

      await act(async () => {
        root.render(React.createElement(PwaTestComponent));
      });

      const mockPromptEvent = new Event('beforeinstallprompt');
      Object.assign(mockPromptEvent, {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      });

      await act(async () => {
        window.dispatchEvent(mockPromptEvent);
      });

      expect(pwaHook.isInstallable).toBe(true);

      // Trigger installApp()
      let outcome = false;
      await act(async () => {
        outcome = await pwaHook.installApp();
      });

      expect(outcome).toBe(true);
      expect(pwaHook.isInstallable).toBe(false);
    });

    it('marks isInstalled true when appinstalled event fires', async () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });

      await act(async () => {
        root.render(React.createElement(PwaTestComponent));
      });

      await act(async () => {
        window.dispatchEvent(new Event('appinstalled'));
      });

      expect(pwaHook.isInstalled).toBe(true);
      expect(pwaHook.isInstallable).toBe(false);
    });
  });

  describe('useFileHandling()', () => {
    let capturedConsumer: ((params: { targetURL: string; files: unknown[] }) => Promise<void>) | null = null;

    function FileHandlingTestComponent({ onOpen }: { onOpen: (file: LaunchedFile) => void }) {
      useFileHandling(onOpen);
      return null;
    }

    it('subscribes to window.launchQueue when available in Chromium', async () => {
      const setConsumerMock = vi.fn().mockImplementation((cb) => {
        capturedConsumer = cb;
      });

      (window as unknown as { launchQueue?: unknown }).launchQueue = {
        setConsumer: setConsumerMock,
      };

      const onFileOpen = vi.fn();

      await act(async () => {
        root.render(React.createElement(FileHandlingTestComponent, { onOpen: onFileOpen }));
      });

      expect(setConsumerMock).toHaveBeenCalledTimes(1);
      expect(capturedConsumer).toBeDefined();

      const mockFile = {
        name: 'document.tex',
        text: vi.fn().mockResolvedValue('\\documentclass{article}\n\\begin{document}Hello\\end{document}'),
      };

      const mockHandle = {
        kind: 'file',
        name: 'document.tex',
        getFile: vi.fn().mockResolvedValue(mockFile),
      };

      if (capturedConsumer) {
        await act(async () => {
          await capturedConsumer!({ targetURL: 'https://teeex.app/', files: [mockHandle] });
        });
      }

      expect(onFileOpen).toHaveBeenCalledWith({
        name: 'document.tex',
        content: '\\documentclass{article}\n\\begin{document}Hello\\end{document}',
        handle: mockHandle,
      });
    });
  });
});
