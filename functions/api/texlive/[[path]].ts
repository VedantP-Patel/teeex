// Cloudflare Pages Function: /api/texlive/*
// Edge proxy with global CDN caching for TeX Live on-demand packages and font metrics.

const UPSTREAM_TEXLIVE_BASE = 'https://texlive2026.texlyre.org';

// Exact whitelist of static files actually present in /public/packages/
// Prevents SPA fallback (/* -> /index.html 200) from returning HTML as a TeX package!
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

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const subpath = url.pathname.replace(/^\/api\/texlive\//, '');

  if (!subpath) {
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

  // 1. Only serve from local /packages/ if the file is genuinely in BUNDLED_STATIC_FILES
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
        if (
          filename.endsWith('.cls') ||
          filename.endsWith('.sty') ||
          filename.endsWith('.tex') ||
          filename.endsWith('.def') ||
          filename.endsWith('.fd')
        ) {
          headers.set('Content-Type', 'text/plain; charset=utf-8');
        } else if (filename.endsWith('.tfm')) {
          headers.set('Content-Type', 'application/x-tex-tfm');
        }
        return new Response(localRes.body, { headers });
      }
    } catch {
      // Fall through to upstream
    }
  }

  // 2. Fetch from upstream TeX Live 2026 server with Cloudflare Edge Cache
  const upstreamUrl = `${UPSTREAM_TEXLIVE_BASE}/${subpath}`;

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

    if (upstreamRes.ok && upstreamRes.body) {
      const headers = new Headers(upstreamRes.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Expose-Headers', 'fileid, Content-Length');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

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