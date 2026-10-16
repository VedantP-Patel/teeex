import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const HEADERS_PATH = join(ROOT, 'public', '_headers');
const VERCEL_JSON_PATH = join(ROOT, 'vercel.json');
const VITE_CONFIG_PATH = join(ROOT, 'vite.config.ts');

describe('Security Headers, CSP Tightening & Target Consolidation (S4f, S4d)', () => {
  const headersContent = readFileSync(HEADERS_PATH, 'utf8');

  it('Content-Security-Policy in public/_headers excludes Google Fonts CDNs', () => {
    expect(headersContent).not.toContain('fonts.googleapis.com');
    expect(headersContent).not.toContain('fonts.gstatic.com');
  });

  it('Content-Security-Policy excludes dead hostnames (railway, onrender, fly)', () => {
    expect(headersContent).not.toContain('railway.app');
    expect(headersContent).not.toContain('onrender.com');
    expect(headersContent).not.toContain('fly.dev');
  });

  it('public/_headers contains immutable cache rule for /fonts/*', () => {
    expect(headersContent).toContain('/fonts/*');
    expect(headersContent).toMatch(/\/fonts\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
  });

  it('public/_headers does not contain ineffective subresource COEP on /core/busytex/*', () => {
    const busytexSection = headersContent.split('/core/busytex/*')[1]?.split('\n\n')[0] || '';
    expect(busytexSection).not.toContain('Cross-Origin-Embedder-Policy');
    expect(busytexSection).toContain('Cross-Origin-Resource-Policy: same-origin');
  });

  it('vercel.json is permanently deleted from the repository root', () => {
    expect(existsSync(VERCEL_JSON_PATH), 'vercel.json must be deleted').toBe(false);
  });

  it('vite.config.ts preview CSP mirrors the tightened production CSP', () => {
    const viteConfig = readFileSync(VITE_CONFIG_PATH, 'utf8');
    expect(viteConfig).not.toContain('fonts.googleapis.com');
    expect(viteConfig).not.toContain('fonts.gstatic.com');
    expect(viteConfig).not.toContain('railway.app');
    expect(viteConfig).not.toContain('onrender.com');
    expect(viteConfig).not.toContain('fly.dev');
  });
});
