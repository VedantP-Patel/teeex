/**
 * Teeex — pdfTeX / LaTeX log parser.
 *
 * TeX's console log is the only channel through which the engine reports what
 * it did. Parsing it properly is what separates "compilation failed" from
 * "line 42 of sections/intro.tex uses \includegraphics but graphicx is not
 * loaded".
 *
 * Three details that naive parsers get wrong, and that this module handles:
 *
 *  1. Line wrapping. TeX hard-wraps log output at `max_print_line` (79 by
 *     default), splitting messages mid-word. Lines must be rejoined before
 *     matching or every pattern anchored past column 79 silently fails.
 *
 *  2. File attribution. TeX reports `(./file.tex` on open and `)` on close.
 *     Without tracking that stack, every diagnostic gets blamed on the root
 *     file, so errors inside \input-ed files point at the wrong document.
 *
 *  3. Classification. "File `foo.sty' not found" is recoverable by loading a
 *     package; "Emergency stop" is not. Collapsing both to "error" throws away
 *     the only information that lets the UI offer a fix.
 *
 * Kept free of engine and DOM dependencies so it is directly unit-testable.
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'missing-package'
  | 'missing-file'
  | 'missing-graphic'
  | 'undefined-control-sequence'
  | 'undefined-environment'
  | 'missing-citation'
  | 'missing-reference'
  | 'duplicate-label'
  | 'missing-glyph'
  | 'font-substitution'
  | 'rerun-required'
  | 'overfull-box'
  | 'underfull-box'
  | 'syntax'
  | 'fatal'
  | 'other';

export interface DiagnosticSuggestedFix {
  title: string;
  description: string;
  replacement: string;
  startLine: number;
  endLine: number;
}

export interface CompileDiagnostic {
  id: string;
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  message: string;
  /** Source file TeX was reading, relative to the project root, when available. */
  file?: string;
  line?: number;
  /** Set for diagnostics that span a range, e.g. bad boxes ("at lines 23--25"). */
  endLine?: number;
  /** The `l.NN ...` source excerpt TeX echoed, when present. */
  context?: string;
  /** Actionable next step, only when one can be stated with confidence. */
  hint?: string;
  /** Actionable 1-click code replacement when applicable. */
  suggestedFix?: DiagnosticSuggestedFix;
  /** Verbatim log lines this diagnostic was derived from. */
  raw: string;
}

export interface TexLogParseResult {
  diagnostics: CompileDiagnostic[];
  /** Package names from "File `x.sty' not found" — resolvable on demand. */
  missingPackages: string[];
  /** Non-.sty inputs TeX could not find (graphics, .bib, \input targets). */
  missingFiles: string[];
  /** True when LaTeX asked for another pass to settle refs/labels/TOC. */
  rerunRequired: boolean;
  /** True when TeX aborted without producing output. */
  fatal: boolean;
  /** Files TeX actually opened, in first-seen order. */
  filesRead: string[];
}

const DEFAULT_MAX_PRINT_LINE = 79;

/**
 * Markers that always begin a logical log line. A wrapped continuation never
 * starts with one of these, so they act as a guard against gluing together two
 * genuinely distinct lines that happen to sit at the wrap column.
 */
const LINE_START_MARKERS = [
  '!',
  'l.',
  'Overfull',
  'Underfull',
  'LaTeX Warning:',
  'LaTeX Font Warning:',
  'LaTeX Info:',
  'Package ',
  'Class ',
  'Document Class:',
  'Missing character:',
  'No file',
  'Output written',
  'Transcript written',
  'This is pdfTeX',
  'This is XeTeX',
  'This is LuaHBTeX',
  '***',
  '==>',
];

function startsLogicalLine(line: string): boolean {
  if (line.length === 0) return true;
  return LINE_START_MARKERS.some((marker) => line.startsWith(marker));
}

/**
 * Rejoins lines TeX wrapped at `maxPrintLine`.
 *
 * A line is treated as wrapped when it is exactly at the wrap width and the
 * following line does not itself begin a new logical record. This is a
 * heuristic — a real line of exactly 79 characters followed by a continuation
 * is indistinguishable from a wrap — but it is the same heuristic every
 * production LaTeX log parser uses, and erring toward joining recovers far more
 * messages than it corrupts.
 */
