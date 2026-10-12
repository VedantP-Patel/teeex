/**
 * Teeex — document class presets.
 *
 * Previously this file described page furniture that was painted into the
 * preview and had no basis in the document: invented IEEE volume numbers, a
 * fabricated arXiv stamp, "Teeex Studio Typeset" footers, and a single set of
 * typography values (12px / 1.5 line-height / 18mm padding) applied to every
 * format regardless of what the source declared. Selecting a format changed
 * the preview's appearance without changing the document, so the preview
 * described a paper that did not exist.
 *
 * Under the current architecture, layout comes from TeX, which takes its
 * instructions from `\documentclass`. A format preset is therefore a *source
 * transformation*: choosing one rewrites the document's class and required
 * packages, and the engine re-typesets accordingly. What you see is what the
 * class actually produces — including its own headers, footers, and page size.
 */

export type PaperFormatId = 'ieee' | 'acm' | 'nature' | 'arxiv' | 'standard';

export interface PaperFormatConfig {
  id: PaperFormatId;
  name: string;
  badge: string;
  description: string;
  /** The `\documentclass` line this preset installs. */
  documentClass: string;
  /** Packages the class needs that are not already conventional. */
  packages: string[];
  /** Informational: what the class itself does by default. */
  defaultColumns: 1 | 2;
  /**
   * How reliably this preset's class actually compiles, verified by the e2e
   * suite — NOT a guess. The format menu uses this to warn honestly instead of
   * presenting every preset as equally ready (see docs/support-matrix.json
   * format.presets).
   *
   *  'bundled'          the class is in the preloaded set; compiles offline.
   *  'remote-verified'  not bundled, but confirmed to resolve and compile.
   *  'remote-heavy'     not bundled; pulls a large dependency tree on first
   *                     compile and is slow or unconfirmed. Choosing it is
   *                     allowed, but the user is told what to expect.
   */
  resolution: 'bundled' | 'remote-verified' | 'remote-heavy';
  /**
   * Approximate styling for the draft outline view only.
   *
   * These are NOT the typesetting parameters. The outline is an HTML skim of
   * the source shown while the engine compiles; it makes no fidelity claim and
   * its values are not derived from the class. Anything that must be accurate
   * is read from the compiled PDF.
   */
  outline: {
    fontFamily: string;
    fontSize: string;
    lineHeight: number;
  };
}

const SERIF_STACK = '"Latin Modern Roman", "Computer Modern", "Newsreader", "Times New Roman", Times, serif';

export const PAPER_FORMATS: Record<PaperFormatId, PaperFormatConfig> = {
  standard: {
    id: 'standard',
    name: 'LaTeX article',
    badge: 'article',
    description: 'The standard class. One column, 10pt, no running head.',
    documentClass: '\\documentclass[10pt,a4paper]{article}',
    packages: ['amsmath', 'amssymb', 'graphicx'],
    defaultColumns: 1,
    resolution: 'bundled',
    outline: { fontFamily: SERIF_STACK, fontSize: '13.3px', lineHeight: 1.2 },
  },
  ieee: {
    id: 'ieee',
    name: 'IEEE Transactions',
    badge: 'IEEEtran',
    description: 'Two-column IEEE journal class. US Letter, 10pt.',
    documentClass: '\\documentclass[journal]{IEEEtran}',
    packages: ['amsmath', 'amssymb', 'graphicx', 'cite'],
    defaultColumns: 2,
    resolution: 'remote-verified',
    outline: { fontFamily: SERIF_STACK, fontSize: '13.3px', lineHeight: 1.2 },
  },
  acm: {
    id: 'acm',
    name: 'ACM Proceedings',
    badge: 'acmart',
    description: 'ACM conference class with its own title block and rights statement.',
    documentClass: '\\documentclass[sigconf]{acmart}',
    packages: ['amsmath', 'graphicx'],
    defaultColumns: 2,
    resolution: 'remote-heavy',
    outline: { fontFamily: SERIF_STACK, fontSize: '12.5px', lineHeight: 1.2 },
  },
  nature: {
    id: 'nature',
    name: 'Springer Nature',
    badge: 'sn-jnl',
    description: 'Springer Nature journal class, single column reference style.',
    documentClass: '\\documentclass[pdflatex,sn-nature]{sn-jnl}',
    packages: ['amsmath', 'graphicx'],
    defaultColumns: 1,
    resolution: 'remote-heavy',
    outline: { fontFamily: SERIF_STACK, fontSize: '13.3px', lineHeight: 1.25 },
  },
  arxiv: {
    id: 'arxiv',
    name: 'arXiv preprint',
    badge: 'preprint',
    description: 'Standard article with wide margins, suitable for preprints.',
    documentClass: '\\documentclass[11pt,a4paper]{article}',
    packages: ['amsmath', 'amssymb', 'graphicx', 'geometry'],
    defaultColumns: 1,
    resolution: 'bundled',
    outline: { fontFamily: SERIF_STACK, fontSize: '14.6px', lineHeight: 1.25 },
  },
};

