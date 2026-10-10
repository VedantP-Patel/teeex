/**
 * Teeex Studio — Pure LaTeX Bracket Matching Engine
 * 100% Deterministic, zero-AI pair resolution for (), [], and {}.
 */

export function findMatchingBracket(code: string, cursorOffset: number): [number, number] | null {
  if (!code || cursorOffset < 0 || cursorOffset > code.length) return null;

  // Inspect character under cursor or immediately to the left
  const candidates = [cursorOffset, cursorOffset - 1];
  let targetIndex = -1;
  let targetChar = '';

  for (const idx of candidates) {
    if (idx >= 0 && idx < code.length) {
      const ch = code[idx];
      if ('{}[]()'.includes(ch)) {
        // Ensure bracket is not an escaped literal like \{ or \[
        let backslashes = 0;
        for (let j = idx - 1; j >= 0 && code[j] === '\\'; j--) {
          backslashes++;
        }
        if (backslashes % 2 === 0) {
          targetIndex = idx;
          targetChar = ch;
          break;
        }
      }
    }
  }

  if (targetIndex === -1) return null;

  const pairs: Record<string, string> = {
    '{': '}',
    '[': ']',
    '(': ')',
    '}': '{',
    ']': '[',
    ')': '(',
  };

  const partnerChar = pairs[targetChar];
  const isOpening = '{[('.includes(targetChar);

  let depth = 0;

  if (isOpening) {
    for (let i = targetIndex; i < code.length; i++) {
      // Check escaping
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && code[j] === '\\'; j--) {
        backslashes++;
      }
      if (backslashes % 2 === 1) continue;

      if (code[i] === targetChar) {
        depth++;
      } else if (code[i] === partnerChar) {
        depth--;
        if (depth === 0) return [targetIndex, i];
      }
    }
  } else {
    for (let i = targetIndex; i >= 0; i--) {
      // Check escaping
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && code[j] === '\\'; j--) {
        backslashes++;
      }
      if (backslashes % 2 === 1) continue;

      if (code[i] === targetChar) {
        depth++;
      } else if (code[i] === partnerChar) {
        depth--;
        if (depth === 0) return [i, targetIndex];
      }
    }
  }

  return null;
}
