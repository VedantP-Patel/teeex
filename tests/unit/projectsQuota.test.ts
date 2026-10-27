// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveProjects, pushProjectToCloud } from '../../src/services/projectsService';
import type { Project } from '../../src/types/latex';

// Mock offline storage
vi.mock('../../src/services/offlineStorageService', () => {
  const memStore = new Map<string, Project>();
  return {
    saveProjectOffline: vi.fn(async (project: Project) => {
      memStore.set(project.id, JSON.parse(JSON.stringify(project)));
    }),
    loadProjectOffline: vi.fn(async (projectId: string) => {
      return memStore.get(projectId) || null;
    }),
  };
});

// Mock Supabase
vi.mock('../../src/services/supabaseClient', () => {
  return {
    getSupabaseClient: vi.fn(() => ({
      from: vi.fn(() => ({
        upsert: vi.fn(async (row: any) => {
          if (row.id === 'proj-starter') {
            return {
              error: {
                code: '42501',
                message: 'new row violates row-level security policy (USING expression) for table "projects"',
              },
            };
          }
          return { error: null };
        }),
      })),
    })),
    getAuthUid: vi.fn(async () => 'user-test-uid-123'),
  };
});

describe('Projects Storage & Quota Resilience', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('safely tiers massive manuscript to IndexedDB and stores quota-safe stubs in localStorage', () => {
    // Create a 35,000-line LaTeX manuscript (~2 MB)
    const massiveContent = '\\documentclass{article}\n' + 'Line of document content with scientific symbols \\alpha \\beta\n'.repeat(35000);
    const massiveProject: Project = {
      id: 'proj-large-doc',
      title: 'MAKERNOVA 4.0 Drone Report',
      ownerId: 'usr-local',
      ownerEmail: 'you@teeex.local',
      role: 'owner',
      createdAt: new Date().toISOString(),
      updatedAt: 'Just now',
      files: [
        {
          id: 'main.tex',
          name: 'main.tex',
          content: massiveContent,
        },
      ],
      folders: ['sections', 'figures'],
      tags: ['#research'],
      members: [],
      isArchived: false,
    };

    // Simulate localStorage quota error on raw save
    const store = new Map<string, string>();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (typeof value === 'string' && value.length > 500000) {
        const quotaErr = new Error('Setting the value of "teeex_saved_projects" exceeded the quota.');
        quotaErr.name = 'QuotaExceededError';
        throw quotaErr;
      }
      store.set(key, value);
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => store.get(key) || null);

    // Calling saveProjects should NOT throw QuotaExceededError
    expect(() => saveProjects([massiveProject])).not.toThrow();

    // Verify localStorage received a quota-safe version
    const stored = store.get('teeex_saved_projects');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed[0].id).toBe('proj-large-doc');
    expect(parsed[0].files[0]._persistedInIdb).toBe(true);
    expect(parsed[0].files[0].content.length).toBeLessThan(10000);
  });

  it('re-keys template projects when encountering Supabase RLS collisions', async () => {
    const starterProject: Project = {
      id: 'proj-starter',
      title: 'My First Project',
      ownerId: 'usr-local',
      ownerEmail: 'you@teeex.local',
      role: 'owner',
      createdAt: new Date().toISOString(),
      updatedAt: 'Just now',
      files: [{ id: 'main.tex', name: 'main.tex', content: 'test' }],
      folders: ['sections'],
      tags: [],
      members: [],
      isArchived: false,
    };

    const res = await pushProjectToCloud(starterProject);
    expect(res.success).toBe(true);
  });
});
