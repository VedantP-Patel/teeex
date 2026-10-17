// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectsDashboardModal } from '../../src/components/modals/ProjectsDashboardModal';
import type { Project, UserProfile } from '../../src/types/latex';

describe('ProjectsDashboardModal Component', () => {
  const currentUser: UserProfile = {
    id: 'usr-local',
    email: 'you@teeex.local',
    fullName: 'You',
  };

  const sampleProjects: Project[] = [
    {
      id: 'proj-1',
      title: 'Untitled Project',
      ownerId: 'usr-local',
      ownerEmail: 'you@teeex.local',
      role: 'owner',
      createdAt: '2026-10-17T12:00:00.000Z',
      updatedAt: 'Just now',
      files: [{ id: 'main.tex', name: 'main.tex', content: '', isEntry: true }],
      folders: [],
      tags: ['#research'],
      members: [
        {
          id: 'usr-local',
          email: 'you@teeex.local',
          name: 'You',
          avatar: 'ME',
          avatarColor: '#38bdf8',
          role: 'owner',
          joinedAt: '2026-10-17',
        },
      ],
      isArchived: false,
    },
    {
      id: 'proj-2',
      title: 'Neural Quantum State Tomography',
      ownerId: 'usr-elena',
      ownerEmail: 'elena.rostova@mit.edu',
      role: 'owner', // static role legacy
      createdAt: '2026-10-17T10:00:00.000Z',
      updatedAt: '2h ago',
      files: [{ id: 'main.tex', name: 'main.tex', content: '', isEntry: true }],
      folders: [],
      tags: ['#quantum'],
      members: [
        {
          id: 'usr-elena',
          email: 'elena.rostova@mit.edu',
          name: 'Dr. Elena Rostova',
          avatar: 'ER',
          avatarColor: '#a855f7',
          role: 'owner',
          joinedAt: '2026-10-16',
        },
        {
          id: 'usr-local',
          email: 'you@teeex.local',
          name: 'You',
          avatar: 'ME',
          avatarColor: '#38bdf8',
          role: 'editor',
          joinedAt: '2026-10-17',
        },
      ],
      isArchived: false,
    },
  ];

  it('renders modal with correct dynamic tab counts', () => {
    render(
      <ProjectsDashboardModal
        isOpen={true}
        onClose={vi.fn()}
        projects={sampleProjects}
        activeProjectId="proj-1"
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onDuplicateProject={vi.fn()}
        onToggleArchiveProject={vi.fn()}
        onDeleteProject={vi.fn()}
        currentUser={currentUser}
      />
    );

    expect(screen.getByText('All (2)')).toBeDefined();
    expect(screen.getByText('My Papers (1)')).toBeDefined();
    expect(screen.getByText('Shared with Me (1)')).toBeDefined();
    expect(screen.getByText('Archived (0)')).toBeDefined();
  });

  it('filters to shared papers when clicking "Shared with Me" tab', () => {
    render(
      <ProjectsDashboardModal
        isOpen={true}
        onClose={vi.fn()}
        projects={sampleProjects}
        activeProjectId="proj-1"
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onDuplicateProject={vi.fn()}
        onToggleArchiveProject={vi.fn()}
        onDeleteProject={vi.fn()}
        currentUser={currentUser}
      />
    );

    const sharedTab = screen.getByText('Shared with Me (1)');
    fireEvent.click(sharedTab);

    // Neural Quantum State Tomography is visible
    expect(screen.getByText('Neural Quantum State Tomography')).toBeDefined();
    // Untitled Project is filtered out
    expect(screen.queryByText('Untitled Project')).toBeNull();
  });

  it('renders Delete button for owner and hides it for non-owners', () => {
    const onDelete = vi.fn();
    render(
      <ProjectsDashboardModal
        isOpen={true}
        onClose={vi.fn()}
        projects={sampleProjects}
        activeProjectId="proj-1"
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onDuplicateProject={vi.fn()}
        onToggleArchiveProject={vi.fn()}
        onDeleteProject={onDelete}
        currentUser={currentUser}
      />
    );

    // There should only be 1 delete button (for Untitled Project), not 2!
    const deleteButtons = screen.getAllByTitle('Delete project');
    expect(deleteButtons.length).toBe(1);
  });

  it('closes modal when creating a new project', () => {
    const onClose = vi.fn();
    const onCreate = vi.fn();
    render(
      <ProjectsDashboardModal
        isOpen={true}
        onClose={onClose}
        projects={sampleProjects}
        activeProjectId="proj-1"
        onSelectProject={vi.fn()}
        onCreateProject={onCreate}
        onDuplicateProject={vi.fn()}
        onToggleArchiveProject={vi.fn()}
        onDeleteProject={vi.fn()}
        currentUser={currentUser}
      />
    );

    // Open inline drawer
    fireEvent.click(screen.getByText('New Project'));

    // Fill title
    const input = screen.getByPlaceholderText('Project title (e.g. Non-Abelian Anyons & Braiding Dynamics)');
    fireEvent.change(input, { target: { value: 'Relativistic Plasma Physics' } });

    // Submit
    fireEvent.click(screen.getByText('Initialize Project'));

    expect(onCreate).toHaveBeenCalledWith('Relativistic Plasma Physics', expect.any(String));
    expect(onClose).toHaveBeenCalled();
  });
});
