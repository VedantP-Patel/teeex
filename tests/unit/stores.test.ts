import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from '../../src/stores/createStore';
import { modalStore, openModal, closeModal } from '../../src/stores/modalStore';
import { editorStore, setEditorSettings, triggerSyncTexPulse } from '../../src/stores/editorStore';
import { compilerStore, setCompilerState } from '../../src/stores/compilerStore';
import {
  projectStore,
  setProjects,
  setActiveProjectId,
  setFiles,
  setActiveFileId,
  updateFileContent,
} from '../../src/stores/projectStore';

describe('Modern Reactive Store Layer (createStore & Domain Slices)', () => {
  describe('createStore core', () => {
    it('creates a store with initial state and allows state updates', () => {
      const store = createStore({ count: 0, title: 'initial' });
      expect(store.getState()).toEqual({ count: 0, title: 'initial' });

      store.setState({ count: 1 });
      expect(store.getState()).toEqual({ count: 1, title: 'initial' });

      store.setState(prev => ({ count: prev.count + 5 }));
      expect(store.getState().count).toBe(6);
    });

    it('notifies subscribers on state updates', () => {
      const store = createStore({ active: false });
      let callCount = 0;

      const unsubscribe = store.subscribe(() => {
        callCount++;
      });

      store.setState({ active: true });
      expect(callCount).toBe(1);

      store.setState({ active: false });
      expect(callCount).toBe(2);

      unsubscribe();
      store.setState({ active: true });
      expect(callCount).toBe(2); // no further calls after unsubscribe
    });
  });

  describe('modalStore', () => {
    beforeEach(() => {
      closeModal();
    });

    it('opens and closes modals with associated props', () => {
      expect(modalStore.getState().activeModal).toBeNull();

      openModal('share', { roomId: 'room-101' });
      expect(modalStore.getState().activeModal).toBe('share');
      expect(modalStore.getState().props).toEqual({ roomId: 'room-101' });

      openModal('versionHistory');
      expect(modalStore.getState().activeModal).toBe('versionHistory');

      closeModal();
      expect(modalStore.getState().activeModal).toBeNull();
      expect(modalStore.getState().props).toEqual({});
    });
  });

  describe('editorStore', () => {
    it('updates editor settings and triggers SyncTeX pulse', () => {
      setEditorSettings({ fontSize: 16, isWordWrap: false });
      expect(editorStore.getState().fontSize).toBe(16);
      expect(editorStore.getState().isWordWrap).toBe(false);

      triggerSyncTexPulse(3, 120, 240);
      const pulse = editorStore.getState().syncTexPulse;
      expect(pulse).not.toBeNull();
      expect(pulse?.page).toBe(3);
      expect(pulse?.x).toBe(120);
      expect(pulse?.y).toBe(240);
      expect(typeof pulse?.timestamp).toBe('number');
    });
  });

  describe('compilerStore', () => {
    it('tracks compilation progress, diagnostics, and binary output', () => {
      setCompilerState({ isCompiling: true, durationMs: 150 });
      expect(compilerStore.getState().isCompiling).toBe(true);
      expect(compilerStore.getState().durationMs).toBe(150);

      const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      setCompilerState({ isCompiling: false, pdfBytes: fakePdf });
      expect(compilerStore.getState().isCompiling).toBe(false);
      expect(compilerStore.getState().pdfBytes).toBe(fakePdf);
    });
  });

  describe('projectStore', () => {
    it('manages projects, active file, and file contents reactively', () => {
      setActiveProjectId('proj-test-1');
      expect(projectStore.getState().activeProjectId).toBe('proj-test-1');

      setFiles([
        { id: 'main.tex', name: 'main.tex', content: '\\documentclass{article}', type: 'tex' },
        { id: 'intro.tex', name: 'intro.tex', content: 'Introduction', type: 'tex' },
      ]);
      expect(projectStore.getState().files.length).toBe(2);

      setActiveFileId('intro.tex');
      expect(projectStore.getState().activeFileId).toBe('intro.tex');
      expect(projectStore.getState().openFileIds).toContain('intro.tex');

      updateFileContent('intro.tex', 'Updated Introduction');
      const intro = projectStore.getState().files.find(f => f.id === 'intro.tex');
      expect(intro?.content).toBe('Updated Introduction');
    });
  });
});
