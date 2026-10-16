// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadProjectCheckpoints,
  saveProjectCheckpoints,
  createCheckpoint,
  deleteCheckpoint,
  haveFilesChanged,
} from '../../src/services/checkpointsService';
import {
  getStoredSession,
  saveSession,
  clearSession,
  isLocalProfile,
  startLocalWorkspace,
} from '../../src/services/authService';
import type { ProjectFile, UserProfile } from '../../src/types/latex';

describe('Checkpoints & Version History Service', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  const dummyFiles: ProjectFile[] = [
    { id: 'f-1', name: 'main.tex', content: '\\documentclass{article}\\begin{document}Hello\\end{document}', type: 'tex' },
  ];

  it('loads checkpoints and generates baseline if none exist', () => {
    const cps = loadProjectCheckpoints('test-proj', dummyFiles, 'Test Author');
    expect(cps.length).toBe(1);
    expect(cps[0].name).toBe('Initial Baseline');
    expect(cps[0].author).toBe('Test Author');
    expect(cps[0].files[0].content).toContain('Hello');
  });

  it('creates manual snapshots and saves them in order', () => {
    createCheckpoint('test-proj', 'Snapshot 1', 'Author', dummyFiles, false);
    const cps = loadProjectCheckpoints('test-proj');
    expect(cps.length).toBe(1);
    expect(cps[0].name).toBe('Snapshot 1');
    expect(cps[0].isAutoSave).toBe(false);

    createCheckpoint('test-proj', 'Snapshot 2', 'Author', dummyFiles, false);
    const updated = loadProjectCheckpoints('test-proj');
    expect(updated.length).toBe(2);
    expect(updated[0].name).toBe('Snapshot 2');
  });

  it('correctly creates auto-save checkpoints', () => {
    const autoCp = createCheckpoint('test-proj', 'Auto-save (12:00)', 'Author', dummyFiles, true);
    expect(autoCp.isAutoSave).toBe(true);

    const loaded = loadProjectCheckpoints('test-proj');
    expect(loaded[0].isAutoSave).toBe(true);
  });

  it('deletes checkpoints properly', async () => {
    const cp = createCheckpoint('test-proj', 'To Delete', 'Author', dummyFiles, false);
    const remaining = await deleteCheckpoint('test-proj', cp.id);
    expect(remaining.some(c => c.id === cp.id)).toBe(false);
  });

  it('detects file modifications for autosave trigger', () => {
    const filesA: ProjectFile[] = [
      { id: '1', name: 'main.tex', content: 'abc', type: 'tex' },
    ];
    const filesB: ProjectFile[] = [
      { id: '1', name: 'main.tex', content: 'abc', type: 'tex' },
    ];
    const filesC: ProjectFile[] = [
      { id: '1', name: 'main.tex', content: 'abcdef', type: 'tex' },
    ];

    expect(haveFilesChanged(filesA, filesB)).toBe(false);
    expect(haveFilesChanged(filesA, filesC)).toBe(true);
  });
});

describe('Session persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('persists session in localStorage when rememberMe is true', () => {
    const user: UserProfile = {
      id: 'local-abc',
      email: 'local-abc@local.invalid',
      fullName: 'Local Author',
      authProvider: 'local',
    };

    saveSession(user, true);

    const stored = getStoredSession();
    expect(stored.user).not.toBeNull();
    expect(stored.user?.email).toBe('local-abc@local.invalid');
    expect(stored.rememberMe).toBe(true);
    expect(localStorage.getItem('teeex_remember_me')).toBe('true');
  });

  /**
   * The stored session used to carry isAdmin/isApproved behind a checksum whose
   * salt ships in the same bundle, so anyone could mint an admin session from
   * devtools. Privileges are now resolved from the server per session and are
   * never persisted — so even a perfectly-signed record cannot grant them.
   */
  it('never restores privileges from storage, even when asked to', () => {
    const user: UserProfile = {
      id: '1788ae39-7e82-41c3-aaa5-af6d9b5a6184',
      email: 'someone@example.com',
      fullName: 'Someone',
      isAdmin: true,
      isApproved: true,
      authProvider: 'supabase',
    };

    saveSession(user, true);

    const raw = localStorage.getItem('teeex_auth_user') ?? '';
    expect(raw).not.toContain('isAdmin');
    expect(raw).not.toContain('isApproved');

    const stored = getStoredSession();
    expect(stored.user?.email).toBe('someone@example.com');
    expect(stored.user?.isAdmin).toBe(false);
    // A cloud identity is unapproved until the server says otherwise.
    expect(stored.user?.isApproved).toBe(false);
  });

  it('rejects a session record whose contents were edited', () => {
    saveSession(
      {
        id: 'local-xyz',
        email: 'local-xyz@local.invalid',
        fullName: 'Local Author',
        authProvider: 'local',
      },
      true,
    );

    const wrapper = JSON.parse(localStorage.getItem('teeex_auth_user')!);
    wrapper.user.id = 'someone-elses-id';
    localStorage.setItem('teeex_auth_user', JSON.stringify(wrapper));

    expect(getStoredSession().user).toBeNull();
  });

  it('persists session in sessionStorage when rememberMe is false', () => {
    const user: UserProfile = {
      id: 'local-guest',
      email: 'local-guest@local.invalid',
      fullName: 'Temp User',
      authProvider: 'local',
    };

    saveSession(user, false);

    const stored = getStoredSession();
    expect(stored.user).not.toBeNull();
    expect(stored.rememberMe).toBe(false);
    expect(localStorage.getItem('teeex_auth_user')).toBeNull();
  });

  it('clears session properly upon sign out', () => {
    startLocalWorkspace('Local Author', true);
    expect(getStoredSession().user).not.toBeNull();

    clearSession();
    expect(getStoredSession().user).toBeNull();
    expect(localStorage.getItem('teeex_signed_out')).toBe('true');
  });

  it('creates a local workspace with no privileges and a stable id', () => {
    const first = startLocalWorkspace('Local Author');
    expect(first.user.authProvider).toBe('local');
    expect(first.user.isAdmin).toBe(false);
    expect(isLocalProfile(first.user)).toBe(true);

    // The id is per-browser, so reopening the workspace keeps project ownership.
    const second = startLocalWorkspace('Renamed Author');
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.fullName).toBe('Renamed Author');
  });

  it('treats a cloud identity as not local', () => {
    const supabaseUser: UserProfile = {
      id: '99999999-1111-2222-3333-444444444444',
      email: 'cloud@user.com',
      fullName: 'Cloud User',
      authProvider: 'supabase',
    };
    expect(isLocalProfile(supabaseUser)).toBe(false);
  });
});
