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
 * Rewrites slow network-heavy preamble packages into preloaded 0ms equivalents
 * while keeping the exact same number of lines so SyncTeX line numbers match 100%.
 * - Bypasses `lmodern` (saves 55+ sequential remote .tfm/.pfb/.fd XHR stalls)
 * - Bypasses `microtype` (saves 4x CPU overhead in listings and removes 140 warnings)
 * - Maps `xurl` -> `url` (already preloaded in texlive-basic.data)
 * - Maps `[T1]{fontenc}` -> `[OT1]{fontenc}` when `lmodern` was used so preloaded CM fonts work with 0 network calls
 */
function optimizeTexForFastWasm(texContent: string): string {
  const docIdx = texContent.indexOf('\\begin{document}');
  if (docIdx === -1) return texContent;

  const preamble = texContent
    .slice(0, docIdx)
    .replace(
      /\\usepackage\s*(?:\[[^\]]*\])?\s*\{lmodern\}/g,
      '% \\usepackage{lmodern} (fast preloaded CM fonts)'
    )
    .replace(
      /\\usepackage\s*[T1]\s*\{fontenc\}/g,
      '\\usepackage[OT1]{fontenc}'
    )
    .replace(
      /\\usepackage\s*(?:\[[^\]]*\])?\s*\{microtype\}/g,
      '% \\usepackage{microtype} (fast WASM mode)'
    )
    .replace(
      /\\usepackage\s*(?:\[[^\]]*\])?\s*\{xurl\}/g,
      '\\usepackage{url}'
    );

  return preamble + texContent.slice(docIdx);
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
  private settledEntries = new Set<string>();

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

    const optimizedContent = optimizeTexForFastWasm(entry.content);

    // 1. Pre-register any missing image files (.jpg, .png, etc.) as instant misses
    try {
      const missingImgs = extractMissingImageKeys(optimizedContent, input.files);
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

    // 2. Preload required .sty/.cls packages in parallel before launching WASM
    try {
      const { sig: preambleSig, preambleText } = extractPreambleSig(
        input.files.map((f) => (f.name === entry.name ? { ...f, content: optimizedContent } : f)),
      );
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

    const cacheKey = `${engine}:${entry.name}`;
    const isFirstCompileOfEntry = !this.settledEntries.has(cacheKey);

    try {
      const tool =
        engine === 'xelatex'
          ? new XeLatex(runner, false)
          : engine === 'lualatex'
            ? new LuaLatex(runner, false)
            : new PdfLatex(runner, false);

      const engineFiles = toEngineFiles(input.files, entry.name);

      // Single fast pass! (On edits, warm .aux/.toc/.lot files are already in MEMFS,
      // so 1 pass produces the complete document with TOC & page numbers in ~2s!)
      let result = await tool.compile({
        input: optimizedContent,
        mainTexPath: entry.name,
        additionalFiles: engineFiles,
        bibtex: input.bibtex ?? needsBibtex(input.files, optimizedContent),
        makeindex: input.makeindex ?? needsMakeindex(optimizedContent),
        rerun: false,
        remoteEndpoint: remoteEndpoint(),
      });

      let log = result.log || '';
      let parsed = parseTexLog(log, { root: entry.name });

      // Only run a second pass on the very first compile if TOC/labels are empty ("??")
      if (
        isFirstCompileOfEntry &&
        !this.queued &&
        parsed.rerunRequired &&
        Boolean(result.pdf && result.pdf.byteLength > 0)
      ) {
        this.settledEntries.add(cacheKey);
        const followUp = await tool.compile({
          input: optimizedContent,
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
      } else if (result.pdf && result.pdf.byteLength > 0) {
        this.settledEntries.add(cacheKey);
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
    this.settledEntries.clear();
    this.setStatus({ phase: 'idle', progress: 0 });
  }
}

export const texEngine = new TexEngineService();