// Cloudflare Pages Function: /api/texlive/*
// Edge proxy with global CDN caching for TeX Live on-demand packages and font metrics.
// Upstream: https://texlive2026.texlyre.org/<format>/<filename>

const UPSTREAM_TEXLIVE_BASE = 'https://texlive2026.texlyre.org';

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  // Extract path after /api/texlive/
  const subpath = url.pathname.replace(/^\/api\/texlive\//, '');

  if (!subpath) {
    return new Response('Not Found', { status: 404 });
  }

  // Handle CORS preflight if any
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const upstreamUrl = `${UPSTREAM_TEXLIVE_BASE}/${subpath}`;

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Teeex-Edge-Proxy/1.0',
        'Accept': '*/*',
      },
      cf: {
        // Cache successful package responses at the edge for 1 year
        cacheTtl: 31536000,
        cacheEverything: true,
      },
    });

    if (upstreamRes.ok && upstreamRes.body) {
      const headers = new Headers(upstreamRes.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Expose-Headers', 'fileid, Content-Length');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

      // Ensure appropriate MIME type based on file extension
      if (
        subpath.endsWith('.cls') ||
        subpath.endsWith('.sty') ||
        subpath.endsWith('.tex') ||
        subpath.endsWith('.def') ||
        subpath.endsWith('.fd')
      ) {
        headers.set('Content-Type', 'text/plain; charset=utf-8');
      } else if (
        subpath.endsWith('.tfm') ||
        subpath.endsWith('.vf') ||
        subpath.endsWith('.pfb') ||
        subpath.endsWith('.otf') ||
        subpath.endsWith('.ttf')
      ) {
        headers.set('Content-Type', 'application/octet-stream');
      }

      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers,
      });
    }

    if (upstreamRes.status === 404) {
      // Cache 404 at edge for 24h to prevent repeated roundtrips for font probes
      return new Response('Not Found', {
        status: 404,
        headers: {
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(`Upstream error: ${upstreamRes.statusText}`, {
      status: upstreamRes.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(`Proxy error: ${err instanceof Error ? err.message : String(err)}`, {
      status: 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};
