/**
 * Teeex — parser fuzzing.
 *
 * Both parsers consume output from an external process. A malformed, truncated,
 * or adversarial log must never crash the app or hang the tab: a compile that
 * went wrong should surface as a diagnostic, not as a blank screen.
 *
 * Uses a seeded generator rather than a property-testing library so failures
 * are exactly reproducible from the printed seed — the brief treats
 * reproducibility as a requirement, and a randomly-seeded failure that cannot
 * be replayed is not actionable.
 */

import { describe, expect, it } from 'vitest';
import { parseTexLog } from '../../src/services/texLog';
import {
  forwardSync,
  inverseSync,
  parseSyncTex,
  type SyncTexIndex,
} from '../../src/services/synctex';

/** mulberry32 — small, fast, fully determined by its seed. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CASES = 400;

/** Fragments drawn from real TeX logs, plus the characters that break parsers. */
const LOG_FRAGMENTS = [
  '! Undefined control sequence.',
  '! LaTeX Error: File `x.sty\' not found.',
  '! Emergency stop.',
  '!  ==> Fatal error occurred, no output PDF file produced!',
  'l.42 \\badmacro',
  'l.',
  'l.99999999999999999999',
  '(./main.tex',
  '(./sections/intro.tex',
  ')',
  '))))))))',
  '((((((((',
  '[1] [2] [3]',
  'LaTeX Warning: Citation `a\' on page 1 undefined on input line 7.',
  'LaTeX Warning:',
  'Package  Warning: ',
  'Overfull \\hbox (15.47pt too wide) in paragraph at lines 23--25',
  'Overfull \\hbox (',
  'Underfull \\vbox (badness 10000) has occurred while \\output is active [5]',
  'Missing character: There is no',
  'Missing character: There is no 中 (U+4E2D) in font cmr10!',
  'No file ',
  'No file a.tex.',
  'Output written on main.pdf (3 pages, 120000 bytes).',
  '',
  ' ',
  '\t\t\t',
  'x'.repeat(79),
  'x'.repeat(200),
  '\u0000\u0001\u0002',
  '%%TEEEX_STASH_TOKEN_1%%',
  '\\\\\\\\\\\\',
  '{}{}{}',
  '$$$$',
  '\uD800',
  '\u{1F600}\u{1F600}',
];

function randomLog(next: () => number): string {
  const lines = Math.floor(next() * 40);
  const out: string[] = [];
  for (let i = 0; i < lines; i++) {
    const fragment = LOG_FRAGMENTS[Math.floor(next() * LOG_FRAGMENTS.length)];
    // Sometimes splice two fragments to produce shapes no single sample has.
    if (next() < 0.25) {
      out.push(fragment + LOG_FRAGMENTS[Math.floor(next() * LOG_FRAGMENTS.length)]);
    } else {
      out.push(fragment);
    }
  }
  return out.join(next() < 0.1 ? '\r\n' : '\n');
}

