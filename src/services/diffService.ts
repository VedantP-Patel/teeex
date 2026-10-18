/**
 * Diff Service for Teeex
 * Computes high-performance line-by-line and intra-line word differences
 * between file revisions using Longest Common Subsequence (LCS).
 */

import type { ProjectFile } from '../types/latex';

export type DiffType = 'added' | 'removed' | 'unchanged';

export interface DiffToken {
  text: string;
  type: 'added' | 'removed' | 'unchanged';
}

export interface DiffLine {
  type: DiffType;
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
  tokens?: DiffToken[];
}

export interface SplitDiffRow {
  left?: {
    lineNumber: number;
    text: string;
    type: 'removed' | 'unchanged';
    tokens?: DiffToken[];
  };
  right?: {
    lineNumber: number;
    text: string;
    type: 'added' | 'unchanged';
    tokens?: DiffToken[];
  };
}

export interface DiffResult {
  lines: DiffLine[];
  splitRows: SplitDiffRow[];
  additions: number;
  deletions: number;
  unchanged: number;
}

export interface FileDiffSummary {
  fileId: string;
  fileName: string;
  status: 'modified' | 'added' | 'deleted' | 'unchanged';
  additions: number;
  deletions: number;
  oldContent: string;
  newContent: string;
  diff: DiffResult;
}

/**
 * Tokenizes a string into words, LaTeX control sequences, punctuation, and whitespace.
 */
function tokenizeWords(str: string): string[] {
  if (!str) return [];
  // Matches LaTeX commands (\section, \alpha), words, spaces, or individual punctuation
  const regex = /(\\[a-zA-Z@]+|\s+|[a-zA-Z0-9_]+|[^\s\w\\])/g;
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(str)) !== null) {
    tokens.push(m[0]);
  }
  return tokens.length > 0 ? tokens : [str];
}

/**
 * Computes word-level diff between two lines using LCS.
 */
