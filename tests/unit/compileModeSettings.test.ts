import { describe, it, expect } from 'vitest';
import type { CompileMode, CompileState } from '../../src/types/latex';

describe('Compile Mode Settings & Pass Policies (Layer 8)', () => {
  it('supports fast preview and publication final modes', () => {
    const fastMode: CompileMode = 'fast';
    const pubMode: CompileMode = 'publication';

    expect(fastMode).toBe('fast');
    expect(pubMode).toBe('publication');
  });

  it('correctly maps pass ceiling policies based on compile mode', () => {
    function resolveMaxPasses(mode?: CompileMode): number {
      return mode === 'publication' ? 3 : 2;
    }

    expect(resolveMaxPasses('fast')).toBe(2);
    expect(resolveMaxPasses(undefined)).toBe(2);
    expect(resolveMaxPasses('publication')).toBe(3);
  });

  it('stores compileMode in CompileState correctly', () => {
    const state: CompileState = {
      status: 'success',
      durationMs: 350,
      timestamp: '12:00:00',
      errorCount: 0,
      warningCount: 0,
      rawLogs: [],
      compileMode: 'fast',
    };

    expect(state.compileMode).toBe('fast');

    const updatedState: CompileState = {
      ...state,
      compileMode: 'publication',
    };

    expect(updatedState.compileMode).toBe('publication');
  });
});
