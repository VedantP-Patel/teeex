import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/pdf-viewer.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { registerServiceWorker } from './registerSw'
import { texEngine } from './services/latexCompiler'
import { prewarmPdfRenderer } from './services/pdfRenderer'

// Kick off Service Worker, TeX engine download, and PDF.js worker off the main thread immediately
registerServiceWorker()
texEngine.prewarm('pdflatex')
prewarmPdfRenderer()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

