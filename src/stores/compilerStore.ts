import { createStore, useStore } from './createStore';
import type { EngineStatus } from '../services/latexCompiler';
import type { CompileDiagnostic } from '../services/texLog';

export interface CompilerState {
  status: EngineStatus;
  pdfBytes: Uint8Array | null;
  synctex: Uint8Array | null;
  diagnostics: CompileDiagnostic[];
  log: string;
  isCompiling: boolean;
  durationMs: number;
}

const initialState: CompilerState = {
  status: { phase: 'idle', progress: 0, engine: 'pdflatex' },
  pdfBytes: null,
  synctex: null,
  diagnostics: [],
  log: '',
  isCompiling: false,
  durationMs: 0,
};

export const compilerStore = createStore<CompilerState>(initialState);

export function setCompilerState(partial: Partial<CompilerState>): void {
  compilerStore.setState(partial);
}

export function useCompilerStore<T>(selector: (state: CompilerState) => T): T {
  return useStore(compilerStore, selector);
}
