/**
 * Teeex — High-Speed TeX Engine Service with Instant Pass-1 Streaming.
 */

import { BusyTexRunner, LuaLatex, PdfLatex, XeLatex } from 'texlyre-busytex';
import type { BusyTexConfig } from 'texlyre-busytex';
import type { ProjectFile } from '../types/latex';
import {
  needsBibtex,
  needsMakeindex,
  resolveEntryFile,
  toEngineFiles,
} from './texProject';
import { parseTexLog, type CompileDiagnostic } from './texLog';
import {
  getBundledPackages,
  getCachedMisses,
  preloadDocumentPackages,
} from './bundledPackages';

export { resolveEntryFile } from './texProject';

export type EngineId = 'pdflatex' | 'xelatex' | 'lualatex';

export type EnginePhase =
  | 'idle'
  | 'fetching'
  | 'ready'
  | 'compiling'
  | 'failed';

export interface EngineStatus {
  phase: EnginePhase;
  progress: number;
  engine: EngineId;
  error?: string;
}

export interface CompileInput {
  files: ProjectFile[];
  engine?: EngineId;
  entryPath?: string;
  bibtex?: boolean;
  makeindex?: boolean;
}

export interface CompileOutcome {
  ok: boolean;
  pdf: Uint8Array | null;
  synctex: Uint8Array | null;
  log: string;
  diagnostics: CompileDiagnostic[];
  missingPackages: string[];
  rerunRequired: boolean;
  entryPath: string;
  engine: EngineId;
  durationMs: number;
  requestId: number;
  superseded: boolean;
}

const ENGINE_BASE_PATH = '/core/busytex';
const DEFAULT_REMOTE_ENDPOINT = 'https://texlive2026.texlyre.org';

/**
 * Upper bound on passes per compile (one initial + reruns). LaTeX resolves most
 * cross-reference work in two passes; a third covers a table of contents that
 * shifts pagination. Beyond that a document is either unstable or pathological,
 * and spending more passes costs seconds without converging.
 */
const MAX_COMPILE_PASSES = 3;

