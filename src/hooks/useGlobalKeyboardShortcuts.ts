import { useEffect } from 'react';

export interface GlobalKeyboardShortcutsOptions {
  onOpenCommandPalette: () => void;
  onQuickOpenFile?: () => void;
  onSaveProject?: () => void;
  onCompileDocument?: () => void;
  onToggleSidebar?: () => void;
  onFormatDocument?: () => void;
  onForwardSync?: () => void;
  onDismissModal?: () => void;
  isModalOpen?: boolean;
}

export function useGlobalKeyboardShortcuts({
  onOpenCommandPalette,
  onQuickOpenFile,
  onSaveProject,
  onCompileDocument,
  onToggleSidebar,
  onFormatDocument,
  onForwardSync,
  onDismissModal,
  isModalOpen,
}: GlobalKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Escape: dismissal cascade (close active modal/drawer/dropdown)
      if (e.key === 'Escape') {
        if (onDismissModal && (isModalOpen === undefined || isModalOpen)) {
          e.preventDefault();
          onDismissModal();
        }
        return;
      }

      // If a modal is open, let the modal trap focus and handle internal keys
      // unless it's a global toggle
      if (isModalOpen && key !== 'k') {
        return;
      }

      // Mod+K: Toggle Universal Command Palette
      if (isMod && key === 'k') {
        e.preventDefault();
        onOpenCommandPalette();
        return;
      }

      // Mod+P: Quick Open Files
      if (isMod && key === 'p') {
        e.preventDefault();
        if (onQuickOpenFile) {
          onQuickOpenFile();
        } else {
          onOpenCommandPalette();
        }
        return;
      }

      // Mod+S: Manual Checkpoint / Save Project (suppresses native browser "Save As")
      if (isMod && key === 's') {
        e.preventDefault();
        onSaveProject?.();
        return;
      }

      // Mod+Enter: Compile Document
      if (isMod && (e.key === 'Enter' || e.code === 'Enter')) {
        e.preventDefault();
        onCompileDocument?.();
        return;
      }

      // Mod+B or Mod+\: Toggle Sidebar
      if (isMod && (key === 'b' || e.key === '\\')) {
        e.preventDefault();
        onToggleSidebar?.();
        return;
      }

      // Shift+Alt+F: Format LaTeX Document
      if (e.shiftKey && e.altKey && key === 'f') {
        e.preventDefault();
        onFormatDocument?.();
        return;
      }

      // Mod+Alt+J: Forward SyncTeX from Editor to Preview
      if (isMod && e.altKey && key === 'j') {
        e.preventDefault();
        onForwardSync?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onOpenCommandPalette,
    onQuickOpenFile,
    onSaveProject,
    onCompileDocument,
    onToggleSidebar,
    onFormatDocument,
    onForwardSync,
    onDismissModal,
    isModalOpen,
  ]);
}
