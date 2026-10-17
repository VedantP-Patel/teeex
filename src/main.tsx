import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/pdf-viewer.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { registerServiceWorker } from './services/serviceWorker'
import { texEngine } from './services/latexCompiler'

// Kick off Service Worker immediately
registerServiceWorker().catch(() => {});

// Idle pre-warm WASM engine and PDF.js so initial frame renders in <200ms
if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  window.requestIdleCallback(() => {
    texEngine.prewarm('pdflatex');
    import('./services/pdfRenderer').then((m) => m.prewarmPdfRenderer()).catch(() => {});
  }, { timeout: 1200 });
} else {
  setTimeout(() => {
    texEngine.prewarm('pdflatex');
    import('./services/pdfRenderer').then((m) => m.prewarmPdfRenderer()).catch(() => {});
  }, 300);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
