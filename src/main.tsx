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

// Pre-warm WASM engine and PDF.js immediately in background worker so initial frame renders in <200ms
if (typeof window !== 'undefined') {
  texEngine.prewarm('pdflatex');
  void import('./services/pdfRenderer').then((m) => m.prewarmPdfRenderer()).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
