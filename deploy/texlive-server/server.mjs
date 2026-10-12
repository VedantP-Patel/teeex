import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 8080;
const CACHE_DIR = process.env.CACHE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'cache');
const UPSTREAM = (process.env.UPSTREAM_URL || 'https://texlive2026.texlyre.org').replace(/\/+$/, '');

fs.mkdirSync(CACHE_DIR, { recursive: true });

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/health' || pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'teeex-texlive-server', upstream: UPSTREAM }));
    return;
  }

  // Prevent path traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const localFile = path.join(CACHE_DIR, safePath);

  // Serve from local disk cache if available
  if (fs.existsSync(localFile) && fs.statSync(localFile).isFile()) {
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Cache': 'HIT',
    });
    fs.createReadStream(localFile).pipe(res);
    return;
  }

  // Fetch from upstream and cache locally
  const upstreamUrl = `${UPSTREAM}${pathname}`;
  https.get(upstreamUrl, (upstreamRes) => {
    if (upstreamRes.statusCode === 200) {
      fs.mkdirSync(path.dirname(localFile), { recursive: true });
      const fileStream = fs.createWriteStream(localFile);
      res.writeHead(200, {
        'Content-Type': upstreamRes.headers['content-type'] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Cache': 'MISS',
      });
      upstreamRes.pipe(fileStream);
      upstreamRes.pipe(res);
    } else {
      res.writeHead(upstreamRes.statusCode || 404);
      res.end(`Upstream returned ${upstreamRes.statusCode}`);
    }
  }).on('error', (err) => {
    res.writeHead(502);
    res.end(`Proxy error: ${err.message}`);
  });
});

server.listen(PORT, () => {
  console.log(`Teeex TeX Live package server running on port ${PORT}`);
  console.log(`Cache directory: ${CACHE_DIR}`);
  console.log(`Upstream: ${UPSTREAM}`);
});
