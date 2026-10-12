// Cloudflare Pages Function: proxies /core/busytex/* from Cloudflare R2
// Keeps large TeX engine assets (*.wasm, *.data) same-origin without bloating the deploy bundle.

interface Env {
  // Bound in Cloudflare Pages dashboard -> Settings -> Functions -> R2 bucket bindings
  TEEEX_ENGINE_BUCKET?: R2Bucket;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  // If R2 bucket is not bound, smoothly fall back to static assets deployed with the site
  if (!context.env?.TEEEX_ENGINE_BUCKET) {
    return context.next();
  }

  const url = new URL(context.request.url);
  // Extract key after /core/busytex/
  const key = url.pathname.replace(/^\/core\/busytex\//, '');

  if (!key) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const object = await context.env.TEEEX_ENGINE_BUCKET.get(key);
    if (!object) {
      // Fallback to static deployment if not found in R2
      return context.next();
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');

    // Handle conditional GET (If-None-Match)
    const clientEtag = context.request.headers.get('if-none-match');
    if (clientEtag && clientEtag === object.httpEtag) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(object.body, { headers });
  } catch (_err) {
    // Graceful fallback on R2 error
    return context.next();
  }
};