function remoteEndpoint(): string | undefined {
  const configured = import.meta.env.VITE_TEXLIVE_REMOTE_ENDPOINT;
  if (configured === 'off') return undefined;
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/texlive`;
  }
  return DEFAULT_REMOTE_ENDPOINT;
}

function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Finds all image filenames referenced in the document that are not present in `files`,
 * so we can pre-register them as kpathsea misses and avoid 404 network roundtrips.
 */
function extractMissingImageKeys(texContent: string, files: ProjectFile[]): string[] {
  const existingNames = new Set<string>();
  for (const f of files) {
    existingNames.add(f.name);
    const base = f.name.slice(f.name.lastIndexOf('/') + 1);
    existingNames.add(base);
  }

  const misses = new Set<string>();
  const imgRegex = /\{([a-zA-Z0-9_./-]+\.(?:jpe?g|png|gif|svg|eps|pdf))\}/gi;
  for (const match of texContent.matchAll(imgRegex)) {
    const imgName = match[1];
    if (imgName && !existingNames.has(imgName)) {
      misses.add(imgName);
      misses.add(`26/${imgName}`);
      misses.add(`39/${imgName}`);
      misses.add(`0/${imgName}`);
    }
  }
  return Array.from(misses);
}

function extractPreambleSig(files: ProjectFile[]): { sig: string; preambleText: string } {
  const chunks: string[] = [];
  for (const f of files) {
    if (f.name.endsWith('.tex') || f.name.endsWith('.cls') || f.name.endsWith('.sty')) {
      const idx = f.content.indexOf('\\begin{document}');
      chunks.push(idx !== -1 ? f.content.slice(0, idx) : f.content);
    }
  }
  const preambleText = chunks.join('\n');
  return { sig: hashString(preambleText), preambleText };
}

interface QueuedRequest {
  input: CompileInput;
  requestId: number;
  resolve: (outcome: CompileOutcome) => void;
}

export class TexEngineService {
  private runners = new Map<EngineId, BusyTexRunner>();
  private initPromises = new Map<EngineId, Promise<BusyTexRunner>>();

  private status: EngineStatus = { phase: 'idle', progress: 0, engine: 'pdflatex' };
  private listeners = new Set<(status: EngineStatus) => void>();

  private inFlight: Promise<CompileOutcome> | null = null;
  private queued: QueuedRequest | null = null;
  private nextRequestId = 1;

  private lastPreambleSig = new Map<EngineId, string>();
  private mountedPackagesByEngine = new Map<EngineId, Set<string>>();
  private registeredMissesByEngine = new Map<EngineId, Set<string>>();

  subscribe(listener: (status: EngineStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  private setStatus(next: Partial<EngineStatus>): void {
    this.status = { ...this.status, ...next };
    if (next.phase && next.phase !== 'failed') {
      this.status = { ...this.status, error: undefined };
    }
    for (const listener of this.listeners) listener(this.status);
  }

  prewarm(engine: EngineId = 'pdflatex'): void {
    if (typeof window !== 'undefined') {
      void getBundledPackages().catch(() => { });
    }
    void this.ensureRunner(engine).catch(() => { });
  }

  private async ensureRunner(engine: EngineId): Promise<BusyTexRunner> {
    const existing = this.runners.get(engine);
    if (existing?.isInitialized()) return existing;

    const pending = this.initPromises.get(engine);
    if (pending) return pending;

    const promise = this.initialiseRunner(engine);
    this.initPromises.set(engine, promise);

    try {
      return await promise;
    } catch (error) {
      this.initPromises.delete(engine);
      throw error;
    }
  }

  private async initialiseRunner(engine: EngineId): Promise<BusyTexRunner> {
    this.setStatus({ phase: 'fetching', progress: 0, engine });

    const config: BusyTexConfig = {
      busytexBasePath: ENGINE_BASE_PATH,
      engineMode: 'combined',
      verbose: false,
      preloadDataPackages: [
        `${ENGINE_BASE_PATH}/texlive-basic.js`,
      ],
      catalogDataPackages: [],
      onDownloadProgress: ({ percent }) => {
        this.setStatus({
          phase: 'fetching',
          progress: Math.max(0, Math.min(100, percent)),
          engine,
        });
      },
    };

    try {
      const runner = new BusyTexRunner(config);
      await runner.initialize(true);

      const mountedSet = new Set<string>();
      this.mountedPackagesByEngine.set(engine, mountedSet);
      const missesSet = new Set<string>();
      this.registeredMissesByEngine.set(engine, missesSet);

      try {
        const bundled = await getBundledPackages();
        if (bundled.length > 0) {
          await runner.writeTexliveRemoteFiles(bundled);
          for (const pkg of bundled) {
            if (pkg.name) mountedSet.add(pkg.name);
          }
        }
        const misses = await getCachedMisses();
        if (misses.length > 0) {
          await runner.writeTexliveRemoteMisses(misses);
          for (const m of misses) missesSet.add(m);
        }
      } catch {
        // Non-fatal
      }

      this.runners.set(engine, runner);
      this.setStatus({ phase: 'ready', progress: 100, engine });
      return runner;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.setStatus({
        phase: 'failed',
        engine,
        error:
          `Could not start the ${engine} engine: ${message}. ` +
          `Engine assets are expected at ${ENGINE_BASE_PATH} — run "node scripts/fetch-engine.mjs".`,
      });
      throw cause;
    }
  }

  compile(input: CompileInput): Promise<CompileOutcome> {
    const requestId = this.nextRequestId++;

    if (!this.inFlight) {
      const run = this.run(input, requestId).finally(() => {
        this.inFlight = null;
        this.drainQueue();
      });
      this.inFlight = run;
      return run;
    }

    if (this.queued) {
      this.queued.resolve(this.supersededOutcome(input, this.queued.requestId));
    }

    return new Promise<CompileOutcome>((resolve) => {
      this.queued = { input, requestId, resolve };
    });
  }

  private drainQueue(): void {
    const next = this.queued;
    if (!next) return;
    this.queued = null;

    const run = this.run(next.input, next.requestId).finally(() => {
      this.inFlight = null;
      this.drainQueue();
    });
    this.inFlight = run;
    run.then(next.resolve, () =>
      next.resolve(this.supersededOutcome(next.input, next.requestId)),
    );
  }

  private supersededOutcome(input: CompileInput, requestId: number): CompileOutcome {
    return {
      ok: false,
      pdf: null,
      synctex: null,
      log: '',
      diagnostics: [],
      missingPackages: [],
      rerunRequired: false,
      entryPath: input.entryPath ?? '',
      engine: input.engine ?? 'pdflatex',
      durationMs: 0,
      requestId,
      superseded: true,
    };
  }

  private async run(input: CompileInput, requestId: number): Promise<CompileOutcome> {
    const started = performance.now();
    const engine = input.engine ?? 'pdflatex';

    const entry = input.entryPath
      ? input.files.find((file) => file.name === input.entryPath) ?? null
      : resolveEntryFile(input.files);

    if (!entry) {
      return {
        ok: false,
        pdf: null,
        synctex: null,
        log: '',
        diagnostics: [
          {
            id: 'no-entry',
            severity: 'error',
            code: 'fatal',
            message: 'No .tex file to compile.',
            hint: 'Add a .tex file containing \\documentclass, or mark one as the project entry point.',
            raw: '',
          },
        ],
        missingPackages: [],
        rerunRequired: false,
        entryPath: '',
        engine,
        durationMs: Math.round(performance.now() - started),
        requestId,
        superseded: false,
      };
    }

    const failure = (
      message: string,
      hint?: string,
      log = '',
    ): CompileOutcome => ({
      ok: false,
      pdf: null,
      synctex: null,
      log,
      diagnostics: [
        {
          id: 'engine-failure',
          severity: 'error',
          code: 'fatal',
          message,
          hint,
          raw: log,
        },
      ],
      missingPackages: [],
      rerunRequired: false,
      entryPath: entry.name,
      engine,
      durationMs: Math.round(performance.now() - started),
      requestId,
      superseded: false,
    });

    let runner: BusyTexRunner;
    try {
      runner = await this.ensureRunner(engine);
    } catch (cause) {
      return failure(
        `The ${engine} engine is unavailable.`,
        cause instanceof Error ? cause.message : String(cause),
      );
    }

    this.setStatus({ phase: 'compiling', engine });

    /**
     * The document is compiled exactly as written.
     *
     * This used to run the source through `optimizeTexForFastWasm()`, which
     * commented out `\usepackage{lmodern}` and `{microtype}` and rewrote `xurl`
     * to `url` before handing it to the engine. It was fast — `microtype` pulls
     * a lot of files, and each one arrived as a separate synchronous XHR from
     * inside the WASM worker — but it meant the PDF used different fonts and
     * different line breaking from the document the user wrote, with nothing in
     * the UI saying so. A preview that is not the document is not a preview.
     *
     * The latency it was hiding is addressed where it actually lives: step 2
     * resolves the preamble's full dependency closure in parallel and mounts it
     * before the engine starts, so those files are already in MEMFS.
     */
    const source = entry.content;

    // 1. Pre-register any missing image files (.jpg, .png, etc.) as instant misses.
    //    This does not alter the document — it tells kpathsea up front that a
    //    file it will ask for is absent, instead of paying a 404 round-trip.
    try {
      const missingImgs = extractMissingImageKeys(source, input.files);
      const missesSet = this.registeredMissesByEngine.get(engine) ?? new Set<string>();
      const newMisses = missingImgs.filter((k) => !missesSet.has(k));
      if (newMisses.length > 0) {
        await runner.writeTexliveRemoteMisses(newMisses);
        for (const m of newMisses) missesSet.add(m);
        this.registeredMissesByEngine.set(engine, missesSet);
      }
    } catch {
      // Non-fatal
    }

    // 2. Preload the preamble's package dependency closure in parallel before
    //    launching WASM.
    try {
      const { sig: preambleSig, preambleText } = extractPreambleSig(input.files);
      if (this.lastPreambleSig.get(engine) !== preambleSig) {
        const preloaded = await preloadDocumentPackages(preambleText, remoteEndpoint());
        const mountedSet = this.mountedPackagesByEngine.get(engine) ?? new Set<string>();
        const unmounted = preloaded.filter((pkg) => !mountedSet.has(pkg.name));

        if (unmounted.length > 0) {
          await runner.writeTexliveRemoteFiles(unmounted);
          for (const pkg of unmounted) {
            if (pkg.name) mountedSet.add(pkg.name);
          }
          this.mountedPackagesByEngine.set(engine, mountedSet);
        }
        this.lastPreambleSig.set(engine, preambleSig);
      }
    } catch {
      // Non-fatal
    }

    try {
      const tool =
        engine === 'xelatex'
          ? new XeLatex(runner, false)
          : engine === 'lualatex'
            ? new LuaLatex(runner, false)
            : new PdfLatex(runner, false);

      const engineFiles = toEngineFiles(input.files, entry.name);

      let result = await tool.compile({
        input: source,
        mainTexPath: entry.name,
        additionalFiles: engineFiles,
        bibtex: input.bibtex ?? needsBibtex(input.files, source),
        makeindex: input.makeindex ?? needsMakeindex(source),
        rerun: false,
        remoteEndpoint: remoteEndpoint(),
      });

      let log = result.log || '';
      let parsed = parseTexLog(log, { root: entry.name });
      let passes = 1;

      /**
       * Re-run while the log says cross-references are unresolved.
       *
       * Warm `.aux`/`.toc` files survive in MEMFS between compiles, so a single
       * pass is usually enough on an edit — but only because the *previous*
       * compile left them there. The old code recorded an entry as "settled"
       * before its follow-up pass had even run and then ignored
       * `rerunRequired` for every later compile, so adding a `\label` left
       * `\ref` showing `??` until something else happened to trigger a second
       * pass. Honouring the log every time costs a pass only when TeX says one
       * is needed.
       *
       * Capped, because a document can ask for a rerun forever (an unstable
       * `\pageref`, or a package that rewrites its own aux file each pass).
       * When the cap is hit, `rerunRequired` stays true in the outcome so the
       * UI can say the references may be a pass behind rather than implying
       * the output is final.
       */
      while (
        parsed.rerunRequired &&
        passes < MAX_COMPILE_PASSES &&
        // A newer edit is waiting: stop burning passes on output nobody will see.
        !this.queued &&
        result.pdf &&
        result.pdf.byteLength > 0
      ) {
        const followUp = await tool.compile({
          input: source,
          mainTexPath: entry.name,
          additionalFiles: engineFiles,
          // Bibliography and index tools ran on the first pass; re-running them
          // here would redo their work without new input.
          bibtex: false,
          makeindex: false,
          rerun: false,
          remoteEndpoint: remoteEndpoint(),
        });
        passes++;

        // Keep the last pass that produced a PDF: a later pass that fails is
        // not a reason to show nothing.
        if (!followUp.pdf || followUp.pdf.byteLength === 0) break;

        result = followUp;
        log = result.log || '';
        parsed = parseTexLog(log, { root: entry.name });
      }

      const pdf = result.pdf && result.pdf.byteLength > 0 ? result.pdf : null;

      this.setStatus({ phase: 'ready', engine });

      return {
        ok: Boolean(pdf) && !parsed.fatal,
        pdf,
        synctex: result.synctex && result.synctex.byteLength > 0 ? result.synctex : null,
        log,
        // Filter out harmless LaTeX Info messages that were masquerading as warnings
        diagnostics: parsed.diagnostics.filter(
          (d) => !d.raw?.includes('LaTeX Info:') && !d.message.startsWith('Redefining \\')
        ),
        missingPackages: parsed.missingPackages,
        rerunRequired: parsed.rerunRequired,
        entryPath: entry.name,
        engine,
        durationMs: Math.round(performance.now() - started),
        requestId,
        superseded: false,
      };
    } catch (cause) {
      this.setStatus({ phase: 'ready', engine });
      const message = cause instanceof Error ? cause.message : String(cause);
      return failure(`Compilation could not be completed: ${message}`);
    }
  }

  terminate(): void {
    for (const runner of this.runners.values()) runner.terminate();
    this.runners.clear();
    this.initPromises.clear();
    this.lastPreambleSig.clear();
    this.mountedPackagesByEngine.clear();
    this.registeredMissesByEngine.clear();
    this.setStatus({ phase: 'idle', progress: 0 });
  }
}

export const texEngine = new TexEngineService();