/**
 * Teeex — TeX engine service.
 *
 * This is the single authoritative layout engine. Nothing else in the
 * application computes page geometry, line breaks, or pagination: the preview
 * renders the PDF this service produces, and export ships those same bytes.
 * Preview/PDF divergence is therefore structurally impossible rather than
 * something to be tuned down.
 *
 * Responsibilities:
 *   - own the WASM engine lifecycle and report it as an explicit state machine
 *   - mount the project (including binary assets) into the engine filesystem
 *   - compile the project *entry* file, never whichever file happens to be open
 *   - serialise compiles, coalesce superseded requests, and tag results so
 *     consumers can discard stale ones
 *   - resolve packages outside the preloaded set on demand
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
import { getBundledPackages } from './bundledPackages';

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
  /** Download completion, 0–100. Only meaningful while `phase === 'fetching'`. */
  progress: number;
  engine: EngineId;
  /** Present only while `phase === 'failed'`. */
  error?: string;
}

export interface CompileInput {
  files: ProjectFile[];
  engine?: EngineId;
  /** Overrides automatic entry detection. */
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
  /**
   * True when a newer request displaced this one before it ran. The result
   * carries no output and should be ignored rather than surfaced as a failure.
   */
  superseded: boolean;
}

const ENGINE_BASE_PATH = '/core/busytex';

/**
 * TeX Live 2026 package server implementing busytex's
 * `GET /<format_id>/<filename>` contract. Anything outside the preloaded
 * `texlive-basic` set resolves through here at compile time, which is what
 * makes broad \usepackage support real rather than claimed.
 *
 * Self-hostable (see texlyre-busytex-build/texlive-server); override with
 * VITE_TEXLIVE_REMOTE_ENDPOINT to avoid the third-party dependency.
 */
const DEFAULT_REMOTE_ENDPOINT = 'https://texlive2026.texlyre.org';

function remoteEndpoint(): string | undefined {
  const configured = import.meta.env.VITE_TEXLIVE_REMOTE_ENDPOINT;
  if (configured === 'off') return undefined;
  if (configured) return configured.replace(/\/+$/, '');
  // Route through Cloudflare Pages edge proxy for 1-year immutable caching,
  // 404 negative caching, same-origin HTTP/2, and zero WAN latency
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/texlive`;
  }
  return DEFAULT_REMOTE_ENDPOINT;
}

interface QueuedRequest {
  input: CompileInput;
  requestId: number;
  resolve: (outcome: CompileOutcome) => void;
}

export class TexEngineService {
  /** One runner per engine binary; each is fetched only when first used. */
  private runners = new Map<EngineId, BusyTexRunner>();
  private initPromises = new Map<EngineId, Promise<BusyTexRunner>>();

  private status: EngineStatus = { phase: 'idle', progress: 0, engine: 'pdflatex' };
  private listeners = new Set<(status: EngineStatus) => void>();

  private inFlight: Promise<CompileOutcome> | null = null;
  private queued: QueuedRequest | null = null;
  private nextRequestId = 1;

  // --- status ------------------------------------------------------------

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

  // --- engine lifecycle --------------------------------------------------

  /**
   * Begins fetching an engine without compiling. Called on app start so the
   * download overlaps with the user writing their first paragraph instead of
   * blocking their first compile.
   */
  prewarm(engine: EngineId = 'pdflatex'): void {
    if (typeof window !== 'undefined') {
      void getBundledPackages().catch(() => {});
    }
    void this.ensureRunner(engine).catch(() => {
      // Surfaced through status; nothing to do here.
    });
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
      // Clear the memo so a later attempt can retry rather than replaying the
      // same rejection forever.
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
      // Only the basic TeX Live package is preloaded; everything else is
      // fetched per-file from the remote endpoint at compile time.
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
      await runner.initialize(true); // off the main thread

      // Pre-seed academic packages (IEEEtran, cite, acmart) & font metrics into WASM kpathsea
      try {
        const bundled = await getBundledPackages();
        if (bundled.length > 0) {
          await runner.writeTexliveRemoteFiles(bundled);
        }
      } catch (_bundledErr) {
        // Non-fatal, compiler will fall back to remote endpoint
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

  // --- compilation -------------------------------------------------------

  /**
   * Compiles the project.
   *
   * At most one compile runs at a time. A request arriving mid-compile becomes
   * the queued request, displacing any previously queued one — the displaced
   * promise resolves with `superseded: true` rather than hanging or erroring.
   *
   * There is deliberately no abort: busytex exposes no per-compile
   * cancellation, only worker termination, which would discard the engine's
   * warm filesystem cache. Coalescing achieves the same user-visible result
   * without that cost.
   */
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

    try {
      const tool =
        engine === 'xelatex'
          ? new XeLatex(runner, false)
          : engine === 'lualatex'
            ? new LuaLatex(runner, false)
            : new PdfLatex(runner, false);

      const result = await tool.compile({
        input: entry.content,
        mainTexPath: entry.name,
        additionalFiles: toEngineFiles(input.files, entry.name),
        bibtex: input.bibtex ?? needsBibtex(input.files, entry.content),
        makeindex: input.makeindex ?? needsMakeindex(entry.content),
        // LaTeX needs repeat passes to settle cross-references, the TOC, and
        // citation labels — the same reason Overleaf runs latexmk.
        rerun: true,
        remoteEndpoint: remoteEndpoint(),
      });

      const log = result.log || '';
      const parsed = parseTexLog(log, { root: entry.name });

      // A PDF is the only proof of success. busytex can report a zero exit code
      // while producing no output, so the artifact is the authority, not the
      // status flag.
      const pdf = result.pdf && result.pdf.byteLength > 0 ? result.pdf : null;

      this.setStatus({ phase: 'ready', engine });

      return {
        ok: Boolean(pdf) && !parsed.fatal,
        pdf,
        synctex: result.synctex && result.synctex.byteLength > 0 ? result.synctex : null,
        log,
        diagnostics: parsed.diagnostics,
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

  /** Releases every engine worker. */
  terminate(): void {
    for (const runner of this.runners.values()) runner.terminate();
    this.runners.clear();
    this.initPromises.clear();
    this.setStatus({ phase: 'idle', progress: 0 });
  }
}

export const texEngine = new TexEngineService();
