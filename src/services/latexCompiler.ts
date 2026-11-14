/**
 * Teeex — High-Speed TeX Engine Service with Instant Pass-1 Streaming & Self-Healing Packages.
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
import {
  DUMMY_1X1_PNG,
  DUMMY_1X1_JPG,
  DUMMY_1X1_PDF,
  extractReferencedImages,
  getPlaceholderGraphicBytes,
  isGraphicFilename,
} from './placeholderGraphics';

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
  onIntermediateResult?: (result: { pdf: Uint8Array; synctex?: Uint8Array | null }) => void;
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
const MAX_COMPILE_PASSES = 3;

function remoteEndpoint(): string | undefined {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return undefined;
  }
  const configured = import.meta.env.VITE_TEXLIVE_REMOTE_ENDPOINT;
  if (configured === 'off') return undefined;
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/texlive`;
  }
  return DEFAULT_REMOTE_ENDPOINT;
}

function fastFnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${str.length}:${(hash >>> 0).toString(36)}`;
}

async function sha256Hex(str: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return fastFnv1a(str);
}

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

function extractPreambleText(files: ProjectFile[]): string {
  const chunks: string[] = [];
  for (const f of files) {
    if (f.name.endsWith('.tex') || f.name.endsWith('.cls') || f.name.endsWith('.sty')) {
      const idx = f.content.indexOf('\\begin{document}');
      chunks.push(idx !== -1 ? f.content.slice(0, idx) : f.content);
    }
  }
  return chunks.join('\n');
}

async function extractAuxSignature(
  memfsFiles: Array<{ path: string; content: string | Uint8Array }>
): Promise<string> {
  for (const f of memfsFiles) {
    if (f.path.toLowerCase().endsWith('.aux')) {
      const text = typeof f.content === 'string' ? f.content : new TextDecoder().decode(f.content);
      return sha256Hex(text);
    }
  }
  return '';
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

  private lastPreambleFastSig = new Map<EngineId, string>();
  private lastPreambleSig = new Map<EngineId, string>();
  private mountedPackagesByEngine = new Map<EngineId, Set<string>>();
  private unresolvablePackages = new Set<string>();
  private registeredMissesByEngine = new Map<EngineId, Set<string>>();
  private lastBibSignature = new Map<string, string>();
  private lastAuxSignature = new Map<string, string>();
  private hasSettledBbl = new Map<string, boolean>();
  private loadedAuxProjects = new Set<string>();

  private lastInitError = new Map<EngineId, { error: Error; timestamp: number }>();

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

  async retryPrewarm(engine: EngineId = 'pdflatex'): Promise<BusyTexRunner> {
    this.lastInitError.delete(engine);
    this.initPromises.delete(engine);
    this.clearRegisteredMisses();
    return this.ensureRunner(engine);
  }

  clearRegisteredMisses(): void {
    this.lastInitError.clear();
    this.registeredMissesByEngine.clear();
    this.unresolvablePackages.clear();
    this.lastPreambleFastSig.clear();
    this.lastPreambleSig.clear();
  }

  private async ensureRunner(engine: EngineId): Promise<BusyTexRunner> {
    const existing = this.runners.get(engine);
    if (existing?.isInitialized()) return existing;

    const pending = this.initPromises.get(engine);
    if (pending) return pending;

    const lastErr = this.lastInitError.get(engine);
    if (lastErr && Date.now() - lastErr.timestamp < 15000) {
      throw lastErr.error;
    }

    const promise = this.initialiseRunner(engine);
    this.initPromises.set(engine, promise);

    try {
      const runner = await promise;
      this.lastInitError.delete(engine);
      return runner;
    } catch (error) {
      this.initPromises.delete(engine);
      this.lastInitError.set(engine, {
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: Date.now(),
      });
      throw error;
    }
  }

  private async initialiseRunner(engine: EngineId): Promise<BusyTexRunner> {
    const ESTIMATED_TOTAL_BYTES = 127_694_000;
    const downloadStartTime = Date.now();
    let lastProgressEmit = 0;

    this.setStatus({
      phase: 'fetching',
      progress: 5,
      engine,
      loadedBytes: 0,
      totalBytes: ESTIMATED_TOTAL_BYTES,
      speedMbps: 0,
    });

    const config: BusyTexConfig = {
      busytexBasePath: ENGINE_BASE_PATH,
      engineMode: 'combined',
      verbose: false,
      preloadDataPackages: [`${ENGINE_BASE_PATH}/texlive-basic.js`],
      catalogDataPackages: [],
      onDownloadProgress: ({ percent }) => {
        const now = performance.now();
        if (percent < 100 && now - lastProgressEmit < 80) return;
        lastProgressEmit = now;

        const clampedPercent = Math.max(0, Math.min(100, percent));
        const loadedBytes = Math.round((clampedPercent / 100) * ESTIMATED_TOTAL_BYTES);
        const elapsedSec = Math.max(0.1, (Date.now() - downloadStartTime) / 1000);
        const speedMbps = Number((loadedBytes / elapsedSec / (1024 * 1024)).toFixed(1));

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

      this.runners.set(engine, runner);

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

      this.setStatus({
        phase: 'ready',
        progress: 100,
        engine,
        loadedBytes: ESTIMATED_TOTAL_BYTES,
        totalBytes: ESTIMATED_TOTAL_BYTES,
      });
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
      next.resolve(this.supersededOutcome(next.input, next.requestId))
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

  private async resolveAndMountPackages(
    runner: BusyTexRunner,
    engine: EngineId,
    preambleText: string
  ): Promise<number> {
    const endpoint = remoteEndpoint();
    const preloaded = await preloadDocumentPackages(preambleText, endpoint);
    const mountedSet = this.mountedPackagesByEngine.get(engine) ?? new Set<string>();
    const unmounted = preloaded.filter((pkg) => !mountedSet.has(pkg.name));

    if (unmounted.length > 0) {
      await runner.writeTexliveRemoteFiles(unmounted);
      for (const pkg of unmounted) {
        if (pkg.name) mountedSet.add(pkg.name);
      }
      this.mountedPackagesByEngine.set(engine, mountedSet);
    }
    return unmounted.length;
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

    const failure = (message: string, hint?: string, log = ''): CompileOutcome => ({
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
        cause instanceof Error ? cause.message : String(cause)
      );
    }

    this.setStatus({ phase: 'compiling', engine });
    const source = entry.content;

    // 1. Pre-register missing image files as instant kpathsea misses
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

    // 2. Preload preamble package dependency closure only when preamble changes
    try {
      const preambleText = extractPreambleText(input.files);
      const fastSig = fastFnv1a(preambleText);
      if (this.lastPreambleFastSig.get(engine) !== fastSig) {
        const preambleSig = await sha256Hex(preambleText);
        if (this.lastPreambleSig.get(engine) !== preambleSig) {
          await this.resolveAndMountPackages(runner, engine, preambleText);
          this.lastPreambleSig.set(engine, preambleSig);
        }
        this.lastPreambleFastSig.set(engine, fastSig);
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

      const allDocContent = input.files
        .filter((f) => f.name.endsWith('.tex') || f.name.endsWith('.cls') || f.name.endsWith('.sty'))
        .map((f) => f.content)
        .join('\n');
      const referencedImages = extractReferencedImages(allDocContent || source);

      for (const imgName of referencedImages) {
        const baseName = imgName.slice(imgName.lastIndexOf('/') + 1);
        const cleanName = imgName.replace(/^\.\//, '');
        if (
          !existingFileNames.has(imgName) &&
          !existingFileNames.has(cleanName) &&
          !existingFileNames.has(baseName)
        ) {
          const placeholderBytes = getPlaceholderGraphicBytes(imgName);
          engineFiles.push({ path: imgName, content: placeholderBytes });
          if (!imgName.startsWith('./') && !imgName.startsWith('/')) {
            engineFiles.push({ path: `./${imgName}`, content: placeholderBytes });
          }
          if (baseName !== imgName) {
            engineFiles.push({ path: baseName, content: placeholderBytes });
            engineFiles.push({ path: `./${baseName}`, content: placeholderBytes });
          }
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
                engineFiles.push({ path: aux.path, content: aux.content });
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

      // Self-healing missing package auto-fetch + single automatic retry
      if (parsed.missingPackages.length > 0 && !this.queued) {
        const candidates = parsed.missingPackages.filter(
          (pkg) => !this.unresolvablePackages.has(pkg)
        );
        if (candidates.length > 0) {
          try {
            const syntheticPreamble = candidates
              .map((pkg) => `\\usepackage{${pkg.replace(/\.(?:sty|cls)$/i, '')}}`)
              .join('\n');
            const newlyMounted = await this.resolveAndMountPackages(
              runner,
              engine,
              syntheticPreamble
            );
            if (newlyMounted > 0) {
              const healed = await tool.compile({
                input: source,
                mainTexPath: entry.name,
                additionalFiles: engineFiles,
                bibtex: bibtexNeeded,
                makeindex: input.makeindex ?? needsMakeindex(source),
                rerun: false,
                remoteEndpoint: remoteEndpoint(),
              });
              result = healed;
              log = result.log || '';
              parsed = parseTexLog(log, { root: entry.name });
            } else {
              for (const pkg of candidates) this.unresolvablePackages.add(pkg);
            }
          } catch {
            // Non-fatal; fall through to standard diagnostics
          }
        }
      }

      // Pass-1 Instant PDF Streaming
      if (result.pdf && result.pdf.byteLength > 0 && input.onIntermediateResult) {
        try {
          input.onIntermediateResult({
            pdf: result.pdf,
            synctex: result.synctex && result.synctex.byteLength > 0 ? result.synctex : null,
          });
        } catch {
          // Non-fatal
        }
      }

      // Layer 8 & 9: Two-pass ceiling in 'fast' mode + .aux signature bypass
      const maxPasses = input.compileMode === 'publication' ? MAX_COMPILE_PASSES : 2;
      let shouldBypassSecondPass = false;

      if (input.compileMode !== 'publication' && parsed.rerunRequired) {
        try {
          const memfsFiles = await runner.readProjectFiles();
          const auxSig = await extractAuxSignature(memfsFiles);
          const prevAuxSig = this.lastAuxSignature.get(projectKey);
          if (auxSig && prevAuxSig && auxSig === prevAuxSig) {
            shouldBypassSecondPass = true;
          }
        } catch {
          // Non-fatal
        }
      }

      while (
        parsed.rerunRequired &&
        !shouldBypassSecondPass &&
        passes < maxPasses &&
        !this.queued &&
        result.pdf &&
        result.pdf.byteLength > 0
      ) {
        const followUp = await tool.compile({
          input: source,
          mainTexPath: entry.name,
          additionalFiles: engineFiles,
          bibtex: false,
          makeindex: false,
          rerun: false,
          remoteEndpoint: remoteEndpoint(),
        });
        passes++;

        if (!followUp.pdf || followUp.pdf.byteLength === 0) break;

        result = followUp;
        log = result.log || '';
        parsed = parseTexLog(log, { root: entry.name });
      }

      const pdf = result.pdf && result.pdf.byteLength > 0 ? result.pdf : null;

      // Layer 1 & 5: Persist PDF snapshot and deduplicated auxiliary artifacts
      if (pdf && input.projectId) {
        void saveCompiledPdfSnapshot(input.projectId, pdf, result.synctex).catch(() => { });

        void (async () => {
          try {
            const memfsFiles = await runner.readProjectFiles();
            const auxSig = await extractAuxSignature(memfsFiles);
            const prevAuxSig = this.lastAuxSignature.get(projectKey);
            if (auxSig && auxSig === prevAuxSig) return;
            if (auxSig) {
              this.lastAuxSignature.set(projectKey, auxSig);
            }

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
    this.lastPreambleFastSig.clear();
    this.lastPreambleSig.clear();
    this.mountedPackagesByEngine.clear();
    this.unresolvablePackages.clear();
    this.registeredMissesByEngine.clear();
    this.lastBibSignature.clear();
    this.lastAuxSignature.clear();
    this.hasSettledBbl.clear();
    this.loadedAuxProjects.clear();
    this.setStatus({ phase: 'idle', progress: 0 });
  }
}

export const texEngine = new TexEngineService();