export function unwrapLogLines(
  log: string,
  maxPrintLine: number = DEFAULT_MAX_PRINT_LINE,
): string[] {
  const rawLines = log.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];

  for (const raw of rawLines) {
    const previous = out[out.length - 1];
    const previousWasWrapped =
      previous !== undefined &&
      previous.length >= maxPrintLine &&
      previous.length % maxPrintLine === 0 &&
      !startsLogicalLine(raw);

    if (previousWasWrapped) {
      out[out.length - 1] = previous + raw;
    } else {
      out.push(raw);
    }
  }

  return out;
}

/** Recognises the path TeX prints after `(` when opening a file. */
const OPEN_FILE = /^[^()\s]*\.(?:tex|sty|cls|clo|cfg|def|fd|ldf|bbl|aux|toc|lof|lot|out|bst|enc|map)$/i;

/**
 * Tracks TeX's open-file stack across a log.
 *
 * TeX does not delimit these records, and parentheses occur freely in prose, so
 * exact reconstruction is impossible. This scanner only pushes when `(` is
 * followed by something that looks like a TeX input path, and tolerates
 * unbalanced `)` by ignoring pops on an empty stack — which keeps attribution
 * stable instead of desynchronising for the rest of the document.
 */
class FileStack {
  private stack: string[];
  private seen = new Set<string>();
  readonly order: string[] = [];

  constructor(root: string) {
    this.stack = [root];
    this.note(root);
  }

  private note(path: string) {
    if (!this.seen.has(path)) {
      this.seen.add(path);
      this.order.push(path);
    }
  }

  current(): string {
    return this.stack[this.stack.length - 1];
  }

  /** Applies every open/close event on one log line. */
  consume(line: string): void {
    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '(') {
        let end = i + 1;
        while (end < line.length && !'()[] '.includes(line[end])) end++;
        const candidate = line.slice(i + 1, end);
        if (OPEN_FILE.test(candidate)) {
          const path = normalisePath(candidate);
          this.stack.push(path);
          this.note(path);
          i = end - 1;
        }
      } else if (char === ')') {
        if (this.stack.length > 1) this.stack.pop();
      }
    }
  }
}

function normalisePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\\/g, '/');
}

interface Builder {
  diagnostics: CompileDiagnostic[];
  counter: number;
}

function push(
  builder: Builder,
  diagnostic: Omit<CompileDiagnostic, 'id'>,
): void {
  builder.diagnostics.push({
    id: `tex-${builder.counter++}`,
    ...diagnostic,
  });
}

