import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
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

describe('Stage 4: Hardened TeX Live Package Server (deploy/texlive-server)', () => {
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

    const traversal2 = await doRequest(port, '/..%5cwindows%5cwin.ini');
    expect(traversal2.status).toBe(400);

    const traversal3 = await doRequest(port, '/%00secret.txt');
    expect(traversal3.status).toBe(400);
  });

  it('rejects malformed percent escapes with 400 Bad Request', async () => {
    const malformed1 = await doRequest(port, '/%zz/test.sty');
    expect(malformed1.status).toBe(400);
    expect(malformed1.body).toContain('Malformed percent escape');

    const malformed2 = await doRequest(port, '/packages/%2/test.sty');
    expect(malformed2.status).toBe(400);
    expect(malformed2.body).toContain('Malformed percent escape');
  });

  it('rejects multi-encoded path traversals with 400 Bad Request', async () => {
    // %252e is double-encoded dot
    const multiEncoded = await doRequest(port, '/%252e%252e/etc/passwd');
    expect(multiEncoded.status).toBe(400);
    expect(multiEncoded.body).toContain('Multi-encoded path traversal');
  });

  it('safely excludes query strings from filesystem path checks', async () => {
    const cachedFile = path.join(tempCacheDir, '26', 'querytest.sty');
    fs.mkdirSync(path.dirname(cachedFile), { recursive: true });
    fs.writeFileSync(cachedFile, '\\ProvidesPackage{querytest}\n');

    // Query string ?v=1.0.0&cache=true should not break filesystem cache lookup
    const res = await doRequest(port, '/26/querytest.sty?v=1.0.0&cache=true');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.body).toBe('\\ProvidesPackage{querytest}\n');
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

  it('rejects upstream redirects with 502 Bad Gateway to prevent host hijacking', async () => {
    // Mock https.request to simulate upstream returning a 302 redirect
    const origRequest = https.request;
    const httpsMock = vi.spyOn(https, 'request').mockImplementation((url: any, opts: any, cb: any) => {
      const callback = typeof opts === 'function' ? opts : cb;
      const { PassThrough } = require('node:stream');
      const mockSocket = new PassThrough();
      const mockIncoming = new http.IncomingMessage(mockSocket as any);
      mockIncoming.statusCode = 302;
      mockIncoming.headers = { location: 'https://malicious.upstream.org/hijacked.sty' };

      const clientReq = new http.ClientRequest({ host: 'localhost' });
      process.nextTick(() => {
        if (callback) callback(mockIncoming);
      });
      return clientReq;
    });

    try {
      const res = await doRequest(port, '/26/redirected.sty');
      expect(res.status).toBe(502);
      expect(res.body).toContain('Upstream redirects are prohibited');
    } finally {
      httpsMock.mockRestore();
    }
  });
});
