// @vitest-environment happy-dom
// @ts-expect-error Global test flag for React 19 act()
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Navbar } from '../../src/components/Navbar';
import { EngineWarmupBadge } from '../../src/components/EngineWarmupBadge';
import type { CompileState, Collaborator, Project, UserProfile } from '../../src/types/latex';
import type { EngineStatus } from '../../src/services/latexCompiler';

describe('Navbar Redesign & Decongestion (Stage 13)', () => {
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

  const dummyUser: UserProfile = {
    id: 'usr-1',
    email: 'author@teeex.io',
    fullName: 'Ada Lovelace',
  };

  const dummySelfUser: Collaborator = {
    id: 'usr-1',
    name: 'Ada Lovelace',
    color: '#38bdf8',
    avatar: 'AL',
  };

  const dummyProjects: Project[] = [
    {
      id: 'proj-1',
      title: 'Quantum Teleportation Notes',
      ownerId: 'usr-1',
      ownerEmail: 'author@teeex.io',
      role: 'owner',
      createdAt: '2026-10-17T00:00:00.000Z',
      updatedAt: 'Now',
      files: [{ id: 'main.tex', name: 'main.tex', content: '', isEntry: true }],
      folders: [],
      tags: [],
      members: [],
      isArchived: false,
    },
  ];

  const defaultCompileState: CompileState = {
    status: 'idle',
    durationMs: 240,
    pdfDurationMs: 180,
    errorCount: 0,
    warningCount: 0,
    isDebouncing: false,
    logEntries: [],
  };

  const defaultEngineStatus: EngineStatus = {
    phase: 'ready',
    progress: 100,
    message: 'Engine primed',
  };

  const createProps = (overrides = {}) => {
    return {
      projectTitle: 'Quantum Teleportation Notes',
      onTitleChange: vi.fn(),
      compileState: defaultCompileState,
      onCompile: vi.fn(),
      compileMode: 'fast' as const,
      onToggleCompileMode: vi.fn(),
      onOpenCommandPalette: vi.fn(),
      peers: [] as Collaborator[],
      selfUser: dummySelfUser,
      theme: 'dark' as const,
      onToggleTheme: vi.fn(),
      onOpenShare: vi.fn(),
      onOpenTableBuilder: vi.fn(),
      onOpenSymbols: vi.fn(),
      onOpenTemplates: vi.fn(),
      onOpenImageUpload: vi.fn(),
      isCloudConnected: true,
      onExportPdf: vi.fn(),
      onExportZip: vi.fn(),
      projects: dummyProjects,
      activeProjectId: 'proj-1',
      onSelectProject: vi.fn(),
      onOpenProjectsHub: vi.fn(),
      currentUser: dummyUser,
      onOpenAuth: vi.fn(),
      onSignOut: vi.fn(),
      currentRole: 'owner' as const,
      isEncrypted: true,
      isOffline: false,
      isDeskPetEnabled: true,
      onToggleDeskPet: vi.fn(),
      engineStatus: defaultEngineStatus,
      ...overrides,
    };
  };

  it('renders all three functional clusters cleanly with branded elements', async () => {
    const props = createProps();
    await render(<Navbar {...props} />);

    // Cluster 1 (Left) - Brand & Unified Project Scope
    expect(container.textContent).toContain('TEEEX');
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input?.value).toBe('Quantum Teleportation Notes');
    expect(container.textContent).toContain('Host');

    // Cluster 2 (Center) - Compile & Unified Health
    const compileBtn = container.querySelector('button[title*="Recompile LaTeX Document"]') as HTMLButtonElement;
    expect(compileBtn).toBeDefined();
    expect(compileBtn.textContent).toContain('Compile');
    expect(compileBtn.textContent).toContain('Ctrl+↵');
    expect(container.textContent).toContain('Fast');
    expect(container.textContent).toContain('Final');
    expect(container.textContent).toContain('Live');
    expect(container.textContent).toContain('(180ms)');
    expect(container.textContent).toContain('⌘K');

    // Cluster 3 (Right) - Collaboration, Consolidated Export & Tools
    expect(container.textContent).toContain('Share');
    const exportBtn = container.querySelector('button[title*="Export manuscript"]') as HTMLButtonElement;
    expect(exportBtn).toBeDefined();
    expect(exportBtn.textContent).toContain('Export');

    const toolsBtn = container.querySelector('button[title*="Insert figures"]') as HTMLButtonElement;
    expect(toolsBtn).toBeDefined();
    expect(toolsBtn.textContent).toContain('Tools');

    expect(container.querySelector('button[aria-label="Toggle color theme"]')).toBeDefined();
    expect(container.querySelector('button[aria-label="Toggle Desk Companion"]')).toBeDefined();

    // Verify app-navbar class and containment
    const header = container.querySelector('header');
    expect(header).toBeDefined();
    expect(header?.classList.contains('app-navbar')).toBe(true);
  });

  it('triggers onCompile when compile button is clicked', async () => {
    const onCompile = vi.fn();
    const props = createProps({ onCompile });
    await render(<Navbar {...props} />);

    const compileBtn = container.querySelector('button[title*="Recompile LaTeX Document"]') as HTMLButtonElement;
    await click(compileBtn);
    expect(onCompile).toHaveBeenCalledTimes(1);
  });

  it('toggles compile mode between Fast and Final (Publication)', async () => {
    const onToggleCompileMode = vi.fn();
    const props = createProps({ onToggleCompileMode, compileMode: 'fast' });
    await render(<Navbar {...props} />);

    const finalBtn = container.querySelector('button[title*="Publication Mode"]') as HTMLButtonElement;
    await click(finalBtn);
    expect(onToggleCompileMode).toHaveBeenCalledWith('publication');
  });

  it('consolidated Export dropdown opens and executes PDF and ZIP downloads', async () => {
    const onExportPdf = vi.fn();
    const onExportZip = vi.fn();
    const props = createProps({ onExportPdf, onExportZip });
    await render(<Navbar {...props} />);

    // Click Export dropdown
    const exportBtn = container.querySelector('button[title*="Export manuscript"]') as HTMLButtonElement;
    await click(exportBtn);

    // Dropdown items should appear
    expect(container.textContent).toContain('EXPORT MANUSCRIPT');
    const pdfBtn = container.querySelector('button[title*="Download compiled PDF document"]') as HTMLButtonElement;
    const zipBtn = container.querySelector('button[title*="Download LaTeX source package as ZIP"]') as HTMLButtonElement;
    expect(pdfBtn).toBeDefined();
    expect(zipBtn).toBeDefined();

    // Click PDF
    await click(pdfBtn);
    expect(onExportPdf).toHaveBeenCalledTimes(1);

    // Re-open to click ZIP
    await click(exportBtn);
    const zipBtnReopened = container.querySelector('button[title*="Download LaTeX source package as ZIP"]') as HTMLButtonElement;
    await click(zipBtnReopened);
    expect(onExportZip).toHaveBeenCalledTimes(1);
  });

  it('consolidated Tools dropdown opens and triggers image, table, symbols, and templates', async () => {
    const onOpenImageUpload = vi.fn();
    const onOpenTableBuilder = vi.fn();
    const onOpenSymbols = vi.fn();
    const onOpenTemplates = vi.fn();
    const props = createProps({
      onOpenImageUpload,
      onOpenTableBuilder,
      onOpenSymbols,
      onOpenTemplates,
    });
    await render(<Navbar {...props} />);

    const toolsBtn = container.querySelector('button[title*="Insert figures"]') as HTMLButtonElement;

    // 1. Figures
    await click(toolsBtn);
    const figureBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Figure & Image'));
    expect(figureBtn).toBeDefined();
    await click(figureBtn!);
    expect(onOpenImageUpload).toHaveBeenCalledTimes(1);

    // 2. Tables
    await click(toolsBtn);
    const tableBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Table Builder'));
    expect(tableBtn).toBeDefined();
    await click(tableBtn!);
    expect(onOpenTableBuilder).toHaveBeenCalledTimes(1);

    // 3. Math & Symbols
    await click(toolsBtn);
    const mathBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Math & Formulas'));
    expect(mathBtn).toBeDefined();
    await click(mathBtn!);
    expect(onOpenSymbols).toHaveBeenCalledTimes(1);

    // 4. Templates
    await click(toolsBtn);
    const templateBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Starter Templates'));
    expect(templateBtn).toBeDefined();
    await click(templateBtn!);
    expect(onOpenTemplates).toHaveBeenCalledTimes(1);
  });

  it('preserves critical E2E and accessibility attributes for Desk Companion and Theme', async () => {
    const onToggleTheme = vi.fn();
    const onToggleDeskPet = vi.fn();
    const props = createProps({
      isDeskPetEnabled: true,
      onToggleTheme,
      onToggleDeskPet,
    });
    await render(<Navbar {...props} />);

    const deskPetBtn = container.querySelector('button[aria-label="Toggle Desk Companion"]') as HTMLButtonElement;
    expect(deskPetBtn.getAttribute('aria-pressed')).toBe('true');
    await click(deskPetBtn);
    expect(onToggleDeskPet).toHaveBeenCalledTimes(1);

    const themeBtn = container.querySelector('button[aria-label="Toggle color theme"]') as HTMLButtonElement;
    await click(themeBtn);
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('EngineWarmupBadge renders in compact mode and portals modal cleanly to document.body', async () => {
    await render(
      <EngineWarmupBadge
        status={{ phase: 'ready', progress: 100, message: 'Primed' }}
        compact={true}
      />
    );

    const pill = container.querySelector('.engine-warmup-pill');
    expect(pill).toBeDefined();
    expect(pill?.classList.contains('ready')).toBe(true);
    expect(pill?.textContent).toContain('Ready');

    // Clicking pill opens telemetry modal mounted via portal to document.body
    await click(pill as HTMLElement);
    const card = document.querySelector('.engine-telemetry-card');
    expect(card).toBeDefined();
    expect(document.body.textContent).toContain('TeX Engine & Storage Telemetry');

    // Pressing Escape closes the modal
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('.engine-telemetry-card')).toBeNull();
  });

  it('humanizes large compilation durations properly', async () => {
    const props = createProps({
      compileState: {
        ...defaultCompileState,
        pdfDurationMs: 16121,
      },
    });
    await render(<Navbar {...props} />);

    // Should format 16121ms as 16.1s instead of (16121ms)
    expect(container.textContent).toContain('(16.1s)');
  });
});