/** Classifies a `! ...` error and derives an actionable hint where possible. */
function classifyError(
  message: string,
  context: string,
  sourceLine?: number,
): {
  code: DiagnosticCode;
  hint?: string;
  suggestedFix?: DiagnosticSuggestedFix;
  missingPackage?: string;
  missingFile?: string;
} {
  const notFound = message.match(/File [`'"]([^`'"]+)[`'"] not found/i);
  if (notFound) {
    const target = notFound[1];
    if (/\.sty$/i.test(target)) {
      const name = target.replace(/\.sty$/i, '');
      return {
        code: 'missing-package',
        missingPackage: name,
        hint: `Package "${name}" is not in the preloaded TeX Live set. It will be fetched on demand if the remote package endpoint is reachable.`,
        suggestedFix: {
          title: `Add \\usepackage{${name}}`,
          description: `Inserts package declaration in preamble.`,
          replacement: `\\usepackage{${name}}`,
          startLine: 1,
          endLine: 1,
        },
      };
    }
    if (/\.(?:png|jpe?g|pdf|eps|svg)$/i.test(target)) {
      return {
        code: 'missing-graphic',
        missingFile: target,
        hint: `Upload "${target}" to the project, or correct the path in \\includegraphics.`,
      };
    }
    return {
      code: 'missing-file',
      missingFile: target,
      hint: `Add "${target}" to the project, or correct the path.`,
    };
  }

  if (/^Undefined control sequence/i.test(message)) {
    // TeX may append the rest of the source line after the offending macro.
    const macro = context.match(/\\[a-zA-Z@]+/);
    const macroName = macro ? macro[0] : '';
    let suggestedFix: DiagnosticSuggestedFix | undefined;

    if (macroName === '\\includegraphics') {
      suggestedFix = {
        title: 'Add \\usepackage{graphicx}',
        description: 'Loads graphicx package required for \\includegraphics.',
        replacement: '\\usepackage{graphicx}',
        startLine: 1,
        endLine: 1,
      };
    } else if (['\\align', '\\bmatrix', '\\pmatrix', '\\eqref', '\\DeclareMathOperator', '\\substack'].includes(macroName)) {
      suggestedFix = {
        title: 'Add \\usepackage{amsmath}',
        description: 'Loads amsmath package required for advanced mathematics.',
        replacement: '\\usepackage{amsmath}',
        startLine: 1,
        endLine: 1,
      };
    } else if (['\\url', '\\href', '\\hypersetup'].includes(macroName)) {
      suggestedFix = {
        title: 'Add \\usepackage{hyperref}',
        description: 'Loads hyperref package required for hyperlinks and URLs.',
        replacement: '\\usepackage{hyperref}',
        startLine: 1,
        endLine: 1,
      };
    } else if (['\\color', '\\textcolor', '\\colorbox', '\\definecolor'].includes(macroName)) {
      suggestedFix = {
        title: 'Add \\usepackage{xcolor}',
        description: 'Loads xcolor package required for color styling.',
        replacement: '\\usepackage{xcolor}',
        startLine: 1,
        endLine: 1,
      };
    } else if (['\\toprule', '\\midrule', '\\bottomrule'].includes(macroName)) {
      suggestedFix = {
        title: 'Add \\usepackage{booktabs}',
        description: 'Loads booktabs package required for publication-quality tables.',
        replacement: '\\usepackage{booktabs}',
        startLine: 1,
        endLine: 1,
      };
    }

    return {
      code: 'undefined-control-sequence',
      hint: macro
        ? `${macro[0]} is not defined. Check the spelling, or load the package that provides it.`
        : 'A command used here is not defined. Check the spelling, or load the package that provides it.',
      suggestedFix,
    };
  }

  const unknownEnv = message.match(
    /Environment ([^\s]+) undefined|\\begin\{([^}]+)\} on input line/i,
  );
  if (unknownEnv) {
    const name = unknownEnv[1] || unknownEnv[2];
    let suggestedFix: DiagnosticSuggestedFix | undefined;
    if (name === 'tabularx') {
      suggestedFix = {
        title: 'Add \\usepackage{tabularx}',
        description: 'Loads tabularx package required for flexible width tables.',
        replacement: '\\usepackage{tabularx}',
        startLine: 1,
        endLine: 1,
      };
    } else if (name === 'algorithm' || name === 'algorithmic') {
      suggestedFix = {
        title: 'Add \\usepackage{algorithm}',
        description: 'Loads algorithm package for typesetting algorithms.',
        replacement: '\\usepackage{algorithm}',
        startLine: 1,
        endLine: 1,
      };
    } else if (name === 'listing' || name === 'lstlisting') {
      suggestedFix = {
        title: 'Add \\usepackage{listings}',
        description: 'Loads listings package for source code formatting.',
        replacement: '\\usepackage{listings}',
        startLine: 1,
        endLine: 1,
      };
    } else if (['align', 'gather', 'multline', 'equation*'].includes(name)) {
      suggestedFix = {
        title: 'Add \\usepackage{amsmath}',
        description: 'Loads amsmath package for multi-line math environments.',
        replacement: '\\usepackage{amsmath}',
        startLine: 1,
        endLine: 1,
      };
    }

    return {
      code: 'undefined-environment',
      hint: `Environment "${name}" is not defined. Load the package that provides it, or define it with \\newenvironment.`,
      suggestedFix,
    };
  }

  if (/Emergency stop|Fatal error occurred|job aborted/i.test(message)) {
    return { code: 'fatal' };
  }

  if (/perhaps a missing \\item/i.test(message)) {
    return {
      code: 'syntax',
      hint: 'A list environment is missing an \\item command before text.',
      suggestedFix: sourceLine ? {
        title: 'Insert \\item',
        description: 'Adds missing \\item to list environment.',
        replacement: '\\item ',
        startLine: sourceLine,
        endLine: sourceLine,
      } : undefined,
    };
  }

  if (
    /Missing [$}{]|Extra [}$]|Misplaced|Too many \}|Paragraph ended before|Missing \\(?:begin|end)|runaway argument/i.test(
      message,
    )
  ) {
    return { code: 'syntax' };
  }

  return { code: 'other' };
}

