/**
 * Diff Service for Teeex
 * Computes high-performance line-by-line differences between file revisions
 * using Longest Common Subsequence (LCS).
 */

export type DiffType = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  type: DiffType;
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
}

export interface SplitDiffRow {
  left?: {
    lineNumber: number;
    text: string;
    type: 'removed' | 'unchanged';
  };
  right?: {
    lineNumber: number;
    text: string;
    type: 'added' | 'unchanged';
  };
}

export interface DiffResult {
  lines: DiffLine[];
  splitRows: SplitDiffRow[];
  additions: number;
  deletions: number;
  unchanged: number;
}

/**
 * Computes line-by-line diff using LCS
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
    }));
    const splitRows: SplitDiffRow[] = linesA.map((text, i) => ({
      left: { lineNumber: i + 1, text, type: 'unchanged' },
      right: { lineNumber: i + 1, text, type: 'unchanged' },
    }));
    return {
      lines,
      splitRows,
      additions: 0,
      deletions: 0,
      unchanged: linesA.length,
    };
  }

  // Handle completely empty old or new content
  if (m === 0) {
    const lines: DiffLine[] = linesB.map((text, i) => ({
      type: 'added',
      newLineNumber: i + 1,
      text,
    }));
    const splitRows: SplitDiffRow[] = linesB.map((text, i) => ({
      right: { lineNumber: i + 1, text, type: 'added' },
    }));
    return {
      lines,
      splitRows,
      additions: n,
      deletions: 0,
      unchanged: 0,
    };
  }

  if (n === 0) {
    const lines: DiffLine[] = linesA.map((text, i) => ({
      type: 'removed',
      oldLineNumber: i + 1,
      text,
    }));
    const splitRows: SplitDiffRow[] = linesA.map((text, i) => ({
      left: { lineNumber: i + 1, text, type: 'removed' },
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

  // Build paired split rows for Side-by-Side view
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
        splitRows.push({
          left: { lineNumber: cur.oldLineNumber!, text: cur.text, type: 'removed' },
          right: { lineNumber: lines[k + 1].newLineNumber!, text: lines[k + 1].text, type: 'added' },
        });
        k += 2;
      } else {
        splitRows.push({
          left: { lineNumber: cur.oldLineNumber!, text: cur.text, type: 'removed' },
        });
        k++;
      }
    } else if (cur.type === 'added') {
      splitRows.push({
        right: { lineNumber: cur.newLineNumber!, text: cur.text, type: 'added' },
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
