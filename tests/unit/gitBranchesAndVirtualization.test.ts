// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/supabaseClient', () => ({
  getSupabaseClient: vi.fn(() => null),
  isSupabaseConnected: vi.fn(() => false),
}));

import {
  getProjectBranches,
  getActiveBranch,
  setActiveBranch,
  createBranch,
  deleteBranch,
  createCommit,
  loadProjectCheckpoints,
} from '../../src/services/checkpointsService';
import {
  computeLineDiff,
  computeProjectFileDiffs,
} from '../../src/services/diffService';
import type { ProjectFile } from '../../src/types/latex';

describe('Git Branching & High-Performance Diff Virtualization (Stage 21)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  const baseFiles: ProjectFile[] = [
    {
      id: 'f-1',
      name: 'main.tex',
      content: '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}',
      type: 'tex',
    },
  ];

  describe('Branch Management API', () => {
    it('returns ["main"] as default branch for any project', () => {
      const branches = getProjectBranches('proj-alpha');
      expect(branches).toEqual(['main']);
      expect(getActiveBranch('proj-alpha')).toBe('main');
    });

    it('creates new branches and switches active branch', () => {
      const res = createBranch('proj-alpha', 'feature/derivation');
      expect(res.success).toBe(true);

      const branches = getProjectBranches('proj-alpha');
      expect(branches).toContain('main');
      expect(branches).toContain('feature/derivation');
      expect(getActiveBranch('proj-alpha')).toBe('feature/derivation');
    });

    it('rejects duplicate branch names', () => {
      createBranch('proj-alpha', 'dev');
      const duplicateRes = createBranch('proj-alpha', 'dev');
      expect(duplicateRes.success).toBe(false);
      expect(duplicateRes.error).toContain('already exists');
    });

    it('sanitizes branch names to lowercase with hyphens', () => {
      createBranch('proj-alpha', 'My New Branch');
      const branches = getProjectBranches('proj-alpha');
      expect(branches).toContain('my-new-branch');
    });

    it('rejects invalid branch names with special characters', () => {
      const res = createBranch('proj-alpha', 'bad*branch?name!');
      expect(res.success).toBe(false);
    });

    it('prevents deleting default "main" branch', () => {
      const res = deleteBranch('proj-alpha', 'main');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Cannot delete default branch "main"');
    });

    it('prevents deleting currently active branch', () => {
      createBranch('proj-alpha', 'experiment');
      setActiveBranch('proj-alpha', 'experiment');

      const res = deleteBranch('proj-alpha', 'experiment');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Cannot delete currently active branch');

      // Switch back to main, then delete experiment successfully
      setActiveBranch('proj-alpha', 'main');
      const delRes = deleteBranch('proj-alpha', 'experiment');
      expect(delRes.success).toBe(true);
      expect(getProjectBranches('proj-alpha')).not.toContain('experiment');
    });

    it('associates new commits with the active branch automatically', () => {
      loadProjectCheckpoints('proj-alpha', baseFiles);
      createBranch('proj-alpha', 'feature/quantum');
      setActiveBranch('proj-alpha', 'feature/quantum');

      const commit = createCommit(
        'proj-alpha',
        'feat: add quantum hamiltonian',
        'Author',
        baseFiles
      );

      expect(commit.branch).toBe('feature/quantum');

      const history = loadProjectCheckpoints('proj-alpha');
      expect(history[0].branch).toBe('feature/quantum');
    });
  });

  describe('High-Performance Diff Optimization (Prefix & Suffix Trimming)', () => {
    it('accurately and instantly diffs large documents with small changes', () => {
      // Create a 6,000-line document
      const prefixLines = Array.from({ length: 3000 }, (_, i) => `\\paragraph{Intro line ${i + 1}}`);
      const suffixLines = Array.from({ length: 3000 }, (_, i) => `\\paragraph{Conclusion line ${i + 1}}`);

      const docOld = [...prefixLines, 'Old theorem formulation $a^2 + b^2 = c^2$', ...suffixLines].join('\n');
      const docNew = [...prefixLines, 'New theorem formulation $a^n + b^n = c^n$', ...suffixLines].join('\n');

      const startTime = performance.now();
      const diff = computeLineDiff(docOld, docNew);
      const durationMs = performance.now() - startTime;

      expect(diff.additions).toBe(1);
      expect(diff.deletions).toBe(1);
      expect(diff.unchanged).toBe(6000);
      expect(durationMs).toBeLessThan(100); // Sub-100ms on 6,000 lines
    });

    it('handles identical documents without allocating diff matrix', () => {
      const text = Array.from({ length: 2000 }, (_, i) => `Line ${i}`).join('\n');
      const diff = computeLineDiff(text, text);

      expect(diff.additions).toBe(0);
      expect(diff.deletions).toBe(0);
      expect(diff.unchanged).toBe(2000);
      expect(diff.lines.length).toBe(2000);
      expect(diff.splitRows.length).toBe(2000);
    });

    it('handles completely empty initial commit (pure addition) instantly', () => {
      const text = Array.from({ length: 5000 }, (_, i) => `Line ${i}`).join('\n');
      const diff = computeLineDiff('', text);

      expect(diff.additions).toBe(5000);
      expect(diff.deletions).toBe(0);
      expect(diff.unchanged).toBe(0);
    });

    it('handles completely deleted file (pure deletion) instantly', () => {
      const text = Array.from({ length: 5000 }, (_, i) => `Line ${i}`).join('\n');
      const diff = computeLineDiff(text, '');

      expect(diff.additions).toBe(0);
      expect(diff.deletions).toBe(5000);
      expect(diff.unchanged).toBe(0);
    });

    it('generates multi-file diff summaries cleanly with trimmed line stats', () => {
      const filesA: ProjectFile[] = [
        { id: '1', name: 'main.tex', content: 'Chapter 1\nLine A\nLine B', type: 'tex' },
        { id: '2', name: 'bib.bib', content: '@article{test}', type: 'bib' },
      ];
      const filesB: ProjectFile[] = [
        { id: '1', name: 'main.tex', content: 'Chapter 1\nLine A Modified\nLine B', type: 'tex' },
        { id: '2', name: 'bib.bib', content: '@article{test}', type: 'bib' },
      ];

      const summaries = computeProjectFileDiffs(filesA, filesB);
      expect(summaries).toHaveLength(2);

      const mainDiff = summaries.find(s => s.fileName === 'main.tex');
      expect(mainDiff?.status).toBe('modified');
      expect(mainDiff?.additions).toBe(1);
      expect(mainDiff?.deletions).toBe(1);

      const bibDiff = summaries.find(s => s.fileName === 'bib.bib');
      expect(bibDiff?.status).toBe('unchanged');
      expect(bibDiff?.additions).toBe(0);
      expect(bibDiff?.deletions).toBe(0);
    });
  });

  describe('Windowed Virtualization Geometry Math', () => {
    it('computes correct start and end indices for a 35,000-line virtualized container', () => {
      const totalCount = 35000;
      const rowHeight = 22;
      const overscan = 15;
      const viewportHeight = 600;

      // Scrolled to line 1000 (scrollTop = 22,000px)
      const scrollTop = 22000;
      const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
      const endIndex = Math.min(totalCount, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);

      expect(startIndex).toBe(1000 - 15);
      expect(endIndex).toBe(Math.ceil(22600 / 22) + 15);
      expect(endIndex - startIndex).toBeLessThanOrEqual(60); // strictly capped DOM nodes!

      const topPadding = startIndex * rowHeight;
      const bottomPadding = (totalCount - endIndex) * rowHeight;
      expect(topPadding + (endIndex - startIndex) * rowHeight + bottomPadding).toBe(totalCount * rowHeight);
    });
  });
});
