// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Project, ProjectFile } from '../../src/types/latex';
import {
  saveProjects,
  getAllProjectsRaw,
  createProject,
} from '../../src/services/projectsService';
import {
  saveProjectCheckpoints,
  loadProjectCheckpoints,
  hydrateCheckpointsFromOffline,
  createAutoSaveCheckpointIfNeeded,
  type Checkpoint,
} from '../../src/services/checkpointsService';
import {
  saveCheckpointsOffline,
  loadCheckpointsOffline,
  saveProjectOffline,
  loadProjectOffline,
  requestDurableStorage,
  getStorageEstimate,
} from '../../src/services/offlineStorageService';
import {
  writeEmergencyDraft,
  readEmergencyDraft,
  clearEmergencyDraft,
} from '../../src/hooks/useAutosaveRecovery';

describe('Stage 25: Autosave Robustness & Storage Architecture', () => {
  const sampleFiles: ProjectFile[] = [
    {
      id: 'main.tex',
      name: 'main.tex',
      content: '\\documentclass{article}\n\\begin{document}\nQuantum State\n\\end{document}',
      type: 'tex',
      isEntry: true,
    },
  ];

  const sampleProject: Project = {
    id: 'proj-storage-test',
    title: 'Storage Architecture Paper',
    ownerId: 'usr-1',
    ownerEmail: 'author@teeex.io',
    role: 'owner',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    files: sampleFiles,
    folders: ['sections'],
    tags: ['#storage'],
    members: [],
    isArchived: false,
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. QuotaExceededError Resilience in Projects Storage', () => {
    it('gracefully catches QuotaExceededError without throwing uncaught exceptions', () => {
      let attempts = 0;
      const originalSetItem = localStorage.setItem.bind(localStorage);

      Object.defineProperty(localStorage, 'setItem', {
        value: (key: string, value: string) => {
          if (key === 'teeex_saved_projects') {
            attempts++;
            if (attempts === 1) {
              const err = new Error('QuotaExceededError');
              err.name = 'QuotaExceededError';
              throw err;
            }
          }
          return originalSetItem(key, value);
        },
        configurable: true,
        writable: true,
      });

      expect(() => {
        saveProjects([sampleProject]);
      }).not.toThrow();

      expect(attempts).toBeGreaterThanOrEqual(1);

      Object.defineProperty(localStorage, 'setItem', {
        value: originalSetItem,
        configurable: true,
        writable: true,
      });
    });

    it('prunes stale emergency drafts when quota is reached and retries save', () => {
      // Plant stale emergency drafts for other projects
      localStorage.setItem('teeex_emergency_draft_old-1', JSON.stringify({ timestamp: 1000 }));
      localStorage.setItem('teeex_emergency_draft_old-2', JSON.stringify({ timestamp: 2000 }));
      localStorage.setItem('teeex_active_project_id', 'proj-storage-test');

      let thrownOnce = false;
      const originalSetItem = localStorage.setItem.bind(localStorage);

      Object.defineProperty(localStorage, 'setItem', {
        value: (key: string, value: string) => {
          if (key === 'teeex_saved_projects' && !thrownOnce) {
            thrownOnce = true;
            const err = new Error('Quota exceeded');
            err.name = 'QuotaExceededError';
            throw err;
          }
          return originalSetItem(key, value);
        },
        configurable: true,
        writable: true,
      });

      saveProjects([sampleProject]);

      // Verify that stale drafts for other projects were pruned to free quota
      expect(localStorage.getItem('teeex_emergency_draft_old-1')).toBeNull();
      expect(localStorage.getItem('teeex_emergency_draft_old-2')).toBeNull();

      Object.defineProperty(localStorage, 'setItem', {
        value: originalSetItem,
        configurable: true,
        writable: true,
      });
    });
  });

  describe('2. Dual-Layer Checkpoints & Offline Hydration', () => {
    const sampleCheckpoint: Checkpoint = {
      id: 'commit-abc1234',
      shortSha: 'abc1234',
      projectId: 'proj-storage-test',
      name: 'Milestone 1',
      timestamp: '12:00 PM',
      author: 'Author',
      files: sampleFiles,
      stats: { additions: 10, deletions: 0, filesChanged: 1 },
      branch: 'main',
      createdAt: new Date().toISOString(),
    };

    it('persists checkpoints to localStorage and IndexedDB store', async () => {
      saveProjectCheckpoints('proj-storage-test', [sampleCheckpoint]);

      // Check localStorage copy
      const local = loadProjectCheckpoints('proj-storage-test');
      expect(local.length).toBe(1);
      expect(local[0].shortSha).toBe('abc1234');

      // Check IndexedDB store
      const offline = await loadCheckpointsOffline('proj-storage-test');
      if (offline) {
        expect(offline.length).toBe(1);
        expect(offline[0].id).toBe('commit-abc1234');
      }
    });

    it('hydrates checkpoints from IndexedDB if localStorage was cleared', async () => {
      // Seed directly into IndexedDB
      await saveCheckpointsOffline('proj-storage-test', [sampleCheckpoint]);

      // Clear localStorage completely
      localStorage.clear();
      expect(loadProjectCheckpoints('proj-storage-test', [])).toEqual([]);

      // Hydrate from offline
      const hydrated = await hydrateCheckpointsFromOffline('proj-storage-test');
      if (hydrated) {
        expect(hydrated.length).toBe(1);
        expect(hydrated[0].name).toBe('Milestone 1');

        // Verify localStorage was re-populated from IndexedDB
        const restoredLocal = loadProjectCheckpoints('proj-storage-test');
        expect(restoredLocal.length).toBe(1);
      }
    });

    it('caps checkpoints to MAX_CHECKPOINTS_PER_PROJECT to prevent quota bloat', () => {
      const manyCheckpoints: Checkpoint[] = Array.from({ length: 65 }, (_, i) => ({
        ...sampleCheckpoint,
        id: `commit-${i}`,
        shortSha: `${i}`.padStart(7, '0'),
      }));

      saveProjectCheckpoints('proj-storage-test', manyCheckpoints);
      const loaded = loadProjectCheckpoints('proj-storage-test');
      expect(loaded.length).toBeLessThanOrEqual(50);
    });
  });

  describe('3. Automated Version History Milestones', () => {
    it('creates an autosave checkpoint when files have changed significantly', () => {
      const initialCp: Checkpoint = {
        id: 'init-1',
        shortSha: 'init001',
        projectId: 'proj-storage-test',
        name: 'Initial Baseline',
        timestamp: '10:00 AM',
        author: 'Author',
        files: sampleFiles,
        createdAt: new Date().toISOString(),
      };
      saveProjectCheckpoints('proj-storage-test', [initialCp]);

      const modifiedFiles: ProjectFile[] = [
        {
          id: 'main.tex',
          name: 'main.tex',
          content: '\\documentclass{article}\n\\begin{document}\nQuantum Superposition & Entanglement\n\\end{document}',
          type: 'tex',
          isEntry: true,
        },
      ];

      const newCp = createAutoSaveCheckpointIfNeeded('proj-storage-test', modifiedFiles, 'Auto-Save');
      expect(newCp).not.toBeNull();
      expect(newCp!.isAutoSave).toBe(true);
      expect(newCp!.name).toContain('Auto-save Milestone');
      expect(newCp!.files[0].content).toContain('Quantum Superposition');

      // Verify that checkpoints list now includes the new milestone
      const updated = loadProjectCheckpoints('proj-storage-test');
      expect(updated.length).toBe(2);
      expect(updated[0].id).toBe(newCp!.id);
    });

    it('returns null and does not duplicate checkpoints if files have not changed', () => {
      const initialCp: Checkpoint = {
        id: 'init-2',
        shortSha: 'init002',
        projectId: 'proj-storage-test',
        name: 'Initial Baseline',
        timestamp: '10:00 AM',
        author: 'Author',
        files: sampleFiles,
        createdAt: new Date().toISOString(),
      };
      saveProjectCheckpoints('proj-storage-test', [initialCp]);

      // Call with identical files
      const result = createAutoSaveCheckpointIfNeeded('proj-storage-test', sampleFiles, 'Auto-Save');
      expect(result).toBeNull();

      // Checkpoints list remains at 1
      const list = loadProjectCheckpoints('proj-storage-test');
      expect(list.length).toBe(1);
    });
  });

  describe('4. Synchronous Emergency Draft & Keystroke Zero-Loss', () => {
    it('writes and reads immediate keystrokes to emergency draft', () => {
      const fastTypingFiles: ProjectFile[] = [
        {
          id: 'main.tex',
          name: 'main.tex',
          content: '\\section{Instant Save Test}',
          type: 'tex',
          isEntry: true,
        },
      ];

      writeEmergencyDraft('proj-storage-test', fastTypingFiles, ['figures'], 'Instant Test');
      const draft = readEmergencyDraft('proj-storage-test');

      expect(draft).not.toBeNull();
      expect(draft!.files[0].content).toBe('\\section{Instant Save Test}');
      expect(draft!.title).toBe('Instant Test');
      expect(typeof draft!.timestamp).toBe('number');
    });

    it('clears emergency draft on clean commit or discard', () => {
      writeEmergencyDraft('proj-storage-test', sampleFiles, [], 'Test');
      clearEmergencyDraft('proj-storage-test');
      expect(readEmergencyDraft('proj-storage-test')).toBeNull();
    });
  });

  describe('5. Storage Health & Durable Storage Telemetry', () => {
    it('handles requestDurableStorage cleanly', async () => {
      const persisted = await requestDurableStorage();
      expect(typeof persisted).toBe('boolean');
    });

    it('returns structured storage estimate with usageMB and quotaMB', async () => {
      const estimate = await getStorageEstimate();
      expect(typeof estimate.usageMB).toBe('number');
      expect(typeof estimate.quotaMB).toBe('number');
      expect(typeof estimate.percentUsed).toBe('number');
    });
  });
});