/**
 * Parses a pdfTeX/XeTeX/LuaTeX log into structured diagnostics.
 *
 * @param log  Raw engine log.
 * @param root Project-relative path of the compiled entry file, used as the
 *             base of the file-attribution stack.
 */
export function parseTexLog(
  log: string,
  { root = 'main.tex', maxPrintLine = DEFAULT_MAX_PRINT_LINE } = {},
): TexLogParseResult {
  const lines = unwrapLogLines(log, maxPrintLine);
  const files = new FileStack(normalisePath(root));
  const builder: Builder = { diagnostics: [], counter: 0 };

  const missingPackages = new Set<string>();
  const missingFiles = new Set<string>();
  let rerunRequired = false;
  let fatal = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // --- Errors: "! message", followed by context and an l.NN excerpt -------
    if (line.startsWith('! ')) {
      const message = line.slice(2).trim();
      const rawParts = [line];
      let sourceLine: number | undefined;
      let context = '';

      // TeX emits the context within a handful of lines; `l.NN` terminates it.
      for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
        const ahead = lines[j];
        rawParts.push(ahead);

        const excerpt = ahead.match(/^l\.(\d+)\s?(.*)$/);
        if (excerpt) {
          sourceLine = Number.parseInt(excerpt[1], 10);
          context = excerpt[2];
          // The continuation line holds the text after the error point.
          if (j + 1 < lines.length && !lines[j + 1].startsWith('!')) {
            context += lines[j + 1].trimStart();
            rawParts.push(lines[j + 1]);
          }
          break;
        }
        if (ahead.startsWith('! ')) break;
      }

      const classified = classifyError(message, context, sourceLine);
      if (classified.missingPackage) missingPackages.add(classified.missingPackage);
      if (classified.missingFile) missingFiles.add(classified.missingFile);
      if (classified.code === 'fatal') fatal = true;

      push(builder, {
        severity: 'error',
        code: classified.code,
        message,
        file: files.current(),
        line: sourceLine,
        context: context.trim() || undefined,
        hint: classified.hint,
        suggestedFix: classified.suggestedFix,
        raw: rawParts.join('\n'),
      });

      files.consume(line);
      continue;
    }

    // --- "No file foo.tex." — a missing \input, which TeX only warns about --
    const noFile = line.match(/^No file ([^\s]+?)\.?$/);
    if (noFile) {
      const target = noFile[1];
      missingFiles.add(target);
      push(builder, {
        severity: 'warning',
        code: 'missing-file',
        message: `No file ${target}`,
        file: files.current(),
        hint: `TeX could not find "${target}" and skipped it. Add it to the project, or remove the reference.`,
        raw: line,
      });
      continue;
    }

    // --- LaTeX / package warnings ------------------------------------------
    const warning = line.match(
      /^(?:(LaTeX|LaTeX Font)|(?:Package|Class)\s+(\S+))\s+(?:Font\s+)?(?:Warning|Info):\s*(.*)$/,
    );
    if (warning) {
      const origin = warning[1] || warning[2] || 'LaTeX';
      let message = warning[3].trim();

      // Warnings continue on following indented lines until a blank line.
      const rawParts = [line];
      for (let j = i + 1; j < lines.length; j++) {
        const ahead = lines[j];
        if (ahead.trim() === '' || startsLogicalLine(ahead)) break;
        if (!/^\s/.test(ahead)) break;
        message += ` ${ahead.trim()}`;
        rawParts.push(ahead);
        i = j;
      }

      const onLine = message.match(/on input line (\d+)/);
      const sourceLine = onLine ? Number.parseInt(onLine[1], 10) : undefined;

      let code: DiagnosticCode = 'other';
      let hint: string | undefined;
      let suggestedFix: DiagnosticSuggestedFix | undefined;

      if (/Citation [`'"]([^`'"]+)[`'"].*undefined/i.test(message)) {
        code = 'missing-citation';
        hint = 'Run BibTeX, or check that the key exists in a .bib file included via \\bibliography.';
      } else if (/Reference [`'"]([^`'"]+)[`'"].*undefined/i.test(message)) {
        code = 'missing-reference';
        hint = 'Check the \\label spelling, or recompile — references settle on the second pass.';
      } else if (/Label [`'"]([^`'"]+)[`'"] multiply defined/i.test(message)) {
        code = 'duplicate-label';
        hint = 'Two \\label commands share a key. Rename one.';
        const labelKeyMatch = message.match(/Label [`'"]([^`'"]+)[`'"] multiply defined/i);
        const dupKey = labelKeyMatch ? labelKeyMatch[1] : '';
        if (dupKey && sourceLine) {
          suggestedFix = {
            title: `Rename duplicate label '${dupKey}'`,
            description: `Renames duplicate label to '${dupKey}-duplicate'.`,
            replacement: `\\label{${dupKey}-duplicate}`,
            startLine: sourceLine,
            endLine: sourceLine,
          };
        }
      } else if (/Rerun|Label\(s\) may have changed/i.test(message)) {
        code = 'rerun-required';
        rerunRequired = true;
      } else if (/Font shape .* (?:undefined|not available)/i.test(message)) {
        code = 'font-substitution';
        hint = 'TeX substituted a different font shape, so this text will not match the requested face.';
      }

      push(builder, {
        severity: code === 'rerun-required' ? 'info' : 'warning',
        code,
        message: origin === 'LaTeX' ? message : `[${origin}] ${message}`,
        file: files.current(),
        line: sourceLine,
        hint,
        suggestedFix,
        raw: rawParts.join('\n'),
      });
      continue;
    }

    // --- Bad boxes: the honest signal that layout did not fit --------------
    const badBox = line.match(
      /^(Overfull|Underfull)\s+\\([hv])box\s+\(([^)]*)\)(?:.*?at lines (\d+)--(\d+)|.*?in paragraph at lines (\d+)--(\d+)|.*?\[(\d+)\])?/,
    );
    if (badBox) {
      const [, kind, axis, detail, a1, a2, b1, b2] = badBox;
      const startLine = a1 ?? b1;
      const endLine = a2 ?? b2;

      push(builder, {
        severity: 'warning',
        code: kind === 'Overfull' ? 'overfull-box' : 'underfull-box',
        message: `${kind} \\${axis}box (${detail})`,
        file: files.current(),
        line: startLine ? Number.parseInt(startLine, 10) : undefined,
        endLine: endLine ? Number.parseInt(endLine, 10) : undefined,
        hint:
          kind === 'Overfull'
            ? 'Content extends past the text block. Rephrase, allow hyphenation, or resize the offending box.'
            : 'TeX stretched this line or column further than it prefers. Usually cosmetic.',
        raw: line,
      });
      continue;
    }

    // --- Missing glyphs: a font genuinely lacks the requested character ----
    const missingGlyph = line.match(
      /^Missing character: There is no (.+?) \(?U?\+?([0-9A-Fa-f]*)\)? in font (.+?)!?$/,
    );
    if (missingGlyph) {
      push(builder, {
        severity: 'warning',
        code: 'missing-glyph',
        message: `Font "${missingGlyph[3]}" has no glyph for ${missingGlyph[1]}`,
        file: files.current(),
        hint: 'This character will be absent from the output. Load a font covering it, or compile with XeLaTeX/LuaLaTeX for full Unicode coverage.',
        raw: line,
      });
      continue;
    }

    if (/no output PDF file produced/i.test(line)) {
      fatal = true;
    }

    files.consume(line);
  }

  return {
    diagnostics: builder.diagnostics,
    missingPackages: [...missingPackages],
    missingFiles: [...missingFiles],
    rerunRequired,
    fatal,
    filesRead: files.order,
  };
}