export function computeWordDiff(
  oldLine: string,
  newLine: string
): { oldTokens: DiffToken[]; newTokens: DiffToken[] } {
  const tokA = tokenizeWords(oldLine);
  const tokB = tokenizeWords(newLine);

  const lenA = tokA.length;
  const lenB = tokB.length;

  // Bounded check for extremely long single lines (fallback to single token)
  if (lenA > 250 || lenB > 250) {
    return {
      oldTokens: [{ text: oldLine, type: 'removed' }],
      newTokens: [{ text: newLine, type: 'added' }],
    };
  }

  // LCS Dynamic Programming table
  const dp: number[][] = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      if (tokA[i - 1] === tokB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const oldTokensRev: DiffToken[] = [];
  const newTokensRev: DiffToken[] = [];

  let i = lenA;
  let j = lenB;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && tokA[i - 1] === tokB[j - 1]) {
      oldTokensRev.push({ text: tokA[i - 1], type: 'unchanged' });
      newTokensRev.push({ text: tokB[j - 1], type: 'unchanged' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      newTokensRev.push({ text: tokB[j - 1], type: 'added' });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      oldTokensRev.push({ text: tokA[i - 1], type: 'removed' });
      i--;
    }
  }

  return {
    oldTokens: oldTokensRev.reverse(),
    newTokens: newTokensRev.reverse(),
  };
}

/**
 * Computes line-by-line diff using LCS, enhancing replaced lines with intra-line word highlights.
 */
export function computeLineDiff(oldContent: string, newContent: string): DiffResult {
  const linesA = oldContent === '' ? [] : oldContent.split('\n');
  const linesB = newContent === '' ? [] : newContent.split('\n');

  const m = linesA.length;
  const n = linesB.length;

  // Optimize for identical files
  if (oldContent === newContent) {
    const lines: DiffLine[] = linesA.map((text, i) => ({
      type: 'unchanged',
      oldLineNumber: i + 1,
      newLineNumber: i + 1,
      text,
      tokens: [{ text, type: 'unchanged' }],
    }));
    const splitRows: SplitDiffRow[] = linesA.map((text, i) => ({
      left: { lineNumber: i + 1, text, type: 'unchanged', tokens: [{ text, type: 'unchanged' }] },
      right: { lineNumber: i + 1, text, type: 'unchanged', tokens: [{ text, type: 'unchanged' }] },
    }));
    return {
      lines,
      splitRows,
      additions: 0,
      deletions: 0,
      unchanged: linesA.length,
    };
  }

  // Handle completely empty old content
  if (m === 0) {
    const lines: DiffLine[] = linesB.map((text, i) => ({
      type: 'added',
      newLineNumber: i + 1,
      text,
      tokens: [{ text, type: 'added' }],
    }));
    const splitRows: SplitDiffRow[] = linesB.map((text, i) => ({
      right: { lineNumber: i + 1, text, type: 'added', tokens: [{ text, type: 'added' }] },
    }));
    return {
      lines,
      splitRows,
      additions: n,
      deletions: 0,
      unchanged: 0,
    };
  }

  // Handle completely empty new content
  if (n === 0) {
    const lines: DiffLine[] = linesA.map((text, i) => ({
      type: 'removed',
      oldLineNumber: i + 1,
      text,
      tokens: [{ text, type: 'removed' }],
    }));
    const splitRows: SplitDiffRow[] = linesA.map((text, i) => ({
      left: { lineNumber: i + 1, text, type: 'removed', tokens: [{ text, type: 'removed' }] },
    }));
    return {
      lines,
      splitRows,
      additions: 0,
      deletions: m,
      unchanged: 0,
    };
  }

  // Standard LCS dynamic programming table (bounded to max 3000 lines for instant performance)
  const maxLines = 3000;
  const effectiveA = linesA.slice(0, maxLines);
  const effectiveB = linesB.slice(0, maxLines);
  const effM = effectiveA.length;
  const effN = effectiveB.length;

  // dp table
  const dp: number[][] = Array.from({ length: effM + 1 }, () => new Array(effN + 1).fill(0));

  for (let i = 1; i <= effM; i++) {
    for (let j = 1; j <= effN; j++) {
      if (effectiveA[i - 1] === effectiveB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const lines: DiffLine[] = [];
  let i = effM;
  let j = effN;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && effectiveA[i - 1] === effectiveB[j - 1]) {
      lines.push({
        type: 'unchanged',
        oldLineNumber: i,
        newLineNumber: j,
        text: effectiveA[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      lines.push({
        type: 'added',
        newLineNumber: j,
        text: effectiveB[j - 1],
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      lines.push({
        type: 'removed',
        oldLineNumber: i,
        text: effectiveA[i - 1],
      });
      i--;
    }
  }

  lines.reverse();

  // Statistics
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  lines.forEach(l => {
    if (l.type === 'added') additions++;
    else if (l.type === 'removed') deletions++;
    else unchanged++;
  });

  // Build paired split rows for Side-by-Side view with intra-line word diffs
  const splitRows: SplitDiffRow[] = [];
  let k = 0;
  while (k < lines.length) {
    const cur = lines[k];
    if (cur.type === 'unchanged') {
      splitRows.push({
        left: { lineNumber: cur.oldLineNumber!, text: cur.text, type: 'unchanged' },
        right: { lineNumber: cur.newLineNumber!, text: cur.text, type: 'unchanged' },
      });
      k++;
    } else if (cur.type === 'removed') {
      // Check if followed by an added line (replacement)
      if (k + 1 < lines.length && lines[k + 1].type === 'added') {
        const next = lines[k + 1];
        // Compute intra-line word diff for this replacement pair
        const { oldTokens, newTokens } = computeWordDiff(cur.text, next.text);
        cur.tokens = oldTokens;
        next.tokens = newTokens;

        splitRows.push({
          left: { lineNumber: cur.oldLineNumber!, text: cur.text, type: 'removed', tokens: oldTokens },
          right: { lineNumber: next.newLineNumber!, text: next.text, type: 'added', tokens: newTokens },
        });
        k += 2;
      } else {
        cur.tokens = [{ text: cur.text, type: 'removed' }];
        splitRows.push({
          left: { lineNumber: cur.oldLineNumber!, text: cur.text, type: 'removed', tokens: cur.tokens },
        });
        k++;
      }
    } else if (cur.type === 'added') {
      cur.tokens = [{ text: cur.text, type: 'added' }];
      splitRows.push({
        right: { lineNumber: cur.newLineNumber!, text: cur.text, type: 'added', tokens: cur.tokens },
      });
      k++;
    } else {
      k++;
    }
  }

  return {
    lines,
    splitRows,
    additions,
    deletions,
    unchanged,
  };
}

/**
 * Computes multi-file diff summary across two project file snapshots.
 */
export function computeProjectFileDiffs(
  oldFiles: ProjectFile[],
  newFiles: ProjectFile[]
): FileDiffSummary[] {
  const fileMap = new Map<string, { oldFile?: ProjectFile; newFile?: ProjectFile }>();

  // Map old files
  for (const f of oldFiles) {
    fileMap.set(f.id, { oldFile: f });
  }

  // Match or add new files
  for (const f of newFiles) {
    const existing = fileMap.get(f.id) || Array.from(fileMap.values()).find(v => v.oldFile?.name === f.name);
    if (existing) {
      existing.newFile = f;
    } else {
      fileMap.set(f.id, { newFile: f });
    }
  }

  const summaries: FileDiffSummary[] = [];

  for (const [fileId, { oldFile, newFile }] of fileMap.entries()) {
    const fileName = newFile?.name || oldFile?.name || 'file';
    const oldContent = oldFile?.content || '';
    const newContent = newFile?.content || '';

    let status: 'modified' | 'added' | 'deleted' | 'unchanged' = 'unchanged';
    if (!oldFile && newFile) {
      status = 'added';
    } else if (oldFile && !newFile) {
      status = 'deleted';
    } else if (oldContent !== newContent) {
      status = 'modified';
    }

    const diff = computeLineDiff(oldContent, newContent);

    summaries.push({
      fileId,
      fileName,
      status,
      additions: diff.additions,
      deletions: diff.deletions,
      oldContent,
      newContent,
      diff,
    });
  }

  // Sort: Modified first, then Added, then Deleted, then Unchanged
  const order = { modified: 0, added: 1, deleted: 2, unchanged: 3 };
  summaries.sort((a, b) => order[a.status] - order[b.status] || a.fileName.localeCompare(b.fileName));

  return summaries;
}
