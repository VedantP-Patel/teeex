import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createPackageServer } from '../../deploy/texlive-server/server.mjs';

function doRequest(
  port: number,
  path: string,
  method = 'GET',
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body,
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('Hardened TeX Live Package Server (deploy/texlive-server)', () => {
  let server: http.Server;
  let port: number;
  let tempCacheDir: string;

  beforeEach(async () => {
    tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teeex-server-test-'));
    server = createPackageServer({
      cacheDir: tempCacheDir,
      upstream: 'https://texlive2026.texlyre.org',
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    try {
      fs.rmSync(tempCacheDir, { recursive: true, force: true });
    } catch {}
  });

  it('serves healthy JSON on /health and sets nosniff header', async () => {
    const res = await doRequest(port, '/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    const data = JSON.parse(res.body);
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('teeex-texlive-server');
  });

  it('handles OPTIONS preflight with 204 No Content', async () => {
    const res = await doRequest(port, '/some/package.sty', 'OPTIONS');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('rejects disallowed HTTP methods with 405 Method Not Allowed', async () => {
    const postRes = await doRequest(port, '/pkg.sty', 'POST');
    expect(postRes.status).toBe(405);
    expect(postRes.headers['allow']).toBe('GET, HEAD, OPTIONS');
    expect(postRes.body).toContain('Method Not Allowed');

    const delRes = await doRequest(port, '/pkg.sty', 'DELETE');
    expect(delRes.status).toBe(405);
  });

  it('rejects raw encoded directory traversal attacks with 400 Bad Request', async () => {
    const traversal1 = await doRequest(port, '/%2e%2e/etc/passwd');
    expect(traversal1.status).toBe(400);
    expect(traversal1.body).toContain('Invalid URL characters or path traversal');

    const traversal2 = await doRequest(port, '/..%5cwindows%5cwin.ini');
    expect(traversal2.status).toBe(400);

    const traversal3 = await doRequest(port, '/%00secret.txt');
    expect(traversal3.status).toBe(400);
  });

  it('serves files from disk cache with X-Cache: HIT', async () => {
    const cachedFile = path.join(tempCacheDir, '26', 'testpkg.sty');
    fs.mkdirSync(path.dirname(cachedFile), { recursive: true });
    fs.writeFileSync(cachedFile, '\\ProvidesPackage{testpkg}\n');

    const res = await doRequest(port, '/26/testpkg.sty');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toBe('\\ProvidesPackage{testpkg}\n');
  });

  it('handles HEAD requests properly without streaming a body', async () => {
    const cachedFile = path.join(tempCacheDir, '26', 'headtest.sty');
    fs.mkdirSync(path.dirname(cachedFile), { recursive: true });
    fs.writeFileSync(cachedFile, 'header-test-content');

    const res = await doRequest(port, '/26/headtest.sty', 'HEAD');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.body).toBe(''); // Body must be empty for HEAD
  });

  it('rejects non-HTTPS upstream with 500 Server Misconfiguration', async () => {
    const insecureServer = createPackageServer({
      cacheDir: tempCacheDir,
      upstream: 'http://insecure.texlyre.org',
    });

    await new Promise<void>((resolve) => {
      insecureServer.listen(0, '127.0.0.1', resolve);
    });

    const insecurePort = (insecureServer.address() as any).port;
    try {
      const res = await doRequest(insecurePort, '/pkg.sty');
      expect(res.status).toBe(500);
      expect(res.body).toContain('Server Misconfiguration: Upstream URL must use HTTPS');
    } finally {
      await new Promise<void>((resolve) => insecureServer.close(() => resolve()));
    }
  });
});
