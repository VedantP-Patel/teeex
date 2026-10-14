/**
 * Teeex — TeX engine service.
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

function extractCrossRefSig(content: string): string {
  const matches =
    content.match(
      /\\(?:label|ref|pageref|cite|nocite|bibliography|tableofcontents|listoffigures|listoftables|input|include)\*?(?:\[[^\]]*\])?\{[^}]*\}/g,
    ) || [];
  return hashString(matches.join(';'));
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

  /** Cross-reference, preamble, and mounted package tracking for fast single-pass compiles. */
  private lastAuxHashes = new Map<string, string>();
  private lastRerunRequired = new Map<string, boolean>();
  private lastDocSig = new Map<string, string>();
  private lastPreambleSig = new Map<EngineId, string>();
  private mountedPackagesByEngine = new Map<EngineId, Set<string>>();

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

      try {
        const bundled = await getBundledPackages();
        if (bundled.length > 0) {
          await runner.writeTexliveRemoteFiles(bundled);
          for (const pkg of bundled) {
            if ('filename' in pkg && typeof pkg.filename === 'string') {
              mountedSet.add(pkg.filename);
            }
          }
        }
        const misses = await getCachedMisses();
        if (misses.length > 0) {
          await runner.writeTexliveRemoteMisses(misses);
        }
      } catch {
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

    // Only scan and mount remote packages when the preamble actually changes,
    // and only write files not already mounted into the WASM worker filesystem.
    try {
      const { sig: preambleSig, preambleText } = extractPreambleSig(input.files);
      if (this.lastPreambleSig.get(engine) !== preambleSig) {
        const preloaded = await preloadDocumentPackages(preambleText, remoteEndpoint());
        const mountedSet = this.mountedPackagesByEngine.get(engine) ?? new Set<string>();
        const unmounted = preloaded.filter((pkg: any) => {
          const key = pkg.filename || pkg.path || '';
          return !key || !mountedSet.has(key);
        });

        if (unmounted.length > 0) {
          await runner.writeTexliveRemoteFiles(unmounted);
          for (const pkg of unmounted as any[]) {
            const key = pkg.filename || pkg.path || '';
            if (key) mountedSet.add(key);
          }
          this.mountedPackagesByEngine.set(engine, mountedSet);
        }
        this.lastPreambleSig.set(engine, preambleSig);
      }
    } catch {
      // Non-fatal, compiler falls back to runtime endpoint
    }

    const cacheKey = `${engine}:${entry.name}`;
    const currentSig = extractCrossRefSig(entry.content);
    const prevSig = this.lastDocSig.get(cacheKey);
    const prevAuxHash = this.lastAuxHashes.get(cacheKey);

    try {
      const tool =
        engine === 'xelatex'
          ? new XeLatex(runner, false)
          : engine === 'lualatex'
            ? new LuaLatex(runner, false)
            : new PdfLatex(runner, false);

      const engineFiles = toEngineFiles(input.files, entry.name);

      let result = await tool.compile({
        input: entry.content,
        mainTexPath: entry.name,
        additionalFiles: engineFiles,
        bibtex: input.bibtex ?? needsBibtex(input.files, entry.content),
        makeindex: input.makeindex ?? needsMakeindex(entry.content),
        rerun: false,
        remoteEndpoint: remoteEndpoint(),
      });

      let log = result.log || '';
      let parsed = parseTexLog(log, { root: entry.name });

      // Skip second pass if a newer compile is already waiting in the queue!
      const needsFollowUp =
        !this.queued &&
        parsed.rerunRequired &&
        (!prevAuxHash || currentSig !== prevSig) &&
        Boolean(result.pdf && result.pdf.byteLength > 0);

      if (needsFollowUp) {
        const followUp = await tool.compile({
          input: entry.content,
          mainTexPath: entry.name,
          additionalFiles: engineFiles,
          bibtex: false,
          makeindex: false,
          rerun: false,
          remoteEndpoint: remoteEndpoint(),
        });
        if (followUp.pdf && followUp.pdf.byteLength > 0) {
          result = followUp;
          log = result.log || '';
          parsed = parseTexLog(log, { root: entry.name });
        }
      }

      this.lastDocSig.set(cacheKey, currentSig);
      this.lastRerunRequired.set(cacheKey, parsed.rerunRequired);
      const finalLog = result.logs?.[result.logs.length - 1];
      if (finalLog?.aux) {
        this.lastAuxHashes.set(cacheKey, hashString(finalLog.aux));
      }

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

  terminate(): void {
    for (const runner of this.runners.values()) runner.terminate();
    this.runners.clear();
    this.initPromises.clear();
    this.lastAuxHashes.clear();
    this.lastRerunRequired.clear();
    this.lastDocSig.clear();
    this.lastPreambleSig.clear();
    this.mountedPackagesByEngine.clear();
    this.setStatus({ phase: 'idle', progress: 0 });
  }
}

export const texEngine = new TexEngineService();