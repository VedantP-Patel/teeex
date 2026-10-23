import { createStore, useStore } from './createStore';

export type ViewMode = 'split' | 'editor' | 'preview' | 'outline';
export type EditorTab = 'write' | 'review';

export interface SyncTexPulse {
  page: number;
  x: number;
  y: number;
  timestamp: number;
}

export interface EditorSettingsState {
  fontSize: number;
  isWordWrap: boolean;
  isLineNumbers: boolean;
  splitPercentage: number;
  activeViewMode: ViewMode;
  activeTab: EditorTab;
  syncTexPulse: SyncTexPulse | null;
}

const initialState: EditorSettingsState = {
  fontSize: 14,
  isWordWrap: true,
  isLineNumbers: true,
  splitPercentage: 50,
  activeViewMode: 'split',
  activeTab: 'write',
  syncTexPulse: null,
};

export const editorStore = createStore<EditorSettingsState>(initialState);

export function setEditorSettings(partial: Partial<EditorSettingsState>): void {
  editorStore.setState(partial);
}

export function triggerSyncTexPulse(page: number, x: number, y: number): void {
  editorStore.setState({
    syncTexPulse: { page, x, y, timestamp: Date.now() },
  });
}

export function useEditorStore<T>(selector: (state: EditorSettingsState) => T): T {
  return useStore(editorStore, selector);
}
