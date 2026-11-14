// Cloudflare Pages Function: /api/texlive/*
// Edge proxy with global CDN Cache API for TeX Live on-demand packages and font metrics.

const UPSTREAM_TEXLIVE_BASE = 'https://texlive2026.texlyre.org';

const BUNDLED_STATIC_FILES = new Set([
  'IEEEtran.cls',
  'acmart.cls',
  'algorithm.sty',
  'algorithmic.sty',
  'algpseudocode.sty',
  'array.sty',
  'bm.sty',
  'booktabs.sty',
  'caption.sty',
  'caption3.sty',
  'cite.sty',
  'colortbl.sty',
  'enumitem.sty',
  'everysel.sty',
  'fancyhdr.sty',
  'float.sty',
  'hypcap.sty',
  'listings.sty',
  'longtable.sty',
  'microtype-pdftex.def',
  'microtype.sty',
  'msam10.tfm',
  'msam5.tfm',
  'msam7.tfm',
  'msbm10.tfm',
  'msbm5.tfm',
  'msbm7.tfm',
  'multicol.sty',
  'multirow.sty',
  'omlptm.fd',
  'omsptm.fd',
  'ot1ptm.fd',
  'pcrr7t.tfm',
  'phvr7t.tfm',
  'ptmb7t.tfm',
  'ptmr7t.tfm',
  'ptmrc7t.tfm',
  'ptmri7t.tfm',
  'ptmro7t.tfm',
  'ragged2e.sty',
  'setspace.sty',
  'sn-basic.bst',
  'sn-jnl.cls',
  'subcaption.sty',
  't1ptm.fd',
  'tabularx.sty',
  'tfrupee.sty',
  'tfrupee.tfm',
  'titlesec.sty',
  'wrapfig.sty',
  'xcolor.sty',
]);

function resolveTexContentType(path: string): string | null {
  if (
    path.endsWith('.cls') ||
    path.endsWith('.sty') ||
    path.endsWith('.tex') ||
    path.endsWith('.def') ||
    path.endsWith('.fd') ||
    path.endsWith('.bst')
  ) {
    return 'text/plain; charset=utf-8';
  }
  if (path.endsWith('.tfm')) {
    return 'application/x-tex-tfm';
  }
  if (
    path.endsWith('.vf') ||
    path.endsWith('.pfb') ||
    path.endsWith('.otf') ||
    path.endsWith('.ttf')
  ) {
    return 'application/octet-stream';
  }
  return null;
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const subpath = url.pathname.replace(/^\/api\/texlive\//, '');

  if (!subpath || subpath.includes('..')) {
    return new Response('Not Found', { status: 404 });
  }

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

  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const edgeCache = (caches as unknown as { default?: Cache }).default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });

  // 0. Instant Cloudflare PoP Edge Cache check
  if (edgeCache) {
    const cachedHit = await edgeCache.match(cacheKey);
    if (cachedHit) {
      return context.request.method === 'HEAD'
        ? new Response(null, { status: cachedHit.status, headers: cachedHit.headers })
        : cachedHit;
    }
  }

  // 1. Serve from local /packages/ if present in BUNDLED_STATIC_FILES
  const filename = decodeURIComponent(subpath.slice(subpath.lastIndexOf('/') + 1));
  if (filename && BUNDLED_STATIC_FILES.has(filename)) {
    try {
      const packageUrl = new URL(`/packages/${encodeURIComponent(filename)}`, url.origin);
      const localRes = await fetch(packageUrl.toString());
      const contentType = localRes.headers.get('content-type') || '';
      if (localRes.ok && localRes.body && !contentType.includes('text/html')) {
        const headers = new Headers(localRes.headers);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Expose-Headers', 'fileid, Content-Length');
        headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
        const forcedCt = resolveTexContentType(filename);
        if (forcedCt) headers.set('Content-Type', forcedCt);

        const response = new Response(localRes.body, { status: 200, headers });
        if (edgeCache) {
          context.waitUntil(edgeCache.put(cacheKey, response.clone()));
        }
        return context.request.method === 'HEAD'
          ? new Response(null, { status: 200, headers })
          : response;
      }
    } catch {
      // Fall through to upstream
    }
  }

  // 2. Fetch from upstream TeX Live server with HTML poison guard + Edge Cache persistence
  const upstreamBase =
    ((context.env as Record<string, unknown>)?.VITE_TEXLIVE_REMOTE_ENDPOINT as string) ||
    ((context.env as Record<string, unknown>)?.TEXLIVE_REMOTE_ENDPOINT as string) ||
    UPSTREAM_TEXLIVE_BASE;
  const upstreamUrl = `${upstreamBase.replace(/\/+$/, '')}/${subpath}`;

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Teeex-Edge-Proxy/2.0',
        'Accept': '*/*',
      },
      cf: {
        cacheTtl: 31536000,
        cacheEverything: true,
      },
    });

    const upstreamCt = upstreamRes.headers.get('content-type') || '';
    if (upstreamRes.ok && upstreamRes.body && !upstreamCt.includes('text/html')) {
      const headers = new Headers(upstreamRes.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Expose-Headers', 'fileid, Content-Length');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      const forcedCt = resolveTexContentType(subpath);
      if (forcedCt) headers.set('Content-Type', forcedCt);

      const response = new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers,
      });
      if (edgeCache) {
        context.waitUntil(edgeCache.put(cacheKey, response.clone()));
      }
      return context.request.method === 'HEAD'
        ? new Response(null, { status: upstreamRes.status, headers })
        : response;
    }

    if (upstreamRes.status === 404) {
      const notFoundRes = new Response('Not Found', {
        status: 404,
        headers: {
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
      if (edgeCache) {
        context.waitUntil(edgeCache.put(cacheKey, notFoundRes.clone()));
      }
      return notFoundRes;
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