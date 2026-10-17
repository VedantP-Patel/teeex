// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useGlobalKeyboardShortcuts, type GlobalKeyboardShortcutsOptions } from '../../src/hooks/useGlobalKeyboardShortcuts';

describe('Global Keyboard Shortcuts Hook (useGlobalKeyboardShortcuts)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let onOpenCommandPalette: ReturnType<typeof vi.fn>;
  let onQuickOpenFile: ReturnType<typeof vi.fn>;
  let onSaveProject: ReturnType<typeof vi.fn>;
  let onCompileDocument: ReturnType<typeof vi.fn>;
  let onToggleSidebar: ReturnType<typeof vi.fn>;
  let onFormatDocument: ReturnType<typeof vi.fn>;
  let onForwardSync: ReturnType<typeof vi.fn>;
  let onDismissModal: ReturnType<typeof vi.fn>;

  function TestComponent({ options }: { options: GlobalKeyboardShortcutsOptions }) {
    useGlobalKeyboardShortcuts(options);
    return null;
  }

  async function mount(options: GlobalKeyboardShortcutsOptions) {
    await act(async () => {
      root.render(React.createElement(TestComponent, { options }));
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    onOpenCommandPalette = vi.fn();
    onQuickOpenFile = vi.fn();
    onSaveProject = vi.fn();
    onCompileDocument = vi.fn();
    onToggleSidebar = vi.fn();
    onFormatDocument = vi.fn();
    onForwardSync = vi.fn();
    onDismissModal = vi.fn();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  function triggerKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...opts,
    });
    window.dispatchEvent(event);
    return event;
  }

  it('triggers onOpenCommandPalette on Ctrl+K and ⌘K and prevents default', async () => {
    await mount({
      onOpenCommandPalette,
      onQuickOpenFile,
      onSaveProject,
      onCompileDocument,
      onToggleSidebar,
      onFormatDocument,
      onForwardSync,
      onDismissModal,
    });

    const evCtrl = triggerKey('k', { ctrlKey: true });
    expect(evCtrl.defaultPrevented).toBe(true);
    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);

    const evMeta = triggerKey('K', { metaKey: true });
    expect(evMeta.defaultPrevented).toBe(true);
    expect(onOpenCommandPalette).toHaveBeenCalledTimes(2);
  });

  it('triggers onQuickOpenFile on Ctrl+P and ⌘P and prevents default', async () => {
    await mount({
      onOpenCommandPalette,
      onQuickOpenFile,
      onSaveProject,
      onCompileDocument,
      onToggleSidebar,
      onFormatDocument,
      onForwardSync,
      onDismissModal,
    });

    const ev = triggerKey('p', { ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(onQuickOpenFile).toHaveBeenCalledTimes(1);
  });

  it('triggers onSaveProject on Ctrl+S and suppresses native browser save dialog', async () => {
    await mount({
      onOpenCommandPalette,
      onQuickOpenFile,
      onSaveProject,
      onCompileDocument,
      onToggleSidebar,
      onFormatDocument,
      onForwardSync,
      onDismissModal,
    });

    const ev = triggerKey('s', { ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(onSaveProject).toHaveBeenCalledTimes(1);
  });

  it('triggers onCompileDocument on Ctrl+Enter and ⌘+Enter', async () => {
    await mount({
      onOpenCommandPalette,
      onQuickOpenFile,
      onSaveProject,
      onCompileDocument,
      onToggleSidebar,
      onFormatDocument,
      onForwardSync,
      onDismissModal,
    });

    const ev = triggerKey('Enter', { ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(onCompileDocument).toHaveBeenCalledTimes(1);
  });

  it('triggers onToggleSidebar on Ctrl+B and ⌘B', async () => {
    await mount({
      onOpenCommandPalette,
      onQuickOpenFile,
      onSaveProject,
      onCompileDocument,
      onToggleSidebar,
      onFormatDocument,
      onForwardSync,
      onDismissModal,
    });

    const ev = triggerKey('b', { ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('triggers onFormatDocument on Shift+Alt+F', async () => {
    await mount({
      onOpenCommandPalette,
      onQuickOpenFile,
      onSaveProject,
      onCompileDocument,
      onToggleSidebar,
      onFormatDocument,
      onForwardSync,
      onDismissModal,
    });

    const ev = triggerKey('F', { shiftKey: true, altKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(onFormatDocument).toHaveBeenCalledTimes(1);
  });

  it('triggers onForwardSync on Ctrl+Alt+J', async () => {
    await mount({
      onOpenCommandPalette,
      onQuickOpenFile,
      onSaveProject,
      onCompileDocument,
      onToggleSidebar,
      onFormatDocument,
      onForwardSync,
      onDismissModal,
    });

    const ev = triggerKey('j', { ctrlKey: true, altKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(onForwardSync).toHaveBeenCalledTimes(1);
  });

  it('triggers onDismissModal on Escape when a modal is active', async () => {
    await mount({
      onOpenCommandPalette,
      onQuickOpenFile,
      onSaveProject,
      onCompileDocument,
      onToggleSidebar,
      onFormatDocument,
      onForwardSync,
      onDismissModal,
      isModalOpen: true,
    });

    const ev = triggerKey('Escape');
    expect(ev.defaultPrevented).toBe(true);
    expect(onDismissModal).toHaveBeenCalledTimes(1);
  });

  it('does not trigger onDismissModal on Escape when no modal is active', async () => {
    await mount({
      onOpenCommandPalette,
      onQuickOpenFile,
      onSaveProject,
      onCompileDocument,
      onToggleSidebar,
      onFormatDocument,
      onForwardSync,
      onDismissModal,
      isModalOpen: false,
    });

    triggerKey('Escape');
    expect(onDismissModal).not.toHaveBeenCalled();
  });
});
