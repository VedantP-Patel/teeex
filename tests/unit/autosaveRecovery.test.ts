// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import type { Project, ProjectFile } from '../../src/types/latex';
import {
  clearEmergencyDraft,
  getEmergencyDraftKey,
  readEmergencyDraft,
  writeEmergencyDraft,
} from '../../src/hooks/useAutosaveRecovery';

describe('Autosave & Crash Recovery Engine', () => {
  const sampleFiles: ProjectFile[] = [
    {
      id: 'main.tex',
      name: 'main.tex',
      content: '\\documentclass{article}\n\\begin{document}\nCrash test draft\n\\end{document}',
      type: 'tex',
      isEntry: true,
    },
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  it('writes and reads emergency draft to synchronous localStorage mirror', () => {
    writeEmergencyDraft('proj-123', sampleFiles, ['figures'], 'Test Crash Project');
    const draft = readEmergencyDraft('proj-123');

    expect(draft).not.toBeNull();
    expect(draft!.fileCount).toBe(1);
    expect(draft!.files[0].content).toContain('Crash test draft');
    expect(draft!.title).toBe('Test Crash Project');
    expect(draft!.folders).toEqual(['figures']);
    expect(typeof draft!.timestamp).toBe('number');
  });

  it('clears emergency draft from storage', () => {
    writeEmergencyDraft('proj-123', sampleFiles, [], 'Test');
    expect(localStorage.getItem(getEmergencyDraftKey('proj-123'))).not.toBeNull();

    clearEmergencyDraft('proj-123');
    expect(readEmergencyDraft('proj-123')).toBeNull();
    expect(localStorage.getItem(getEmergencyDraftKey('proj-123'))).toBeNull();
  });

  it('handles invalid or corrupted JSON gracefully', () => {
    localStorage.setItem(getEmergencyDraftKey('proj-corrupted'), '{not-valid-json');
    expect(readEmergencyDraft('proj-corrupted')).toBeNull();
  });
});
