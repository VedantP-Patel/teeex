import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    /**
     * Both of these ship their own workers and WASM and resolve sibling assets
     * at runtime; dependency pre-bundling rewrites those paths and breaks the
     * lookups.
     */
    exclude: ['texlyre-busytex', 'pdfjs-dist'],
  },
  /**
   * The TeX engine (`/core/busytex/*`) and PDF.js CMaps (`/pdfjs/*`) are served
   * from `public/`, provisioned by the prebuild scripts.
   *
   * There is deliberately no dev proxy to a third-party host here. The engine's
   * Web Worker must be same-origin — browsers refuse cross-origin worker
   * scripts — so proxying was the only way to use a remote origin, and it made
   * local development depend on someone else's GitHub Pages site staying up at
   * an exact path. Self-hosting a version-pinned subset removes that.
   */
  assetsInclude: ['**/*.wasm'],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/katex')) {
            return 'katex';
          }
          if (id.includes('node_modules/@supabase')) {
            return 'supabase';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'lucide';
          }
          if (id.includes('src/services/latexParser') || id.includes('src/services/visualLatexParser')) {
            return 'latex-parsers';
          }
        },
      },
    },
  },
  /**
   * Mirror the production Content-Security-Policy (vercel.json / _headers) on `vite
   * preview` so the built app is served under the same policy it will face in
   * production, and CSP breakage is caught here rather than after deploy. NOT
   * applied to the dev server, whose HMR needs inline scripts the prod policy
   * forbids. Keep this string in sync with vercel.json and _headers.
   */
  preview: {
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' blob: https://texlive2026.texlyre.org https://*.railway.app https://*.up.railway.app https://*.onrender.com https://*.fly.dev https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    },
  },
  define: {
    // Map Vercel's native Supabase integration variables, which are not
    // VITE_-prefixed and so are not picked up by Vite's own env handling.
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      ''
    ),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
    ),
  },
});
