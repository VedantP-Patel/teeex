import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BUNDLED_PACKAGES, isHtmlResponse } from '../../src/services/bundledPackages';

const ROOT = resolve(__dirname, '../..');
const PACKAGES_DIR = join(ROOT, 'public', 'packages');

describe('Package Poison Guard & Essential Packages (S3e)', () => {
  it('isHtmlResponse detects text/html content-type header', () => {
    const dummyBuf = new Uint8Array([1, 2, 3]);
    expect(isHtmlResponse(dummyBuf, 'text/html')).toBe(true);
    expect(isHtmlResponse(dummyBuf, 'text/html; charset=utf-8')).toBe(true);
    expect(isHtmlResponse(dummyBuf, 'TEXT/HTML')).toBe(true);
    expect(isHtmlResponse(dummyBuf, 'application/octet-stream')).toBe(false);
    expect(isHtmlResponse(dummyBuf, 'text/plain')).toBe(false);
    expect(isHtmlResponse(dummyBuf, null)).toBe(false);
  });

  it('isHtmlResponse sniffs HTML markup even if content-type header is missing or octet-stream', () => {
    const htmlDoctype = new TextEncoder().encode('<!DOCTYPE html><html><body>Error</body></html>');
    const htmlFragment = new TextEncoder().encode('<html><head><title>404</title></head></html>');
    const validTex = new TextEncoder().encode('\\ProvidesPackage{mypkg}[2026/01/01]');
    const binaryTfm = new Uint8Array([0x00, 0x11, 0x00, 0x02, 0x5a, 0x6b]);

    expect(isHtmlResponse(htmlDoctype, 'application/octet-stream')).toBe(true);
    expect(isHtmlResponse(htmlFragment, undefined)).toBe(true);
    expect(isHtmlResponse(validTex, 'application/octet-stream')).toBe(false);
    expect(isHtmlResponse(binaryTfm, 'application/octet-stream')).toBe(false);
  });

  it('lipsum.sty and lipsum.ltd are registered in BUNDLED_PACKAGES', () => {
    const lipsumSty = BUNDLED_PACKAGES.find((p) => p.name === 'lipsum.sty');
    const lipsumLtd = BUNDLED_PACKAGES.find((p) => p.name === 'lipsum.ltd');

    expect(lipsumSty, 'lipsum.sty must be registered').toBeDefined();
    expect(lipsumSty?.format).toBe(26);

    expect(lipsumLtd, 'lipsum.ltd must be registered').toBeDefined();
    expect(lipsumLtd?.format).toBe(26);
  });

  it('lipsum files are provisioned into public/packages/ with valid size', () => {
    const styPath = join(PACKAGES_DIR, 'lipsum.sty');
    const ltdPath = join(PACKAGES_DIR, 'lipsum.ltd');

    expect(existsSync(styPath), 'lipsum.sty must exist in public/packages/').toBe(true);
    expect(existsSync(ltdPath), 'lipsum.ltd must exist in public/packages/').toBe(true);

    expect(statSync(styPath).size).toBeGreaterThan(10_000);
    expect(statSync(ltdPath).size).toBeGreaterThan(50_000);
  });
});
