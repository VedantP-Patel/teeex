import { describe, it, expect } from 'vitest';
import {
  validatePackagePayload,
  computeSha256,
  MAX_PACKAGE_SIZE,
  MIN_PACKAGE_SIZE,
} from '../../scripts/download-essential-packages.mjs';

describe('Essential Package Provisioning Validation (packageProvisioning)', () => {
  describe('HTML and Upstream Error Rejection', () => {
    it('rejects HTML error content served with misleading binary payload', () => {
      const htmlPayload = Buffer.from(
        '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>'
      );
      const result = validatePackagePayload('booktabs.sty', htmlPayload);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('HTML error response detected');
    });

    it('rejects explicit upstream server error text', () => {
      const errorText = Buffer.from('Cannot GET /26/titlesec.sty\nUpstream 404 Not Found\n');
      const result = validatePackagePayload('titlesec.sty', errorText);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Explicit upstream error text detected');
    });

    it('rejects AWS/Cloudflare XML/text NoSuchKey or Access Denied errors', () => {
      const accessDenied = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Error><Code>Access Denied</Code></Error>');
      const result = validatePackagePayload('environ.sty', accessDenied);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Explicit upstream error text detected');
    });
  });

  describe('Size Boundaries', () => {
    it('rejects empty or null payload', () => {
      const result = validatePackagePayload('test.sty', Buffer.from(''));
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Undersized');
    });

    it(`rejects payloads smaller than MIN_PACKAGE_SIZE (${MIN_PACKAGE_SIZE} bytes)`, () => {
      const tiny = Buffer.from('\\def\\a{1}'); // 9 bytes
      const result = validatePackagePayload('tiny.sty', tiny);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain(`Undersized payload (${tiny.length} bytes < ${MIN_PACKAGE_SIZE} bytes)`);
    });

    it('rejects payloads exceeding the 8 MiB size limit', () => {
      // Create a lightweight mock buffer object with byteLength > 8 MiB
      const oversized = {
        length: MAX_PACKAGE_SIZE + 1,
        toString: () => '\\ProvidesPackage{large}',
      };

      const result = validatePackagePayload('huge.sty', oversized as any);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Oversized payload');
    });
  });

  describe('Embedded NUL Byte Guard', () => {
    it('rejects text packages containing embedded NUL bytes', () => {
      const corrupted = Buffer.from('\\ProvidesPackage{test}[2026/01/01]\x00\\def\\corrupted{true}');
      const result = validatePackagePayload('corrupt.sty', corrupted);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Embedded NUL byte detected');
    });
  });

  describe('TeX Style and Class Source Markers', () => {
    it('accepts modern style files with \\ProvidesPackage and \\NeedsTeXFormat', () => {
      const modernStyle = Buffer.from(
        '% Modern LaTeX package\n\\NeedsTeXFormat{LaTeX2e}\n\\ProvidesPackage{booktabs}[2020/05/08 v1.00 Academic publication tables]\n\\RequirePackage{array}\n'
      );
      const result = validatePackagePayload('booktabs.sty', modernStyle);

      expect(result.valid).toBe(true);
      expect(result.reason).toBe('Valid TeX style/class');
    });

    it('accepts legacy style files with direct macro definitions (\\def, \\catcode, \\makeatletter)', () => {
      const legacyStyle = Buffer.from(
        '% Legacy style definitions\n\\catcode`\\@=11\n\\def\\legacytable#1{\\begingroup#1\\endgroup}\n\\let\\oldlegacy=\\legacytable\n\\catcode`\\@=12\n'
      );
      const result = validatePackagePayload('legacy.sty', legacyStyle);

      expect(result.valid).toBe(true);
      expect(result.reason).toBe('Valid TeX style/class');
    });

    it('accepts document classes (.cls) with \\ProvidesClass', () => {
      const clsPayload = Buffer.from(
        '\\NeedsTeXFormat{LaTeX2e}\n\\ProvidesClass{sn-jnl}[2023/05/01 Springer Nature Journal]\n\\DeclareOption*{\\PassOptionsToClass{\\CurrentOption}{article}}\n\\ProcessOptions\\relax\n'
      );
      const result = validatePackagePayload('sn-jnl.cls', clsPayload);

      expect(result.valid).toBe(true);
      expect(result.reason).toBe('Valid TeX style/class');
    });

    it('rejects style files missing all expected TeX markers', () => {
      const invalidStyle = Buffer.from(
        'Plain english text without any latex macro backslashes or percent comments whatsoever in this file.'
      );
      const result = validatePackagePayload('invalid.sty', invalidStyle);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing expected TeX source markers');
    });
  });

  describe('BibTeX Style (.bst) Markers', () => {
    it('accepts valid BibTeX styles containing ENTRY and FUNCTION blocks', () => {
      const bstPayload = Buffer.from(
        '% BibTeX standard bibliography style\nENTRY\n  { address\n    author\n    title\n  }\n  {}\n  { label }\nFUNCTION {output.bibitem}\n{\n  newline$\n}\nREAD\n'
      );
      const result = validatePackagePayload('ACM-Reference-Format.bst', bstPayload);

      expect(result.valid).toBe(true);
      expect(result.reason).toBe('Valid BibTeX style');
    });

    it('rejects .bst files lacking required BibTeX markers', () => {
      const invalidBst = Buffer.from(
        'This is not a valid BibTeX style file and has no entry functions or grammar definitions.'
      );
      const result = validatePackagePayload('invalid.bst', invalidBst);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing expected BibTeX style markers');
    });
  });

  describe('SHA-256 Digest Computation', () => {
    it('computes consistent 64-char hex SHA-256 digests', () => {
      const sample = Buffer.from('hello-teeex-package');
      const hash1 = computeSha256(sample);
      const hash2 = computeSha256(sample);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
    });
  });
});
