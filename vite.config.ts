import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: {
    // Use ES module format for workers to allow modern imports
    format: 'es',
  },
  optimizeDeps: {
    // Exclude texlyre-busytex from pre-bundling — it serves WASM assets
    exclude: ['texlyre-busytex', 'pdfjs-dist'],
  },
  server: {
    proxy: {
      '/core/busytex': {
        target: 'https://texlyre.github.io/texlyre-busytex/core/busytex',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/core\/busytex/, ''),
      },
    },
  },
  assetsInclude: ['**/*.wasm'],
  define: {
    // Automatically map Vercel's native Supabase integration environment variables
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
