// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveUserProjectRole,
  formatRelativeTime,
  loadProjects,
  getAllProjectsRaw,
  saveProjects,
  createProject,
  deleteProject,
  toggleArchiveProject,
  updateProject,
} from '../../src/services/projectsService';
import type { Project, UserProfile } from '../../src/types/latex';

describe('Projects Service & Dynamic Role Resolution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const mockOwnerUser: UserProfile = {
    id: 'usr-prof-1',
    email: 'alice@mit.edu',
    fullName: 'Alice Smith',
  };

  const mockEditorUser: UserProfile = {
    id: 'usr-prof-2',
    email: 'bob@stanford.edu',
    fullName: 'Bob Jones',
  };

  const mockViewerUser: UserProfile = {
    id: 'usr-prof-3',
    email: 'carol@oxford.ac.uk',
    fullName: 'Carol White',
  };

  const sampleProject: Project = {
    id: 'proj-test-1',
    title: 'Topological Quantum Memory',
    ownerId: 'usr-prof-1',
    ownerEmail: 'alice@mit.edu',
    role: 'owner', // static role legacy field
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    files: [{ id: 'main.tex', name: 'main.tex', content: '\\documentclass{article}', isEntry: true }],
    folders: [],
    tags: ['#quantum'],
    members: [
      {
        id: 'usr-prof-1',
        email: 'alice@mit.edu',
        name: 'Alice Smith',
        avatar: 'AS',
        avatarColor: '#38bdf8',
        role: 'owner',
        joinedAt: '2026-10-15',
      },
      {
        id: 'usr-prof-2',
        email: 'bob@stanford.edu',
        name: 'Bob Jones',
        avatar: 'BJ',
        avatarColor: '#10b981',
        role: 'editor',
        joinedAt: '2026-10-16',
      },
      {
        id: 'usr-prof-3',
        email: 'carol@oxford.ac.uk',
        name: 'Carol White',
        avatar: 'CW',
        avatarColor: '#f59e0b',
        role: 'viewer',
        joinedAt: '2026-10-17',
      },
    ],
    isArchived: false,
  };

  describe('resolveUserProjectRole', () => {
    it('resolves role as "owner" when current user email matches project ownerEmail', () => {
      const role = resolveUserProjectRole(sampleProject, mockOwnerUser);
      expect(role).toBe('owner');
    });

    it('resolves role as "owner" case-insensitively', () => {
      const userUpper: UserProfile = { ...mockOwnerUser, email: 'ALICE@MIT.EDU' };
      const role = resolveUserProjectRole(sampleProject, userUpper);
      expect(role).toBe('owner');
    });

    it('resolves role as "editor" when current user is in members as editor', () => {
      const role = resolveUserProjectRole(sampleProject, mockEditorUser);
      expect(role).toBe('editor');
    });

    it('resolves role as "viewer" when current user is in members as viewer', () => {
      const role = resolveUserProjectRole(sampleProject, mockViewerUser);
      expect(role).toBe('viewer');
    });

    it('resolves role as "viewer" when user is not owner and not in members', () => {
      const externalUser: UserProfile = {
        id: 'usr-external',
        email: 'dave@cern.ch',
        fullName: 'Dave Wilson',
      };
      const role = resolveUserProjectRole(sampleProject, externalUser);
      expect(role).toBe('viewer');
    });

    it('resolves local guest projects as "owner" when user is null', () => {
      const localProject: Project = {
        ...sampleProject,
        ownerId: 'usr-local',
        ownerEmail: 'you@teeex.local',
      };
      const role = resolveUserProjectRole(localProject, null);
      expect(role).toBe('owner');
    });

    it('resolves shared starter project as "editor" for guest if listed in members', () => {
      const sharedStarter: Project = {
        ...sampleProject,
        ownerId: 'usr-elena-rostova',
        ownerEmail: 'elena.rostova@mit.edu',
        members: [
          {
            id: 'usr-elena-rostova',
            email: 'elena.rostova@mit.edu',
            name: 'Dr. Elena Rostova',
            avatar: 'ER',
            avatarColor: '#a855f7',
            role: 'owner',
            joinedAt: '2026-10-15',
          },
          {
            id: 'usr-local',
            email: 'you@teeex.local',
            name: 'You',
            avatar: 'ME',
            avatarColor: '#38bdf8',
            role: 'editor',
            joinedAt: '2026-10-16',
          },
        ],
      };
      const role = resolveUserProjectRole(sharedStarter, null);
      expect(role).toBe('editor');
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "Just now" for dates under 45 seconds ago', () => {
      const now = new Date(Date.now() - 10000).toISOString();
      expect(formatRelativeTime(now)).toBe('Just now');
    });

    it('returns minutes ago for dates within an hour', () => {
      const fiveMinsAgo = new Date(Date.now() - 300000).toISOString();
      expect(formatRelativeTime(fiveMinsAgo)).toBe('5m ago');
    });

    it('returns hours ago for dates within 24 hours', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
      expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
    });

    it('returns "Yesterday" for dates between 24 and 48 hours ago', () => {
      const yesterday = new Date(Date.now() - 30 * 3600000).toISOString();
      expect(formatRelativeTime(yesterday)).toBe('Yesterday');
    });

    it('preserves existing relative string like "Just now" or "2h ago"', () => {
      expect(formatRelativeTime('Just now')).toBe('Just now');
      expect(formatRelativeTime('2h ago')).toBe('2h ago');
      expect(formatRelativeTime(undefined)).toBe('Recently');
    });
  });

  describe('loadProjects and scoped mutations', () => {
    it('loads initial projects with both owned and shared papers out of the box', () => {
      const projects = loadProjects();
      expect(projects.length).toBeGreaterThanOrEqual(2);

      const owned = projects.find(p => p.id === 'proj-starter');
      expect(owned).toBeDefined();
      expect(owned?.role).toBe('owner');

      const shared = projects.find(p => p.id === 'proj-neural-quantum');
      expect(shared).toBeDefined();
      expect(shared?.role).toBe('editor');
    });

    it('scopes projects for a logged-in user and creates a first paper if empty', () => {
      const userProjects = loadProjects('newauthor@princeton.edu', 'New Author');
      expect(userProjects.length).toBe(1);
      expect(userProjects[0].ownerEmail).toBe('newauthor@princeton.edu');
      expect(userProjects[0].role).toBe('owner');
    });

    it('updates and deletes projects cleanly while preserving scope', () => {
      const created = createProject('My Draft', 'tester@teeex.io', 'Tester');
      expect(created.title).toBe('My Draft');

      const updatedList = updateProject(created.id, { title: 'Renamed Draft' });
      const target = updatedList.find(p => p.id === created.id);
      expect(target?.title).toBe('Renamed Draft');

      const afterDelete = deleteProject(created.id);
      expect(afterDelete.some(p => p.id === created.id)).toBe(false);
    });

    it('toggles archive status properly', () => {
      const created = createProject('Archive Me', 'archivist@teeex.io', 'Archivist');
      expect(created.isArchived).toBe(false);

      const afterToggle = toggleArchiveProject(created.id);
      const archived = afterToggle.find(p => p.id === created.id);
      expect(archived?.isArchived).toBe(true);
    });
  });
});
