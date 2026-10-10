/**
 * Teeex Studio — Native WebAssembly LaTeX Compiler Service
 *
 * Powered by TeXlyre BusyTeX (TeX Live 2026 WASM).
 * Compiles LaTeX source files directly in-browser using genuine pdfLaTeX/XeLaTeX,
 * producing 100% authentic Overleaf-identical PDF output.
 */

import { BusyTexRunner, PdfLatex } from 'texlyre-busytex';
import type { ProjectFile } from '../types/latex';

export interface LatexCompilerError {
  line: number;
  message: string;
  sourceContext?: string;
  file?: string;
}

export interface LatexCompilerWarning {
  line: number;
  message: string;
  file?: string;
}

export interface WasmCompileResult {
  success: boolean;
  pdfBytes: Uint8Array | null;
  synctexBytes: Uint8Array | null;
  log: string;
  errors: LatexCompilerError[];
  warnings: LatexCompilerWarning[];
  durationMs: number;
}

export type CompilerEngineStatus = 'uninitialized' | 'downloading' | 'ready' | 'compiling' | 'error';

export class LatexCompilerService {
  private runner: BusyTexRunner | null = null;
  private pdflatex: PdfLatex | null = null;
  private status: CompilerEngineStatus = 'uninitialized';
  private downloadPercent = 0;
  private initPromise: Promise<void> | null = null;
  private statusListeners = new Set<(status: CompilerEngineStatus, progress?: number) => void>();

  onStatusChange(listener: (status: CompilerEngineStatus, progress?: number) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status, this.downloadPercent);
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatus(status: CompilerEngineStatus, progress?: number) {
    this.status = status;
    if (progress !== undefined) this.downloadPercent = progress;
    this.statusListeners.forEach(fn => fn(status, progress ?? this.downloadPercent));
  }

  getStatus(): CompilerEngineStatus {
    return this.status;
  }

  getDownloadPercent(): number {
    return this.downloadPercent;
  }

  async initialize(): Promise<void> {
    if (this.runner?.isInitialized()) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        this.notifyStatus('downloading', 0);

        this.runner = new BusyTexRunner({
          busytexBasePath: '/core/busytex',
          verbose: false,
          engineMode: 'combined',
          preloadDataPackages: ['/core/busytex/texlive-basic.js'],
          catalogDataPackages: [
            '/core/busytex/texlive-recommended.js',
            '/core/busytex/texlive-extra.js',
          ],
          onDownloadProgress: (progress) => {
            this.downloadPercent = Math.min(100, progress.percent);
            this.notifyStatus('downloading', this.downloadPercent);
          },
        });

        await this.runner.initialize(true); // run in Web Worker
        this.pdflatex = new PdfLatex(this.runner, false);
        this.notifyStatus('ready', 100);
      } catch (err) {
        console.error('[LaTeXCompiler] Initialization failed:', err);
        this.notifyStatus('error');
        this.initPromise = null;
        throw err;
      }
    })();

    return this.initPromise;
  }

  async compile(code: string, files: ProjectFile[] = []): Promise<WasmCompileResult> {
    const t0 = performance.now();

    try {
      await this.initialize();
      this.notifyStatus('compiling');

      const additionalFiles = files
        .filter(f => f.content && !f.name.endsWith('.tex') || f.name !== 'main.tex')
        .map(f => ({
          path: f.name,
          content: f.content,
        }));

      if (!this.pdflatex) {
        throw new Error('pdfLaTeX tool not available');
      }

      const res = await this.pdflatex.compile({
        input: code,
        additionalFiles,
        rerun: true,
        bibtex: true,
      });

      const t1 = performance.now();
      const durationMs = Math.round(t1 - t0);

      const { errors, warnings } = this.parseLog(res.log || '');

      this.notifyStatus(res.success && res.pdf ? 'ready' : 'ready');

      return {
        success: Boolean(res.success && res.pdf),
        pdfBytes: res.pdf || null,
        synctexBytes: res.synctex || null,
        log: res.log || '',
        errors,
        warnings,
        durationMs,
      };
    } catch (err) {
      const t1 = performance.now();
      const message = err instanceof Error ? err.message : String(err);
      this.notifyStatus('ready');

      return {
        success: false,
        pdfBytes: null,
        synctexBytes: null,
        log: `Compilation failed: ${message}`,
        errors: [{
          line: 1,
          message,
        }],
        warnings: [],
        durationMs: Math.round(t1 - t0),
      };
    }
  }

  parseLog(logText: string): { errors: LatexCompilerError[]; warnings: LatexCompilerWarning[] } {
    const errors: LatexCompilerError[] = [];
    const warnings: LatexCompilerWarning[] = [];

    const lines = logText.split(/\r?\n/);
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Match standard TeX error "! Error message"
      if (line.startsWith('! ')) {
        const errorMsg = line.slice(2).trim();
        let errorLine = 1;
        let sourceSnippet = '';

        // Look ahead for "l.<number> <snippet>"
        for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
          const ahead = lines[j];
          const lineMatch = ahead.match(/^l\.(\d+)\s*(.*)$/);
          if (lineMatch) {
            errorLine = parseInt(lineMatch[1], 10);
            sourceSnippet = lineMatch[2];
            break;
          }
        }

        errors.push({
          line: errorLine,
          message: errorMsg,
          sourceContext: sourceSnippet || undefined,
        });
      }

      // Match LaTeX Warning: ... on input line <number>
      const warnMatch = line.match(/(?:LaTeX|Package\s+\w+)\s+Warning:\s+(.*?)(?:on input line\s+(\d+))?/i);
      if (warnMatch) {
        const warnMsg = warnMatch[1].trim();
        const warnLine = warnMatch[2] ? parseInt(warnMatch[2], 10) : 1;
        warnings.push({
          line: warnLine,
          message: warnMsg,
        });
      }

      i++;
    }

    return { errors, warnings };
  }
}

export const latexCompiler = new LatexCompilerService();
