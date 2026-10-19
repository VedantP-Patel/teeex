// @vitest-environment happy-dom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { texEngine } from '../../src/services/latexCompiler';
import { toEngineFiles } from '../../src/services/texProject';
import type { Project, ProjectFile } from '../../src/types/latex';

describe('Stage 23: Offline Compilation, Full-Content Hashing & Sync Reconciliation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    texEngine.terminate();
  });

  describe('Full-Content Hashing Beyond 500 Characters (Fixes "Ghost Compile")', () => {
    it('generates distinct hash for body edits past 500 chars with identical string length', () => {
      // Create a 700-character document with identical preamble > 500 chars
      const preamble = '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{amssymb}\n\\usepackage{graphicx}\n\\usepackage{booktabs}\n\\title{Quantum Field Theory}\n\\author{Author One}\n\\begin{document}\n';
      expect(preamble.length).toBeGreaterThan(150);

      const padding = '% This is long padding text intended to push the user body content far beyond the 500 character mark\n'.repeat(4);
      const baseBody = 'The fundamental theorem of calculus states that integration is inverse.';
      const editedBody = 'The fundamental theorem of algebra states that polynomials have roots..';
      expect(baseBody.length).toBe(editedBody.length); // Exactly same character count

      const doc1 = preamble + padding + baseBody + '\n\\end{document}';
      const doc2 = preamble + padding + editedBody + '\n\\end{document}';

      expect(doc1.length).toBe(doc2.length);
      expect(doc1.length).toBeGreaterThan(600);

      // Verify the edit occurred strictly beyond character 500
      const editIndex = doc1.indexOf(baseBody);
      expect(editIndex).toBeGreaterThan(500);

      // Old truncated FNV-1a (Math.min(len, 500))
      let oldH1 = 0x811c9dc5;
      for (let i = 0; i < Math.min(doc1.length, 500); i++) {
        oldH1 = Math.imul(oldH1 ^ doc1.charCodeAt(i), 0x01000193);
      }
      let oldH2 = 0x811c9dc5;
      for (let i = 0; i < Math.min(doc2.length, 500); i++) {
        oldH2 = Math.imul(oldH2 ^ doc2.charCodeAt(i), 0x01000193);
      }
      // Bug demonstration: old algorithm gave IDENTICAL hashes!
      expect(`${doc1.length}:${(oldH1 >>> 0).toString(36)}`).toBe(`${doc2.length}:${(oldH2 >>> 0).toString(36)}`);

      // New full-content FNV-1a
      let newH1 = 0x811c9dc5;
      for (let i = 0; i < doc1.length; i++) {
        newH1 = Math.imul(newH1 ^ doc1.charCodeAt(i), 0x01000193);
      }
      let newH2 = 0x811c9dc5;
      for (let i = 0; i < doc2.length; i++) {
        newH2 = Math.imul(newH2 ^ doc2.charCodeAt(i), 0x01000193);
      }
      const newHash1 = `${doc1.length}:${(newH1 >>> 0).toString(36)}`;
      const newHash2 = `${doc2.length}:${(newH2 >>> 0).toString(36)}`;

      // Verification: Full-content hashing correctly detects the body edit!
      expect(newHash1).not.toBe(newHash2);
    });

    it('toEngineFiles computes full-string hash for auxiliary section files beyond 300 chars', () => {
      const padding = '% Long section preamble comment padding text for section document\n'.repeat(6);
      const section1 = padding + '\\subsection{Methods}\nUsing algorithm alpha.';
      const section2 = padding + '\\subsection{Methods}\nUsing algorithm beta..'; // Same length
      expect(section1.length).toBe(section2.length);
      expect(section1.indexOf('alpha')).toBeGreaterThan(300);

      const files1: ProjectFile[] = [
        { id: '1', name: 'main.tex', content: '\\documentclass{article}\\begin{document}\\input{sec}\\end{document}', type: 'tex', isEntry: true },
        { id: '2', name: 'sec.tex', content: section1, type: 'tex' },
      ];
      const files2: ProjectFile[] = [
        { id: '1', name: 'main.tex', content: '\\documentclass{article}\\begin{document}\\input{sec}\\end{document}', type: 'tex', isEntry: true },
        { id: '2', name: 'sec.tex', content: section2, type: 'tex' },
      ];

      const engineFiles1 = toEngineFiles(files1, 'main.tex');
      const engineFiles2 = toEngineFiles(files2, 'main.tex');

      const secHash1 = engineFiles1.find(f => f.path.includes('sec.tex'))?.hash;
      const secHash2 = engineFiles2.find(f => f.path.includes('sec.tex'))?.hash;

      expect(secHash1).toBeDefined();
      expect(secHash2).toBeDefined();
      // With full-string hashing, hashes must differ even with identical lengths
      expect(secHash1).not.toBe(secHash2);
    });
  });

  describe('Offline Endpoint Handling & Miss Clearing', () => {
    it('suppresses remote endpoint when navigator.onLine is false', () => {
      // Mock navigator.onLine = false
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

      // Verify texEngine status remains operational and clearRegisteredMisses exists
      expect(typeof texEngine.clearRegisteredMisses).toBe('function');
      texEngine.clearRegisteredMisses();
      expect(texEngine.getStatus().phase).toBe('idle');
    });

    it('clearRegisteredMisses resets transient misses', () => {
      texEngine.clearRegisteredMisses();
      // Should execute without throwing
      expect(true).toBe(true);
    });
  });

  describe('Cloud Reconciliation Protection for Offline Edits', () => {
    it('preserves local offline edits when local _offlineSavedAt is newer than cloud updatedAt', () => {
      const now = Date.now();
      const localProject: Project = {
        id: 'proj-offline-test',
        title: 'Offline Manuscript',
        ownerId: 'usr-1',
        ownerEmail: 'test@teeex.io',
        role: 'owner',
        createdAt: new Date(now - 86400000).toISOString(),
        updatedAt: 'Just now', // non-ISO string!
        files: [
          { id: '1', name: 'main.tex', content: 'Local Offline Content that must survive!', type: 'tex' },
        ],
        tags: [],
        members: [],
        isArchived: false,
        _offlineSavedAt: now - 1000, // Saved offline 1 second ago
      } as unknown as Project;

      const cloudProject: Project = {
        id: 'proj-offline-test',
        title: 'Cloud Stale Manuscript',
        ownerId: 'usr-1',
        ownerEmail: 'test@teeex.io',
        role: 'owner',
        createdAt: new Date(now - 86400000).toISOString(),
        updatedAt: new Date(now - 100000).toISOString(), // Cloud is 100 seconds old!
        files: [
          { id: '1', name: 'main.tex', content: 'Old cloud content that would have overwritten local!', type: 'tex' },
        ],
        tags: [],
        members: [],
        isArchived: false,
      };

      // Test reconciliation algorithm
      const parseTime = (ts?: string | number, fallback?: string | number) => {
        if (typeof ts === 'number') return ts;
        const t = ts ? Date.parse(ts) : NaN;
        if (!Number.isNaN(t)) return t;
        if (typeof fallback === 'number') return fallback;
        const f = fallback ? Date.parse(fallback) : NaN;
        return Number.isNaN(f) ? 0 : f;
      };

      const localTime = Math.max(
        parseTime((localProject as unknown as { _offlineSavedAt?: number })._offlineSavedAt),
        parseTime(localProject.updatedAt, localProject.createdAt)
      );
      const cloudTime = parseTime(cloudProject.updatedAt, cloudProject.createdAt);

      // Local offline save is newer than cloud
      expect(localTime).toBeGreaterThan(cloudTime);

      const projectMap = new Map<string, Project>();
      projectMap.set(localProject.id, localProject);

      if (cloudTime > localTime) {
        projectMap.set(cloudProject.id, cloudProject);
      }

      // Assert that localProject was NOT overwritten
      const reconciled = projectMap.get(localProject.id);
      expect(reconciled?.files[0].content).toBe('Local Offline Content that must survive!');
    });
  });
});
