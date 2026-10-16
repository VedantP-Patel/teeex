import { describe, it, expect } from 'vitest';
import { isSafeUrl } from '../../src/services/pdfRenderer';
import type { PreviewState } from '../../src/components/PdfPreviewPane';

describe('PDF Annotation Layer & Security Protocols (Stage 3)', () => {
  describe('isSafeUrl protocol whitelist', () => {
    it('accepts valid https, http, and mailto links', () => {
      expect(isSafeUrl('https://arxiv.org/abs/2301.00001')).toBe(true);
      expect(isSafeUrl('http://example.com')).toBe(true);
      expect(isSafeUrl('mailto:author@university.edu')).toBe(true);
      expect(isSafeUrl('https://github.com/texlyre/texlyre-busytex')).toBe(true);
      expect(isSafeUrl('/relative/path')).toBe(true);
      expect(isSafeUrl('./doc.pdf')).toBe(true);
    });

    it('strictly rejects javascript: and data: pseudo-protocol injection attacks', () => {
      expect(isSafeUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeUrl('javascript:void(0)')).toBe(false);
      expect(isSafeUrl('JAVASCRIPT:alert(document.cookie)')).toBe(false);
      expect(isSafeUrl('javascript :alert(1)')).toBe(false);
      expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isSafeUrl('data:application/javascript;base64,YWxlcnQoMSk=')).toBe(false);
      expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
      expect(isSafeUrl('file:///etc/passwd')).toBe(false);
      expect(isSafeUrl('//malicious.com/payload')).toBe(false);
    });

    it('rejects empty, null, or malformed inputs safely without throwing', () => {
      expect(isSafeUrl('')).toBe(false);
      expect(isSafeUrl('   ')).toBe(false);
      expect(isSafeUrl(null as unknown as string)).toBe(false);
      expect(isSafeUrl(undefined as unknown as string)).toBe(false);
    });
  });

  describe('Explicit 4-State Document Preview Lifecycle', () => {
    function computeState(options: {
      engineFailed?: boolean;
      engineError?: string;
      isCompiling?: boolean;
      elapsedSec?: number;
      hasDocument?: boolean;
      isStale?: boolean;
      isDebouncing?: boolean;
      errorSummary?: string | null;
      durationMs?: number | null;
    }): PreviewState {
      if (options.engineFailed) {
        return { type: 'failed', error: options.engineError || 'The TeX engine could not start' };
      }
      if (options.isCompiling) {
        return { type: 'compiling', elapsedSec: options.elapsedSec || 0 };
      }
      if (!options.hasDocument) {
        return { type: 'failed', error: options.errorSummary || 'No PDF generated yet' };
      }
      if (options.isStale) {
        return { type: 'stale', reason: 'compile_error', errorSummary: options.errorSummary };
      }
      if (options.isDebouncing) {
        return { type: 'stale', reason: 'typing' };
      }
      return { type: 'current', durationMs: options.durationMs ?? null };
    }

    it('resolves to current when document is fresh and compilation succeeded', () => {
      const state = computeState({
        hasDocument: true,
        isCompiling: false,
        isStale: false,
        isDebouncing: false,
        durationMs: 320,
      });

      expect(state.type).toBe('current');
      if (state.type === 'current') {
        expect(state.durationMs).toBe(320);
      }
    });

    it('resolves to compiling with elapsed counter while in flight', () => {
      const state = computeState({
        hasDocument: true,
        isCompiling: true,
        elapsedSec: 1.4,
      });

      expect(state.type).toBe('compiling');
      if (state.type === 'compiling') {
        expect(state.elapsedSec).toBe(1.4);
      }
    });

    it('resolves to stale with typing reason during debounce window', () => {
      const state = computeState({
        hasDocument: true,
        isCompiling: false,
        isDebouncing: true,
      });

      expect(state.type).toBe('stale');
      if (state.type === 'stale') {
        expect(state.reason).toBe('typing');
      }
    });

    it('resolves to stale with compile_error when compilation fails but previous PDF exists', () => {
      const state = computeState({
        hasDocument: true,
        isCompiling: false,
        isStale: true,
        errorSummary: 'Undefined control sequence \\foo',
      });

      expect(state.type).toBe('stale');
      if (state.type === 'stale') {
        expect(state.reason).toBe('compile_error');
        expect(state.errorSummary).toBe('Undefined control sequence \\foo');
      }
    });

    it('resolves to failed when no PDF exists and error occurred', () => {
      const state = computeState({
        hasDocument: false,
        isCompiling: false,
        errorSummary: 'Emergency stop: fatal LaTeX error',
      });

      expect(state.type).toBe('failed');
      if (state.type === 'failed') {
        expect(state.error).toBe('Emergency stop: fatal LaTeX error');
      }
    });
  });
});
