// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useUnifiedDiagnostics, type UnifiedDiagnosticsResult } from '../../src/hooks/useUnifiedDiagnostics';
import { useAutosaveRecovery, writeEmergencyDraft, clearEmergencyDraft } from '../../src/hooks/useAutosaveRecovery';
import { loadProjects, updateProject, saveProjects } from '../../src/services/projectsService';
import type { Project, ProjectFile } from '../../src/types/latex';

describe('Quick-Fix Persistence & Anti-Revert Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('correctly replaces table captions with \\captionof{table} in unified diagnostics', () => {
    let hookResult: UnifiedDiagnosticsResult | null = null;
    const TestComponent = () => {
      hookResult = useUnifiedDiagnostics({
        compilerDiagnostics: [
          {
            id: 'c-table',
            severity: 'error',
            code: 'syntax',
            message: 'Package caption Error: \\caption outside float.',
            raw: '! Package caption Error: \\caption outside float.',
            line: 5,
            suggestedFix: {
              title: 'Change to \\captionof{table}{...}',
              description: 'Wraps floating table caption with \\captionof{table}.',
              replacement: '\\captionof{table}{List of Drone Components}',
              startLine: 5,
              endLine: 5,
            },
          },
        ],
        activeFileName: 'main.tex',
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<TestComponent />);
    });

    const files: ProjectFile[] = [
      {
        id: 'main.tex',
        name: 'main.tex',
        content: [
          '\\documentclass{article}',
          '\\usepackage{caption}',
          '\\begin{document}',
          '\\begin{center}',
          '\\caption{List of Drone Components}',
          '\\begin{tabular}{cc}',
          'A & B \\\\',
          '\\end{tabular}',
          '\\end{center}',
          '\\end{document}',
        ].join('\n'),
        type: 'tex',
        isEntry: true,
      },
    ];

    let updatedContent = '';
    const updateFileContent = (_id: string, newContent: string) => {
      updatedContent = newContent;
    };

    let ok = false;
    act(() => {
      ok = hookResult!.applyQuickFix('c-table', files, updateFileContent);
    });

    expect(ok).toBe(true);
    expect(updatedContent).toContain('\\captionof{table}{List of Drone Components}');
    expect(updatedContent).not.toContain('\\captionof{figure}{List of Drone Components}');
  });

  it('correctly replaces figure captions with \\captionof{figure} in unified diagnostics', () => {
    let hookResult: UnifiedDiagnosticsResult | null = null;
    const TestComponent = () => {
      hookResult = useUnifiedDiagnostics({
        compilerDiagnostics: [
          {
            id: 'c-fig',
            severity: 'error',
            code: 'syntax',
            message: 'Package caption Error: \\caption outside float.',
            raw: '! Package caption Error: \\caption outside float.',
            line: 4,
            suggestedFix: {
              title: 'Change to \\captionof{figure}{...}',
              description: 'Wraps floating figure caption with \\captionof{figure}.',
              replacement: '\\captionof{figure}{Drone Chassis}',
              startLine: 4,
              endLine: 4,
            },
          },
        ],
        activeFileName: 'main.tex',
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<TestComponent />);
    });

    const files: ProjectFile[] = [
      {
        id: 'main.tex',
        name: 'main.tex',
        content: [
          '\\documentclass{article}',
          '\\usepackage{caption}',
          '\\begin{document}',
          '\\caption{Drone Chassis}',
          '\\end{document}',
        ].join('\n'),
        type: 'tex',
        isEntry: true,
      },
    ];

    let updatedContent = '';
    const updateFileContent = (_id: string, newContent: string) => {
      updatedContent = newContent;
    };

    let ok = false;
    act(() => {
      ok = hookResult!.applyQuickFix('c-fig', files, updateFileContent);
    });

    expect(ok).toBe(true);
    expect(updatedContent).toContain('\\captionof{figure}{Drone Chassis}');
  });

  it('preserves emergency draft when content differs from active project', () => {
    const activeProject: Project = {
      id: 'proj-revert-test',
      title: 'Drone Report',
      ownerId: 'usr-test',
      ownerEmail: 'test@teeex.local',
      role: 'owner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date(Date.now() - 1000).toISOString(),
      files: [
        {
          id: 'main.tex',
          name: 'main.tex',
          content: 'Old un-fixed content',
          type: 'tex',
          isEntry: true,
        },
      ],
      folders: ['figures'],
      tags: [],
      members: [],
      isArchived: false,
    };

    const draftFiles: ProjectFile[] = [
      {
        id: 'main.tex',
        name: 'main.tex',
        content: 'New quick-fixed content with \\captionof{table}',
        type: 'tex',
        isEntry: true,
      },
    ];

    // Write emergency draft with nearly identical timestamp (within 500ms)
    writeEmergencyDraft(activeProject.id, draftFiles, ['figures'], 'Drone Report');

    let hookResult: any = null;
    const TestComponent = () => {
      hookResult = useAutosaveRecovery({
        activeProject,
        files: activeProject.files,
        folders: activeProject.folders || [],
        projectTitle: activeProject.title,
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<TestComponent />);
    });

    expect(hookResult.hasRecoverableCrash).toBe(true);
    expect(hookResult.recoveredDraftInfo).not.toBeNull();
    expect(hookResult.recoveredDraftInfo.files[0].content).toBe('New quick-fixed content with \\captionof{table}');
  });

  it('persists quick-fix changes synchronously through updateProject so refresh retains edits', () => {
    const projectId = 'proj-persist-check';
    const initialFiles: ProjectFile[] = [
      {
        id: 'main.tex',
        name: 'main.tex',
        content: '\\caption{Original}',
        type: 'tex',
        isEntry: true,
      },
    ];

    const initialProject: Project = {
      id: projectId,
      title: 'Persist Test',
      ownerId: 'usr-test',
      ownerEmail: 'test@teeex.local',
      role: 'owner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: initialFiles,
      folders: [],
      tags: [],
      members: [],
      isArchived: false,
    };

    saveProjects([initialProject]);

    // Simulate quick-fix applying a modification
    const modifiedFiles: ProjectFile[] = [
      {
        id: 'main.tex',
        name: 'main.tex',
        content: '\\captionof{table}{Original}',
        type: 'tex',
        isEntry: true,
      },
    ];

    // Synchronous flush
    updateProject(projectId, { files: modifiedFiles });
    clearEmergencyDraft(projectId);

    // Simulate page reload: loadProjects reads from localStorage
    const reloadedProjects = loadProjects();
    const reloaded = reloadedProjects.find((p) => p.id === projectId);

    expect(reloaded).toBeDefined();
    expect(reloaded!.files[0].content).toBe('\\captionof{table}{Original}');
  });

  it('cleanly deletes marker line when applying empty string quick-fix', () => {
    let hookResult: UnifiedDiagnosticsResult | null = null;
    const TestComponent = () => {
      hookResult = useUnifiedDiagnostics({
        parserDiagnostics: [
          {
            id: 'remove-comment-line-2',
            line: 2,
            column: 1,
            severity: 'warning',
            message: 'Unwanted comment line to remove.',
            rule: 'syntax/cleanup',
            suggestedFix: {
              title: 'Remove comment line',
              description: 'Removes line 2.',
              replacement: '',
              startLine: 2,
              endLine: 2,
            },
          },
        ],
        activeFileName: 'main.tex',
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<TestComponent />);
    });

    const files: ProjectFile[] = [
      {
        id: 'main.tex',
        name: 'main.tex',
        content: [
          '% Line 1 Header',
          '% Line to delete',
          '\\documentclass{article}',
          '\\begin{document}',
          'Hello',
          '\\end{document}',
        ].join('\n'),
        type: 'tex',
        isEntry: true,
      },
    ];

    let updatedContent = '';
    const updateFileContent = (_id: string, newContent: string) => {
      updatedContent = newContent;
    };

    let ok = false;
    act(() => {
      ok = hookResult!.applyQuickFix('remove-comment-line-2', files, updateFileContent);
    });

    expect(ok).toBe(true);
    expect(updatedContent).not.toContain('% Line to delete');
    expect(updatedContent.split('\n')).toHaveLength(5);
    expect(updatedContent.split('\n')[1]).toBe('\\documentclass{article}');
  });

  it('cleanly removes duplicate document sections after \\end{document}', () => {
    let hookResult: UnifiedDiagnosticsResult | null = null;
    const TestComponent = () => {
      hookResult = useUnifiedDiagnostics({
        parserDiagnostics: [
          {
            id: 'trailing-content-5',
            line: 5,
            column: 1,
            severity: 'warning',
            message: "Content found after '\\end{document}' (closed on line 4).",
            rule: 'syntax/content-after-end-document',
            suggestedFix: {
              title: 'Remove trailing content after \\end{document}',
              description: "Deletes redundant lines after '\\end{document}' on line 4.",
              replacement: '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}\n',
              startLine: 1,
              endLine: 8,
            },
          },
        ],
        activeFileName: 'main.tex',
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<TestComponent />);
    });

    const files: ProjectFile[] = [
      {
        id: 'main.tex',
        name: 'main.tex',
        content: [
          '\\documentclass{article}',
          '\\begin{document}',
          'Hello',
          '\\end{document}',
          '\\begin{document}',
          'Duplicate content',
          '\\end{document}',
          '% Trailing comment',
        ].join('\n'),
        type: 'tex',
        isEntry: true,
      },
    ];

    let updatedContent = '';
    const updateFileContent = (_id: string, newContent: string) => {
      updatedContent = newContent;
    };

    let ok = false;
    act(() => {
      ok = hookResult!.applyQuickFix('trailing-content-5', files, updateFileContent);
    });

    expect(ok).toBe(true);
    expect(updatedContent).not.toContain('Duplicate content');
    expect(updatedContent).toBe('\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}');
  });
});