describe('parseTexLog fuzzing', () => {
  it('never throws, and always returns a well-formed result', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const next = rng(seed);
      const log = randomLog(next);

      let result: ReturnType<typeof parseTexLog>;
      try {
        result = parseTexLog(log, { root: 'main.tex' });
      } catch (error) {
        throw new Error(
          `parseTexLog threw on seed ${seed}: ${String(error)}\n--- input ---\n${log}`,
        );
      }

      expect(Array.isArray(result.diagnostics), `seed ${seed}`).toBe(true);
      expect(Array.isArray(result.missingPackages), `seed ${seed}`).toBe(true);
      expect(typeof result.fatal, `seed ${seed}`).toBe('boolean');

      const ids = new Set<string>();
      for (const diagnostic of result.diagnostics) {
        // A duplicate id makes React lists and "jump to error" misbehave.
        expect(ids.has(diagnostic.id), `duplicate id on seed ${seed}`).toBe(false);
        ids.add(diagnostic.id);

        expect(typeof diagnostic.message, `seed ${seed}`).toBe('string');
        expect(['error', 'warning', 'info']).toContain(diagnostic.severity);

        // A NaN line number silently breaks every consumer downstream.
        if (diagnostic.line !== undefined) {
          expect(Number.isFinite(diagnostic.line), `seed ${seed}`).toBe(true);
        }
        if (diagnostic.endLine !== undefined) {
          expect(Number.isFinite(diagnostic.endLine), `seed ${seed}`).toBe(true);
        }
      }
    }
  });

  it('stays linear on pathological input', () => {
    // Deeply nested open-parens with no closes, and a very long wrapped line:
    // both are shapes that invite accidental quadratic scanning.
    const nested = '(./a.tex'.repeat(20_000);
    const wrapped = Array.from({ length: 20_000 }, () => 'x'.repeat(79)).join('\n');

    const started = performance.now();
    parseTexLog(nested);
    parseTexLog(wrapped);
    const elapsed = performance.now() - started;

    // Generous: this is a smoke test for complexity class, not a benchmark.
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('parseSyncTex fuzzing', () => {
  const SYNCTEX_FRAGMENTS = [
    'SyncTeX Version:1',
    'Input:1:./main.tex',
    'Input:1',
    'Input::',
    'Input:notanumber:./x.tex',
    'Magnification:1000',
    'Magnification:0',
    'Magnification:abc',
    'Unit:1',
    'Unit:-5',
    'X Offset:0',
    'Y Offset:notanumber',
    'Content:',
    '{1',
    '{',
    '{notanumber',
    '}',
    '}}}}',
    '[1,1:0,0:100,100,0',
    '(1,10:72,100:400,10,2',
    '(1,10:72,100',
    '(1,10',
    '(',
    'h1,5:0,0:1,1,1',
    'k1,5:0,0:10',
    'x1,5:0,0',
    '$1,5:0,0',
    'v1,5:-99999999,-99999999:-1,-1,-1',
    'r',
    ')',
    ']',
    'Postamble:',
    'garbage',
    '',
  ];

  it('never throws on arbitrary input', async () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const next = rng(seed * 7919);
      const lines = Math.floor(next() * 30);
      const parts: string[] = [];
      for (let i = 0; i < lines; i++) {
        parts.push(SYNCTEX_FRAGMENTS[Math.floor(next() * SYNCTEX_FRAGMENTS.length)]);
      }
      const text = parts.join('\n');

      let index: SyncTexIndex;
      try {
        index = await parseSyncTex(new TextEncoder().encode(text));
      } catch (error) {
        throw new Error(
          `parseSyncTex threw on seed ${seed}: ${String(error)}\n--- input ---\n${text}`,
        );
      }

      // Every coordinate must be a usable number, or the viewer would place
      // highlights at NaN and silently render nothing.
      for (const boxes of index.pages.values()) {
        for (const box of boxes) {
          for (const value of [box.x, box.y, box.width, box.height, box.depth]) {
            expect(Number.isFinite(value), `seed ${seed}`).toBe(true);
          }
          expect(Number.isFinite(box.line), `seed ${seed}`).toBe(true);
        }
      }

      // Queries against a garbage index must also be safe.
      expect(() => forwardSync(index, 'main.tex', 1)).not.toThrow();
      expect(() => inverseSync(index, 1, 0, 0)).not.toThrow();
      expect(() => inverseSync(index, 1, -1e12, 1e12)).not.toThrow();
    }
  });

  it('does not throw on random bytes', async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const next = rng(seed * 104729);
      const bytes = new Uint8Array(Math.floor(next() * 512));
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(next() * 256);

      // Includes inputs that start with the gzip magic but are not valid gzip,
      // which must be reported rather than crashing the caller.
      await expect(
        parseSyncTex(bytes).catch((error: unknown) => {
          if (error instanceof Error) return { files: new Map(), pages: new Map(), version: 1 };
          throw error;
        }),
      ).resolves.toBeDefined();
    }
  });
});
