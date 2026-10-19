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
 * Computes line-by-line diff using prefix/suffix Heckel-Myers trimming + LCS,
 * enhancing replaced lines with intra-line word highlights in sub-millisecond time.
 */
export function computeLineDiff(oldContent: string, newContent: string): DiffResult {
  if (oldContent === newContent) {
    const linesA = oldContent === '' ? [] : oldContent.split('\n');
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

  const linesA = oldContent === '' ? [] : oldContent.split('\n');
  const linesB = newContent === '' ? [] : newContent.split('\n');

  const m = linesA.length;
  const n = linesB.length;

  // Handle completely empty old content (pure addition)
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

  // Handle completely empty new content (pure deletion)
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

  // 1. Prefix trimming: match identical lines at start
  let prefix = 0;
  while (prefix < m && prefix < n && linesA[prefix] === linesB[prefix]) {
    prefix++;
  }

  // 2. Suffix trimming: match identical lines at end
  let suffix = 0;
  while (
    suffix < (m - prefix) &&
    suffix < (n - prefix) &&
    linesA[m - 1 - suffix] === linesB[n - 1 - suffix]
  ) {
    suffix++;
  }

  const prefixLines: DiffLine[] = [];
  const prefixSplitRows: SplitDiffRow[] = [];
  for (let i = 0; i < prefix; i++) {
    const text = linesA[i];
    prefixLines.push({
      type: 'unchanged',
      oldLineNumber: i + 1,
      newLineNumber: i + 1,
      text,
      tokens: [{ text, type: 'unchanged' }],
    });
    prefixSplitRows.push({
      left: { lineNumber: i + 1, text, type: 'unchanged', tokens: [{ text, type: 'unchanged' }] },
      right: { lineNumber: i + 1, text, type: 'unchanged', tokens: [{ text, type: 'unchanged' }] },
    });
  }

  const suffixLines: DiffLine[] = [];
  const suffixSplitRows: SplitDiffRow[] = [];
  for (let s = suffix - 1; s >= 0; s--) {
    const oldIdx = m - 1 - s;
    const newIdx = n - 1 - s;
    const text = linesA[oldIdx];
    suffixLines.push({
      type: 'unchanged',
      oldLineNumber: oldIdx + 1,
      newLineNumber: newIdx + 1,
      text,
      tokens: [{ text, type: 'unchanged' }],
    });
    suffixSplitRows.push({
      left: { lineNumber: oldIdx + 1, text, type: 'unchanged', tokens: [{ text, type: 'unchanged' }] },
      right: { lineNumber: newIdx + 1, text, type: 'unchanged', tokens: [{ text, type: 'unchanged' }] },
    });
  }

  // 3. Middle range diffing
  const midA = linesA.slice(prefix, m - suffix);
  const midB = linesB.slice(prefix, n - suffix);
  const midM = midA.length;
  const midN = midB.length;

  let middleLines: DiffLine[] = [];
  const middleSplitRows: SplitDiffRow[] = [];

  if (midM === 0 && midN === 0) {
    // Both prefix and suffix covered entire files
  } else if (midM === 0) {
    // Pure additions in middle
    for (let j = 0; j < midN; j++) {
      const text = midB[j];
      const newLineNumber = prefix + j + 1;
      middleLines.push({
        type: 'added',
        newLineNumber,
        text,
        tokens: [{ text, type: 'added' }],
      });
      middleSplitRows.push({
        right: { lineNumber: newLineNumber, text, type: 'added', tokens: [{ text, type: 'added' }] },
      });
    }
  } else if (midN === 0) {
    // Pure deletions in middle
    for (let i = 0; i < midM; i++) {
      const text = midA[i];
      const oldLineNumber = prefix + i + 1;
      middleLines.push({
        type: 'removed',
        oldLineNumber,
        text,
        tokens: [{ text, type: 'removed' }],
      });
      middleSplitRows.push({
        left: { lineNumber: oldLineNumber, text, type: 'removed', tokens: [{ text, type: 'removed' }] },
      });
    }
  } else {
    // Bounded LCS on middle range using flat 1D Int32Array
    const maxMid = 2000;
    const effA = midA.slice(0, maxMid);
    const effB = midB.slice(0, maxMid);
    const effM = effA.length;
    const effN = effB.length;

    const stride = effN + 1;
    const dp = new Int32Array((effM + 1) * stride);

    for (let i = 1; i <= effM; i++) {
      const rowOffset = i * stride;
      const prevRowOffset = (i - 1) * stride;
      const valA = effA[i - 1];
      for (let j = 1; j <= effN; j++) {
        if (valA === effB[j - 1]) {
          dp[rowOffset + j] = dp[prevRowOffset + (j - 1)] + 1;
        } else {
          const up = dp[prevRowOffset + j];
          const left = dp[rowOffset + (j - 1)];
          dp[rowOffset + j] = up > left ? up : left;
        }
      }
    }

    const revMidLines: DiffLine[] = [];
    let bi = effM;
    let bj = effN;

    while (bi > 0 || bj > 0) {
      const rowOffset = bi * stride;
      const prevRowOffset = (bi - 1) * stride;
      if (bi > 0 && bj > 0 && effA[bi - 1] === effB[bj - 1]) {
        revMidLines.push({
          type: 'unchanged',
          oldLineNumber: prefix + bi,
          newLineNumber: prefix + bj,
          text: effA[bi - 1],
          tokens: [{ text: effA[bi - 1], type: 'unchanged' }],
        });
        bi--;
        bj--;
      } else if (bj > 0 && (bi === 0 || dp[rowOffset + (bj - 1)] >= dp[prevRowOffset + bj])) {
        revMidLines.push({
          type: 'added',
          newLineNumber: prefix + bj,
          text: effB[bj - 1],
        });
        bj--;
      } else if (bi > 0 && (bj === 0 || dp[rowOffset + (bj - 1)] < dp[prevRowOffset + bj])) {
        revMidLines.push({
          type: 'removed',
          oldLineNumber: prefix + bi,
          text: effA[bi - 1],
        });
        bi--;
      }
    }

    middleLines = revMidLines.reverse();

    // Build paired split rows for middle with intra-line word diffs
    let k = 0;
    while (k < middleLines.length) {
      const cur = middleLines[k];
      if (cur.type === 'unchanged') {
        middleSplitRows.push({
          left: { lineNumber: cur.oldLineNumber!, text: cur.text, type: 'unchanged', tokens: cur.tokens },
          right: { lineNumber: cur.newLineNumber!, text: cur.text, type: 'unchanged', tokens: cur.tokens },
        });
        k++;
      } else if (cur.type === 'removed') {
        if (k + 1 < middleLines.length && middleLines[k + 1].type === 'added') {
          const next = middleLines[k + 1];
          const { oldTokens, newTokens } = computeWordDiff(cur.text, next.text);
          cur.tokens = oldTokens;
          next.tokens = newTokens;
          middleSplitRows.push({
            left: { lineNumber: cur.oldLineNumber!, text: cur.text, type: 'removed', tokens: oldTokens },
            right: { lineNumber: next.newLineNumber!, text: next.text, type: 'added', tokens: newTokens },
          });
          k += 2;
        } else {
          cur.tokens = [{ text: cur.text, type: 'removed' }];
          middleSplitRows.push({
            left: { lineNumber: cur.oldLineNumber!, text: cur.text, type: 'removed', tokens: cur.tokens },
          });
          k++;
        }
      } else if (cur.type === 'added') {
        cur.tokens = [{ text: cur.text, type: 'added' }];
        middleSplitRows.push({
          right: { lineNumber: cur.newLineNumber!, text: cur.text, type: 'added', tokens: cur.tokens },
        });
        k++;
      } else {
        k++;
      }
    }
  }

  // Combine prefix + middle + suffix
  const allLines = [...prefixLines, ...middleLines, ...suffixLines];
  const allSplitRows = [...prefixSplitRows, ...middleSplitRows, ...suffixSplitRows];

  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  for (const l of allLines) {
    if (l.type === 'added') additions++;
    else if (l.type === 'removed') deletions++;
    else unchanged++;
  }

  return {
    lines: allLines,
    splitRows: allSplitRows,
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
