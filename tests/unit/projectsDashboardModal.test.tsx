// @vitest-environment happy-dom
// @ts-expect-error Global test flag for React 19 act()
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ProjectsDashboardModal } from '../../src/components/modals/ProjectsDashboardModal';
import type { Project, UserProfile } from '../../src/types/latex';

describe('ProjectsDashboardModal Component', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  const render = async (element: React.ReactElement) => {
    await act(async () => {
      root.render(element);
    });
    return container;
  };

  const click = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  };

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

  it('renders modal with correct dynamic tab counts', async () => {
    await render(
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

    expect(container.textContent).toContain('All (2)');
    expect(container.textContent).toContain('My Papers (1)');
    expect(container.textContent).toContain('Shared with Me (1)');
    expect(container.textContent).toContain('Archived (0)');
  });

  it('filters to shared papers when clicking "Shared with Me" tab', async () => {
    await render(
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

    const sharedTab = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Shared with Me'));
    expect(sharedTab).toBeDefined();
    await click(sharedTab!);

    // Neural Quantum State Tomography is visible
    expect(container.textContent).toContain('Neural Quantum State Tomography');
    // Untitled Project is filtered out
    expect(container.textContent).not.toContain('Untitled Project');
  });

  it('renders Delete button for owner and hides it for non-owners', async () => {
    const onDelete = vi.fn();
    await render(
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
    const deleteButtons = container.querySelectorAll('button[title*="Delete project"]');
    expect(deleteButtons.length).toBe(1);
  });

  it('closes modal when creating a new project', async () => {
    const onClose = vi.fn();
    const onCreate = vi.fn();
    await render(
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
    const newProjectBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('New Project'));
    expect(newProjectBtn).toBeDefined();
    await click(newProjectBtn!);

    // Fill title
    const input = container.querySelector('input[placeholder*="Project title"]') as HTMLInputElement;
    expect(input).toBeDefined();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'Relativistic Plasma Physics');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Submit
    const submitBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Initialize Project'));
    expect(submitBtn).toBeDefined();
    await click(submitBtn!);

    expect(onCreate).toHaveBeenCalledWith('Relativistic Plasma Physics', expect.any(String));
    expect(onClose).toHaveBeenCalled();
  });
});
