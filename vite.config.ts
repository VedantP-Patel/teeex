import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function buildConnectSrc(): string {
  const allowed = new Set<string>([
    "'self'",
    'blob:',
    'https://texlive2026.texlyre.org',
    'https://*.supabase.co',
    'wss://*.supabase.co',
  ]);

  const customRemote = process.env.VITE_TEXLIVE_REMOTE_ENDPOINT;
  if (customRemote && customRemote !== 'off') {
    try {
      const url = new URL(customRemote);
      allowed.add(url.origin);
    } catch {
      // Ignore invalid URL formatting
    }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      allowed.add(url.origin);
      if (url.protocol === 'https:') {
        allowed.add(`wss://${url.host}`);
      }
    } catch {
      // Ignore invalid URL formatting
    }
  }

  return Array.from(allowed).join(' ');
}

function getCsp(): string {
  const connectSrc = buildConnectSrc();
  return `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src ${connectSrc}; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`;
}

function cspHeadersPlugin(): Plugin {
  return {
    name: 'csp-headers-generator',
    closeBundle() {
      const rootDir = import.meta.dirname || __dirname;
      const distHeaders = resolve(rootDir, 'dist', '_headers');
      if (existsSync(distHeaders)) {
        let content = readFileSync(distHeaders, 'utf8');
        const cspLine = `  Content-Security-Policy: ${getCsp()}`;
        content = content.replace(/^[ \t]*Content-Security-Policy:.*$/m, cspLine);
        writeFileSync(distHeaders, content, 'utf8');
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), cspHeadersPlugin()],
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
  server: {
    proxy: {
      '/api/texlive': {
        target:
          process.env.VITE_TEXLIVE_REMOTE_ENDPOINT &&
          process.env.VITE_TEXLIVE_REMOTE_ENDPOINT !== 'off'
            ? process.env.VITE_TEXLIVE_REMOTE_ENDPOINT
            : 'https://texlive2026.texlyre.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/texlive/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/pdfjs-dist')) {
            return 'pdfjs';
          }
          if (
            id.includes('node_modules/@codemirror') ||
            id.includes('node_modules/codemirror') ||
            id.includes('node_modules/@lezer')
          ) {
            return 'codemirror';
          }
          if (
            id.includes('node_modules/yjs') ||
            id.includes('node_modules/y-codemirror.next') ||
            id.includes('node_modules/y-protocols') ||
            id.includes('node_modules/lib0')
          ) {
            return 'yjs-collab';
          }
          if (id.includes('node_modules/jszip')) {
            return 'jszip';
          }
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
   * Mirror the production Content-Security-Policy (_headers) on `vite preview`
   * so the built app is served under the same policy it faces in production.
   */
  preview: {
    headers: {
      'Content-Security-Policy': getCsp(),
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
