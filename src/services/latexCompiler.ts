/**
 * Teeex — High-Speed TeX Engine Service with Instant Pass-1 Streaming.
 */

import { BusyTexRunner, LuaLatex, PdfLatex, XeLatex } from 'texlyre-busytex';
import type { BusyTexConfig } from 'texlyre-busytex';
import type { CompileMode, ProjectFile } from '../types/latex';
import {
  computeCitationSignature,
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
import { saveCompiledPdfSnapshot } from './pdfSnapshotCache';
import {
  loadAuxiliaryArtifacts,
  saveAuxiliaryArtifacts,
  type AuxiliaryFileEntry,
} from './auxiliaryCache';

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
  loadedBytes?: number;
  totalBytes?: number;
  speedMbps?: number;
}

export interface CompileInput {
  files: ProjectFile[];
  engine?: EngineId;
  entryPath?: string;
  bibtex?: boolean;
  makeindex?: boolean;
  projectId?: string;
  compileMode?: CompileMode;
  citations?: string[];
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
  compileMode?: CompileMode;
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

import {
  DUMMY_1X1_PNG,
  DUMMY_1X1_JPG,
  DUMMY_1X1_PDF,
  extractReferencedImages,
  getPlaceholderGraphicBytes,
  isGraphicFilename,
} from './placeholderGraphics';

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
  const allReferenced = extractReferencedImages(texContent);
  for (const imgName of allReferenced) {
    const base = imgName.slice(imgName.lastIndexOf('/') + 1);
    if (!existingNames.has(imgName) && !existingNames.has(base)) {
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
  private lastBibSignature = new Map<string, string>();
  private hasSettledBbl = new Map<string, boolean>();
  private loadedAuxProjects = new Set<string>();

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
    const ESTIMATED_TOTAL_BYTES = 127_694_000; // ~121.8 MB uncompressed engine + basic data
    const downloadStartTime = Date.now();

    this.setStatus({
      phase: 'fetching',
      progress: 0,
      engine,
      loadedBytes: 0,
      totalBytes: ESTIMATED_TOTAL_BYTES,
      speedMbps: 0,
    });

    const config: BusyTexConfig = {
      busytexBasePath: ENGINE_BASE_PATH,
      engineMode: 'combined',
      verbose: false,
      preloadDataPackages: [
        `${ENGINE_BASE_PATH}/texlive-basic.js`,
      ],
      catalogDataPackages: [],
      onDownloadProgress: ({ percent }) => {
        const clampedPercent = Math.max(0, Math.min(100, percent));
        const loadedBytes = Math.round((clampedPercent / 100) * ESTIMATED_TOTAL_BYTES);
        const elapsedSec = Math.max(0.1, (Date.now() - downloadStartTime) / 1000);
        const speedMbps = Number(((loadedBytes / elapsedSec) / (1024 * 1024)).toFixed(1));

        this.setStatus({
          phase: 'fetching',
          progress: clampedPercent,
          engine,
          loadedBytes,
          totalBytes: ESTIMATED_TOTAL_BYTES,
          speedMbps,
        });
      },
    };

    try {
      const runner = new BusyTexRunner(config);
      await runner.initialize(true);

      this.setStatus({
        phase: 'ready',
        progress: 100,
        engine,
        loadedBytes: ESTIMATED_TOTAL_BYTES,
        totalBytes: ESTIMATED_TOTAL_BYTES,
      });

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
     * Older versions ran the source through preamble rewrites, which
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
      const projectKey = input.projectId ?? 'default';

      // Repair any existing engineFiles image entry that is empty or corrupted (e.g. unpopulated dataUrl)
      for (const ef of engineFiles) {
        if (isGraphicFilename(ef.path)) {
          const isEmpty =
            typeof ef.content === 'string'
              ? ef.content.length === 0
              : !ef.content || ef.content.byteLength === 0;
          if (isEmpty) {
            ef.content = getPlaceholderGraphicBytes(ef.path);
          }
        }
      }

      // Synthesize lightweight placeholder graphics for missing image files to prevent pdfTeX fatal halting
      const existingFileNames = new Set<string>();
      for (const f of input.files) {
        existingFileNames.add(f.name);
        existingFileNames.add(f.name.replace(/^\/+/, ''));
        existingFileNames.add(f.name.replace(/^\.\//, ''));
        existingFileNames.add(f.name.slice(f.name.lastIndexOf('/') + 1));
      }
      for (const ef of engineFiles) {
        existingFileNames.add(ef.path);
        existingFileNames.add(ef.path.replace(/^\/+/, ''));
        existingFileNames.add(ef.path.replace(/^\.\//, ''));
        existingFileNames.add(ef.path.slice(ef.path.lastIndexOf('/') + 1));
      }

      // Scan all documents in project, not just root entry
      const allDocContent = input.files
        .filter((f) => f.name.endsWith('.tex') || f.name.endsWith('.cls') || f.name.endsWith('.sty'))
        .map((f) => f.content)
        .join('\n');
      const referencedImages = extractReferencedImages(allDocContent || source);

      for (const imgName of referencedImages) {
        const baseName = imgName.slice(imgName.lastIndexOf('/') + 1);
        const cleanName = imgName.replace(/^\.\//, '');
        if (!existingFileNames.has(imgName) && !existingFileNames.has(cleanName) && !existingFileNames.has(baseName)) {
          const placeholderBytes = getPlaceholderGraphicBytes(imgName);
          engineFiles.push({ path: imgName, content: placeholderBytes });
          if (!imgName.startsWith('./') && !imgName.startsWith('/')) {
            engineFiles.push({ path: `./${imgName}`, content: placeholderBytes });
          }
          if (baseName !== imgName) {
            engineFiles.push({ path: baseName, content: placeholderBytes });
            engineFiles.push({ path: `./${baseName}`, content: placeholderBytes });
          }
          // Also provide common image extensions if referenced without extension
          if (!imgName.includes('.')) {
            engineFiles.push({ path: `${imgName}.png`, content: DUMMY_1X1_PNG });
            engineFiles.push({ path: `./${imgName}.png`, content: DUMMY_1X1_PNG });
            engineFiles.push({ path: `${imgName}.jpg`, content: DUMMY_1X1_JPG });
            engineFiles.push({ path: `./${imgName}.jpg`, content: DUMMY_1X1_JPG });
            engineFiles.push({ path: `${imgName}.pdf`, content: DUMMY_1X1_PDF });
            engineFiles.push({ path: `./${imgName}.pdf`, content: DUMMY_1X1_PDF });
          }
        }
      }

      // Layer 5: Pre-mount warm auxiliary files from IndexedDB into MEMFS before Pass 1
      if (input.projectId && !this.loadedAuxProjects.has(input.projectId)) {
        try {
          const cachedAux = await loadAuxiliaryArtifacts(input.projectId);
          if (cachedAux.length > 0) {
            for (const aux of cachedAux) {
              if (!engineFiles.some((ef) => ef.path === aux.path)) {
                engineFiles.push({
                  path: aux.path,
                  content: aux.content,
                });
                if (aux.path.toLowerCase().endsWith('.bbl')) {
                  this.hasSettledBbl.set(projectKey, true);
                }
              }
            }
          }
          this.loadedAuxProjects.add(input.projectId);
        } catch {
          // Non-fatal
        }
      }

      // Layer 7: Exact BibTeX avoidance via citation AST hashing
      let bibtexNeeded = input.bibtex ?? needsBibtex(input.files, source);
      if (bibtexNeeded) {
        const bibSig = computeCitationSignature(input.files, input.citations);
        const prevSig = this.lastBibSignature.get(projectKey);
        const settled = this.hasSettledBbl.get(projectKey);

        if (settled && prevSig === bibSig) {
          // Bibliography content and citations are unchanged; reuse existing .bbl
          bibtexNeeded = false;
        } else {
          this.lastBibSignature.set(projectKey, bibSig);
        }
      }

      let result = await tool.compile({
        input: source,
        mainTexPath: entry.name,
        additionalFiles: engineFiles,
        bibtex: bibtexNeeded,
        makeindex: input.makeindex ?? needsMakeindex(source),
        rerun: false,
        remoteEndpoint: remoteEndpoint(),
      });

      let log = result.log || '';
      let parsed = parseTexLog(log, { root: entry.name });
      let passes = 1;

      // Layer 8: Two-pass ceiling in 'fast' preview mode vs three-pass in 'publication' mode
      const maxPasses = input.compileMode === 'publication' ? MAX_COMPILE_PASSES : 2;

      /**
       * Re-run while the log says cross-references are unresolved.
       */
      while (
        parsed.rerunRequired &&
        passes < maxPasses &&
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

      // Layer 1 & 5: Persist PDF snapshot and auxiliary artifacts to IndexedDB
      if (pdf && input.projectId) {
        void saveCompiledPdfSnapshot(input.projectId, pdf).catch(() => {});

        void (async () => {
          try {
            const memfsFiles = await runner.readProjectFiles();
            const auxExtensions = ['.aux', '.bbl', '.toc', '.out', '.lot', '.lof', '.idx'];
            const auxToSave: AuxiliaryFileEntry[] = [];
            for (const f of memfsFiles) {
              const lower = f.path.toLowerCase();
              if (auxExtensions.some((ext) => lower.endsWith(ext))) {
                const textContent =
                  typeof f.content === 'string'
                    ? f.content
                    : new TextDecoder().decode(f.content);
                auxToSave.push({ path: f.path, content: textContent });
                if (lower.endsWith('.bbl')) {
                  this.hasSettledBbl.set(projectKey, true);
                }
              }
            }
            if (auxToSave.length > 0) {
              await saveAuxiliaryArtifacts(input.projectId!, auxToSave);
            }
          } catch {
            // Non-fatal
          }
        })();
      }

      this.setStatus({ phase: 'ready', engine });

      return {
        ok: Boolean(pdf) && !parsed.fatal,
        pdf,
        synctex: result.synctex && result.synctex.byteLength > 0 ? result.synctex : null,
        log,
        // Filter out harmless TeX Info messages that were masquerading as warnings
        diagnostics: parsed.diagnostics.filter((d) => {
          if (d.severity === 'error') return true;
          if (d.code === 'other') {
            const raw = d.raw || '';
            const msg = d.message || '';
            if (
              raw.includes('Info:') ||
              msg.includes('Info:') ||
              msg.includes('Overwriting symbol font') ||
              msg.includes('Overwriting math alphabet') ||
              msg.includes('Checking defaults for') ||
              msg.includes('Redeclaring font encoding') ||
              msg.includes('Redeclaring math alphabet') ||
              msg.includes('Model `') ||
              msg.startsWith('Redefining \\') ||
              raw.includes('Loading configuration file') ||
              raw.includes('Applying patch')
            ) {
              return false;
            }
          }
          return true;
        }),
        missingPackages: parsed.missingPackages,
        rerunRequired: parsed.rerunRequired,
        entryPath: entry.name,
        engine,
        durationMs: Math.round(performance.now() - started),
        requestId,
        superseded: false,
        compileMode: input.compileMode ?? 'fast',
      };
    } catch (cause) {
      this.setStatus({ phase: 'ready', engine });
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.includes('supported_drivers') || message.includes("reading 'includes'")) {
        if (typeof caches !== 'undefined') {
          void caches.open('teeex-engine-v1.4.0').then((c) => {
            void c.delete('/core/busytex/busytex_pipeline.js');
          });
        }
        for (const r of this.runners.values()) r.terminate();
        this.runners.clear();
        this.initPromises.clear();
      }
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
    this.lastBibSignature.clear();
    this.hasSettledBbl.clear();
    this.loadedAuxProjects.clear();
    this.setStatus({ phase: 'idle', progress: 0 });
  }
}

export const texEngine = new TexEngineService();