/**
 * Rewrites a document's `\documentclass` to the chosen preset, adding any
 * packages the class needs that are not already loaded.
 *
 * Returns the source unchanged when it has no `\documentclass`, rather than
 * guessing where a preamble should begin — silently restructuring someone's
 * document is worse than declining to.
 */
export function applyDocumentClass(source: string, format: PaperFormatId): string {
  const preset = PAPER_FORMATS[format];
  const classPattern = /^[ \t]*\\documentclass\s*(?:\[[^\]]*\])?\s*\{[^}]*\}[ \t]*$/m;

  if (!classPattern.test(source)) return source;

  let next = source.replace(classPattern, preset.documentClass);

  const missing = preset.packages.filter(
    (pkg) => !new RegExp(`\\\\usepackage(?:\\s*\\[[^\\]]*\\])?\\s*\\{[^}]*\\b${pkg}\\b[^}]*\\}`).test(next),
  );

  if (missing.length > 0) {
    const insertAfter = next.indexOf(preset.documentClass) + preset.documentClass.length;
    const block = missing.map((pkg) => `\\usepackage{${pkg}}`).join('\n');
    next = `${next.slice(0, insertAfter)}\n${block}${next.slice(insertAfter)}`;
  }

  return next;
}

/** Best-effort read of the class a document already declares. */
export function detectDocumentClass(source: string): PaperFormatId | null {
  const match = source.match(/\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/);
  if (!match) return null;

  const [, options = '', className] = match;
  const name = className.trim().toLowerCase();

  if (name === 'ieeetran') return 'ieee';
  if (name === 'acmart') return 'acm';
  if (name.startsWith('sn-')) return 'nature';
  if (name === 'article') {
    return /\b11pt|12pt\b/.test(options) ? 'arxiv' : 'standard';
  }
  return null;
}

/**
 * A one-line honest notice for the moment a preset is applied, or null when the
 * preset compiles with no caveat.
 *
 * The format menu offers every preset, but they are not equal: article and
 * arXiv are bundled and compile offline; IEEEtran is confirmed to resolve from
 * the package server; acmart and sn-jnl pull a large dependency tree and, as of
 * the current package wiring, were not seen to finish within a practical time
 * (docs/support-matrix.json format.presets). Rewriting a user's \documentclass
 * to one of those silently would be exactly the misleading support this project
 * is meant to avoid, so the UI says what to expect instead.
 */
export function formatResolutionNotice(format: PaperFormatId): string | null {
  const preset = PAPER_FORMATS[format];
  if (preset.resolution === 'remote-heavy') {
    return (
      `${preset.name} (${preset.badge}) pulls a large set of LaTeX packages on ` +
      `first compile. It needs the package server and may be slow or fail the ` +
      `first time; if nothing appears, check the diagnostics panel.`
    );
  }
  return null;
}

/** Whether the document declares a two-column layout. */
export function isTwoColumnSource(source: string): boolean {
  const match = source.match(/\\documentclass\s*(?:\[([^\]]*)\])?\s*\{[^}]+\}/);
  if (!match) return false;

  const options = match[1] ?? '';
  if (/(?:^|,)\s*twocolumn\s*(?:,|$)/.test(options)) return true;

  // Several journal classes are two-column by default with no explicit option.
  const className = source.match(/\\documentclass[^{]*\{([^}]+)\}/)?.[1]?.trim().toLowerCase();
  if (className === 'ieeetran' && !/(?:^|,)\s*onecolumn\s*(?:,|$)/.test(options)) return true;
  if (className === 'acmart' && /sigconf|sigplan|acmsmall/.test(options)) return true;

  return false;
}

/**
 * Adds or removes the `twocolumn` class option.
 *
 * Column count is a property of the document, not of the viewer: LaTeX decides
 * column widths, gutter, and float placement from it. Toggling a UI flag — as
 * this previously did — restyled an HTML mock and left the compiled document
 * unchanged, so the control did nothing to the actual output.
 *
 * Returns the source unchanged when there is no `\documentclass` to amend.
 */
export function setTwoColumn(source: string, twoColumn: boolean): string {
  const match = source.match(/\\documentclass(\s*\[([^\]]*)\])?\s*\{([^}]+)\}/);
  if (!match) return source;

  const [whole, , rawOptions = '', className] = match;

  const options = rawOptions
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option.length > 0 && option !== 'twocolumn' && option !== 'onecolumn');

  if (twoColumn) {
    options.push('twocolumn');
  } else if (/ieeetran/i.test(className)) {
    // IEEEtran is two-column by default, so a single column needs the opposite
    // option stated explicitly rather than just omitting `twocolumn`.
    options.push('onecolumn');
  }

  const replacement =
    options.length > 0
      ? `\\documentclass[${options.join(',')}]{${className}}`
      : `\\documentclass{${className}}`;

  return source.replace(whole, replacement);
}
