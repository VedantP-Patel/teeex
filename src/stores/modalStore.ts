import { createStore, useStore } from './createStore';

export type ModalId =
  | 'auth'
  | 'projectsHub'
  | 'share'
  | 'template'
  | 'encryption'
  | 'versionHistory'
  | 'commandPalette'
  | 'wordCount'
  | 'tableBuilder'
  | 'symbolPalette'
  | 'auditLog'
  | 'imageUpload';

export interface ModalState {
  activeModal: ModalId | null;
  props: Record<string, unknown>;
}

const initialState: ModalState = {
  activeModal: null,
  props: {},
};

export const modalStore = createStore<ModalState>(initialState);

export function openModal(id: ModalId, props: Record<string, unknown> = {}): void {
  modalStore.setState({ activeModal: id, props });
}

export function closeModal(): void {
  modalStore.setState({ activeModal: null, props: {} });
}

export function useModalStore<T>(selector: (state: ModalState) => T): T {
  return useStore(modalStore, selector);
}

export function useIsModalOpen(id: ModalId): boolean {
  return useModalStore(state => state.activeModal === id);
}
