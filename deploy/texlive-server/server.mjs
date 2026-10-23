import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 8080;
const CACHE_DIR = process.env.CACHE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'cache');
const UPSTREAM = (process.env.UPSTREAM_URL || 'https://texlive2026.texlyre.org').replace(/\/+$/, '');
const MAX_PACKAGE_SIZE = 64 * 1024 * 1024; // 64 MiB
const UPSTREAM_TIMEOUT_MS = 15000; // 15 seconds

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export function createPackageServer({
  cacheDir = CACHE_DIR,
  upstream = UPSTREAM,
  maxSize = MAX_PACKAGE_SIZE,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
} = {}) {
  const resolvedCacheDir = path.resolve(cacheDir);

  if (!fs.existsSync(resolvedCacheDir)) {
    fs.mkdirSync(resolvedCacheDir, { recursive: true });
  }

  return http.createServer((req, res) => {
    // 1. CORS and nosniff headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 2. Method Filtering
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    // 3. Upstream Protocol Enforcement
    if (!upstream.startsWith('https://')) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server Misconfiguration: Upstream URL must use HTTPS');
      return;
    }

    const rawUrl = req.url || '';
    // Exclude query string from filesystem path checks
    const rawPathOnly = rawUrl.split('?')[0];

    // 4. Raw Path Traversal & Segment Validation
    // Malformed percent escapes (e.g. %zz, %2, trailing %)
    if (/%(?![0-9a-fA-F]{2})/.test(rawPathOnly)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request: Malformed percent escape');
      return;
    }

    // Control characters: NUL, CR, LF
    if (/[\r\n\0]/.test(rawPathOnly) || /%0[0a-fA-F]|%0[dD]/.test(rawPathOnly)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request: Invalid URL characters detected');
      return;
    }

    // Backslashes or encoded backslashes
    if (/\\|%5[cC]/.test(rawPathOnly)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request: Backslash path separator detected');
      return;
    }

    // Multi-encoded traversals or slashes (%252e, %252f, %255c)
    if (/%25(?:2[eE]|2[fF]|5[cC])/i.test(rawPathOnly) || /%2525/i.test(rawPathOnly)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request: Multi-encoded path traversal detected');
      return;
    }

    // Traversal segments (.. or %2e%2e)
    if (/(?:^|\/|%2[fF])(?:\.\.|%2[eE]%2[eE]|%2[eE]\.|\.%2[eE])(?:\/|%2[fF]|$)/.test(rawPathOnly)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request: Path traversal sequence detected');
      return;
    }

    let url;
    try {
      url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request: Malformed URL');
      return;
    }

    const pathname = decodeURIComponent(url.pathname);

    // 5. Health Check Endpoint
    if (pathname === '/health' || pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(JSON.stringify({ status: 'healthy', service: 'teeex-texlive-server', upstream }));
      return;
    }

    // 6. Path Resolution & Cache Root Containment Check
    const safeSubPath = path.normalize(pathname).replace(/^[/\\]+/, '');
    const localFile = path.resolve(resolvedCacheDir, safeSubPath);

    if (!localFile.startsWith(resolvedCacheDir + path.sep) && localFile !== resolvedCacheDir) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request: Path escapes cache root');
      return;
    }

    // 7. Cache Hit
    if (fs.existsSync(localFile) && fs.statSync(localFile).isFile()) {
      const stat = fs.statSync(localFile);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Cache': 'HIT',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(localFile).pipe(res);
      return;
    }

    // 8. Cache Miss -> Fetch from Upstream
    const upstreamUrl = `${upstream}${pathname}`;
    const tempFile = path.join(resolvedCacheDir, `.tmp.${Date.now()}.${crypto.randomUUID()}.tmp`);
    let tempWriteStream = null;
    let isClientClosed = false;

    req.on('close', () => {
      isClientClosed = true;
      if (!res.writableEnded) {
        upstreamReq.destroy();
        if (tempWriteStream && !tempWriteStream.destroyed) {
          tempWriteStream.destroy();
        }
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
      }
    });

    const upstreamReq = https.request(
      upstreamUrl,
      {
        method: req.method,
        timeout: timeoutMs,
      },
      (upstreamRes) => {
        if (isClientClosed) {
          upstreamRes.destroy();
          return;
        }

        const statusCode = upstreamRes.statusCode || 502;

        // Reject upstream redirects (301, 302, 303, 307, 308)
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          try { upstreamRes.destroy(); } catch {}
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Cache': 'MISS' });
            res.end('Bad Gateway: Upstream redirects are prohibited');
          }
          return;
        }

        if (statusCode !== 200) {
          if (!res.headersSent) {
            res.writeHead(statusCode, {
              'Content-Type': upstreamRes.headers['content-type'] || 'text/plain; charset=utf-8',
              'X-Cache': 'MISS',
            });
          }
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          upstreamRes.pipe(res);
          return;
        }

        // Validate advertised content-length
        const advertisedLen = parseInt(upstreamRes.headers['content-length'] || '0', 10);
        if (advertisedLen > maxSize) {
          upstreamRes.destroy();
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Cache': 'MISS' });
            res.end(`Bad Gateway: Upstream payload exceeds ${maxSize} bytes limit`);
          }
          return;
        }

        if (req.method === 'HEAD') {
          if (!res.headersSent) {
            res.writeHead(200, {
              'Content-Type': upstreamRes.headers['content-type'] || 'application/octet-stream',
              'Content-Length': upstreamRes.headers['content-length'],
              'Cache-Control': 'public, max-age=31536000, immutable',
              'X-Cache': 'MISS',
            });
          }
          res.end();
          return;
        }

        // GET: Stream to client while writing to temporary cache file
        try {
          fs.mkdirSync(path.dirname(localFile), { recursive: true });
          tempWriteStream = fs.createWriteStream(tempFile);
        } catch (err) {
          console.warn('[cache] Unable to open temp cache stream:', err.message);
        }

        let streamedBytes = 0;
        let isOversized = false;

        if (!res.headersSent) {
          res.writeHead(200, {
            'Content-Type': upstreamRes.headers['content-type'] || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Cache': 'MISS',
          });
        }

        upstreamRes.on('data', (chunk) => {
          streamedBytes += chunk.length;
          if (streamedBytes > maxSize) {
            isOversized = true;
            upstreamRes.destroy();
            if (tempWriteStream) tempWriteStream.destroy();
            try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
            if (!res.writableEnded) {
              res.destroy(new Error(`Payload exceeded maximum size limit of ${maxSize} bytes`));
            }
            return;
          }

          const canWriteTemp = tempWriteStream && !tempWriteStream.destroyed ? tempWriteStream.write(chunk) : true;
          const canWriteRes = res.write(chunk);

          // Apply stream backpressure if buffer full
          if (!canWriteTemp || !canWriteRes) {
            upstreamRes.pause();
            let drainedTemp = canWriteTemp;
            let drainedRes = canWriteRes;

            const checkDrain = () => {
              if (drainedTemp && drainedRes) {
                upstreamRes.resume();
              }
            };

            if (!canWriteRes) {
              res.once('drain', () => {
                drainedRes = true;
                checkDrain();
              });
            }
            if (!canWriteTemp && tempWriteStream) {
              tempWriteStream.once('drain', () => {
                drainedTemp = true;
                checkDrain();
              });
            }
          }
        });

        upstreamRes.on('end', () => {
          if (isOversized) return;
          res.end();

          if (tempWriteStream && !tempWriteStream.destroyed) {
            tempWriteStream.end(() => {
              try {
                fs.renameSync(tempFile, localFile);
              } catch (renameErr) {
                // Best-effort cache: do not fail client response if disk write fails
                console.warn('[cache] Failed to commit cache file:', renameErr.message);
                try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
              }
            });
          }
        });

        upstreamRes.on('error', (err) => {
          if (tempWriteStream && !tempWriteStream.destroyed) tempWriteStream.destroy();
          try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Proxy stream error: ${err.message}`);
          } else if (!res.writableEnded) {
            res.destroy(err);
          }
        });
      }
    );

    upstreamReq.on('timeout', () => {
      upstreamReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Gateway Timeout: Upstream request timed out');
      } else if (!res.writableEnded) {
        res.destroy(new Error('Gateway Timeout'));
      }
    });

    upstreamReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Proxy error: ${err.message}`);
      } else if (!res.writableEnded) {
        res.destroy(err);
      }
    });

    upstreamReq.end();
  });
}

// Auto-start server when run directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const server = createPackageServer();
  server.listen(PORT, () => {
    console.log(`Teeex TeX Live package server running on port ${PORT}`);
    console.log(`Cache directory: ${CACHE_DIR}`);
    console.log(`Upstream: ${UPSTREAM}`);
  });
}
