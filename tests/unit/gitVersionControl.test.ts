// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/supabaseClient', () => ({
  getSupabaseClient: vi.fn(() => null),
  isSupabaseConnected: vi.fn(() => false),
}));

import {
  generateShortSha,
  computeCommitStats,
  createCommit,
  getWorkingTreeStatus,
  getSyncStatus,
  loadProjectCheckpoints,
  saveProjectCheckpoints,
} from '../../src/services/checkpointsService';
import {
  computeWordDiff,
  computeLineDiff,
  computeProjectFileDiffs,
} from '../../src/services/diffService';
import type { ProjectFile } from '../../src/types/latex';

describe('Git Version Control & Visual Diff Service (Stage 20)', () => {
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
    {
      id: 'f-2',
      name: 'references.bib',
      content: '@article{einstein1905,\n  author = {Einstein, Albert},\n  title = {Zur Elektrodynamik bewegter Korper}\n}',
      type: 'bib',
    },
  ];

  describe('generateShortSha', () => {
    it('produces a 7-character hexadecimal string', () => {
      const sha = generateShortSha();
      expect(sha).toHaveLength(7);
      expect(/^[0-9a-f]{7}$/.test(sha)).toBe(true);
    });

    it('produces deterministic output when given the same seed', () => {
      const sha1 = generateShortSha('project-123-commit-1');
      const sha2 = generateShortSha('project-123-commit-1');
      expect(sha1).toBe(sha2);
      expect(sha1).toHaveLength(7);
    });
  });

  describe('computeCommitStats', () => {
    it('calculates correct additions, deletions, and filesChanged for modifications', () => {
      const modifiedFiles: ProjectFile[] = [
        {
          id: 'f-1',
          name: 'main.tex',
          content: '\\documentclass{article}\n\\begin{document}\nHello Quantum World\nExtra Line\n\\end{document}',
          type: 'tex',
        },
        baseFiles[1], // unchanged
      ];

      const stats = computeCommitStats(baseFiles, modifiedFiles);
      expect(stats.filesChanged).toBe(1);
      expect(stats.additions).toBeGreaterThan(0);
      expect(stats.deletions).toBeGreaterThanOrEqual(1);
    });

    it('calculates stats for newly added files', () => {
      const addedFiles: ProjectFile[] = [
        ...baseFiles,
        {
          id: 'f-3',
          name: 'sections/intro.tex',
          content: '\\section{Introduction}\nHere is our intro.',
          type: 'tex',
        },
      ];

      const stats = computeCommitStats(baseFiles, addedFiles);
      expect(stats.filesChanged).toBe(1);
      expect(stats.additions).toBe(2);
      expect(stats.deletions).toBe(0);
    });

    it('calculates stats for deleted files', () => {
      const deletedFiles: ProjectFile[] = [baseFiles[0]]; // references.bib removed

      const stats = computeCommitStats(baseFiles, deletedFiles);
      expect(stats.filesChanged).toBe(1);
      expect(stats.additions).toBe(0);
      expect(stats.deletions).toBe(4);
    });
  });

  describe('createCommit', () => {
    it('creates a rich Git commit with 7-char short SHA, message, description, author and stats', () => {
      // First load project checkpoints to initialize baseline
      loadProjectCheckpoints('proj-1', baseFiles, 'Ada Lovelace');

      const modifiedFiles: ProjectFile[] = [
        {
          id: 'f-1',
          name: 'main.tex',
          content: '\\documentclass{article}\n\\begin{document}\nUpdated Teeex Paper\n\\end{document}',
          type: 'tex',
        },
        baseFiles[1],
      ];

      const commit = createCommit(
        'proj-1',
        'feat: update paper title to Teeex Paper',
        'Ada Lovelace',
        modifiedFiles,
        'Refining introduction and title section.'
      );

      expect(commit.shortSha).toHaveLength(7);
      expect(commit.name).toBe('feat: update paper title to Teeex Paper');
      expect(commit.message).toBe('feat: update paper title to Teeex Paper');
      expect(commit.description).toBe('Refining introduction and title section.');
      expect(commit.author).toBe('Ada Lovelace');
      expect(commit.isAutoSave).toBe(false);
      expect(commit.isSyncedToCloud).toBe(false);
      expect(commit.parentId).toBeTruthy();
      expect(commit.stats?.filesChanged).toBe(1);

      const history = loadProjectCheckpoints('proj-1');
      expect(history.length).toBe(2);
      expect(history[0].id).toBe(commit.id);
      expect(history[0].shortSha).toBe(commit.shortSha);
    });
  });

  describe('getWorkingTreeStatus', () => {
    it('returns isClean = true when working tree matches head commit', () => {
      const head = createCommit('proj-clean', 'Initial commit', 'Author', baseFiles);
      const status = getWorkingTreeStatus(baseFiles, head);

      expect(status.isClean).toBe(true);
      expect(status.files).toHaveLength(0);
      expect(status.totalAdditions).toBe(0);
      expect(status.totalDeletions).toBe(0);
    });

    it('detects modified, added, and deleted files in working tree', () => {
      const head = createCommit('proj-dirty', 'Initial commit', 'Author', baseFiles);

      const currentWorkingFiles: ProjectFile[] = [
        // Modified main.tex
        {
          id: 'f-1',
          name: 'main.tex',
          content: '\\documentclass{article}\n\\begin{document}\nModified content\n\\end{document}',
          type: 'tex',
        },
        // Added appendix.tex (references.bib was deleted)
        {
          id: 'f-3',
          name: 'appendix.tex',
          content: '\\appendix\n\\section{Proofs}',
          type: 'tex',
        },
      ];

      const status = getWorkingTreeStatus(currentWorkingFiles, head);
      expect(status.isClean).toBe(false);

      const modified = status.files.find(f => f.fileName === 'main.tex');
      expect(modified?.status).toBe('modified');

      const added = status.files.find(f => f.fileName === 'appendix.tex');
      expect(added?.status).toBe('added');

      const deleted = status.files.find(f => f.fileName === 'references.bib');
      expect(deleted?.status).toBe('deleted');

      expect(status.totalAdditions).toBeGreaterThan(0);
      expect(status.totalDeletions).toBeGreaterThan(0);
    });
  });

  describe('getSyncStatus', () => {
    it('accurately reports ahead count and isUpToDate status', () => {
      const c1 = createCommit('proj-sync', 'Commit 1', 'Author', baseFiles);
      let sync = getSyncStatus('proj-sync');
      expect(sync.ahead).toBe(1);
      expect(sync.isUpToDate).toBe(false);

      // Simulate commit marked as synced
      const history = loadProjectCheckpoints('proj-sync');
      history[0].isSyncedToCloud = true;
      saveProjectCheckpoints('proj-sync', history);

      sync = getSyncStatus('proj-sync');
      expect(sync.ahead).toBe(0);
      expect(sync.isUpToDate).toBe(true);
    });
  });

  describe('computeWordDiff (intra-line token diff)', () => {
    it('identifies exact words added and removed between two lines', () => {
      const oldLine = 'The quick brown fox jumps over the lazy dog';
      const newLine = 'The fast brown fox leaps over the sleepy dog';

      const { oldTokens, newTokens } = computeWordDiff(oldLine, newLine);

      const removedWords = oldTokens.filter(t => t.type === 'removed').map(t => t.text);
      const addedWords = newTokens.filter(t => t.type === 'added').map(t => t.text);

      expect(removedWords).toContain('quick');
      expect(removedWords).toContain('jumps');
      expect(removedWords).toContain('lazy');

      expect(addedWords).toContain('fast');
      expect(addedWords).toContain('leaps');
      expect(addedWords).toContain('sleepy');
    });

    it('properly tokenizes LaTeX control sequences and math', () => {
      const oldLine = '\\section{Old Concept} Let $x = 5$.';
      const newLine = '\\section{New Concept} Let $x = 10$.';

      const { oldTokens, newTokens } = computeWordDiff(oldLine, newLine);

      const removedWords = oldTokens.filter(t => t.type === 'removed').map(t => t.text);
      const addedWords = newTokens.filter(t => t.type === 'added').map(t => t.text);

      expect(removedWords).toContain('Old');
      expect(removedWords).toContain('5');

      expect(addedWords).toContain('New');
      expect(addedWords).toContain('10');
    });

    it('handles identical lines without adding extra diff tokens', () => {
      const line = '\\begin{equation} E = mc^2 \\end{equation}';
      const { oldTokens, newTokens } = computeWordDiff(line, line);

      expect(oldTokens.every(t => t.type === 'unchanged')).toBe(true);
      expect(newTokens.every(t => t.type === 'unchanged')).toBe(true);
    });
  });

  describe('computeLineDiff and Split Rows', () => {
    it('creates unified diff with addition, deletion and unchanged counts', () => {
      const textA = 'Line 1\nLine 2\nLine 3';
      const textB = 'Line 1\nLine 2 Modified\nLine 3\nLine 4';

      const diff = computeLineDiff(textA, textB);
      expect(diff.additions).toBe(2);
      expect(diff.deletions).toBe(1);
      expect(diff.lines.some(l => l.type === 'added' && l.text === 'Line 4')).toBe(true);
    });

    it('creates paired splitRows with intra-line tokens for replacement lines', () => {
      const textA = 'Euler equation $e^{i\\pi} + 1 = 0$';
      const textB = 'Euler identity $e^{i\\pi} + 1 = 0$';

      const diff = computeLineDiff(textA, textB);
      expect(diff.splitRows.length).toBeGreaterThan(0);

      const replacementRow = diff.splitRows.find(r => r.left?.type === 'removed' && r.right?.type === 'added');
      expect(replacementRow).toBeDefined();
      expect(replacementRow?.left?.tokens).toBeDefined();
      expect(replacementRow?.right?.tokens).toBeDefined();

      const removedToken = replacementRow?.left?.tokens?.find(t => t.type === 'removed');
      const addedToken = replacementRow?.right?.tokens?.find(t => t.type === 'added');

      expect(removedToken?.text).toBe('equation');
      expect(addedToken?.text).toBe('identity');
    });
  });

  describe('computeProjectFileDiffs', () => {
    it('computes multi-file diff summary with proper sorting and status categorization', () => {
      const oldProject: ProjectFile[] = [
        { id: '1', name: 'main.tex', content: 'Original main', type: 'tex' },
        { id: '2', name: 'deleted.tex', content: 'Will be deleted', type: 'tex' },
        { id: '3', name: 'unchanged.tex', content: 'Same content', type: 'tex' },
      ];

      const newProject: ProjectFile[] = [
        { id: '1', name: 'main.tex', content: 'Modified main content', type: 'tex' },
        { id: '3', name: 'unchanged.tex', content: 'Same content', type: 'tex' },
        { id: '4', name: 'added.tex', content: 'Newly added file', type: 'tex' },
      ];

      const summaries = computeProjectFileDiffs(oldProject, newProject);

      expect(summaries).toHaveLength(4);

      // Verify statuses
      const mainDiff = summaries.find(s => s.fileName === 'main.tex');
      expect(mainDiff?.status).toBe('modified');
      expect(mainDiff?.additions).toBe(1);
      expect(mainDiff?.deletions).toBe(1);

      const addedDiff = summaries.find(s => s.fileName === 'added.tex');
      expect(addedDiff?.status).toBe('added');
      expect(addedDiff?.additions).toBe(1);

      const deletedDiff = summaries.find(s => s.fileName === 'deleted.tex');
      expect(deletedDiff?.status).toBe('deleted');
      expect(deletedDiff?.deletions).toBe(1);

      const unchangedDiff = summaries.find(s => s.fileName === 'unchanged.tex');
      expect(unchangedDiff?.status).toBe('unchanged');

      // Verify sorting: modified (0), added (1), deleted (2), unchanged (3)
      expect(summaries[0].status).toBe('modified');
      expect(summaries[1].status).toBe('added');
      expect(summaries[2].status).toBe('deleted');
      expect(summaries[3].status).toBe('unchanged');
    });
  });
});
