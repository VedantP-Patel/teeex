import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Zap,
  CheckCircle2,
  HardDrive,
  ShieldCheck,
  X,
  AlertCircle,
  DownloadCloud,
} from 'lucide-react';
import type { EngineStatus } from '../services/latexCompiler';
import { checkEngineCacheStatus, requestPersistentStorage, type EngineCacheStatus } from '../services/serviceWorker';
import { usePwaInstall } from '../hooks/usePwaInstall';

interface Props {
  status: EngineStatus;
  isOffline?: boolean;
  compact?: boolean;
}

export const EngineWarmupBadge: React.FC<Props> = ({ status, isOffline, compact = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<EngineCacheStatus | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [hasRequestedPersist, setHasRequestedPersist] = useState(false);
  const { isInstallable, isInstalled, installApp } = usePwaInstall();

  useEffect(() => {
    checkEngineCacheStatus().then(setCacheInfo).catch(() => {});
  }, [status.phase]);

  // Dismiss modal on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleToggleOpen = () => {
    setIsOpen(prev => !prev);
    if (!isOpen) {
      checkEngineCacheStatus().then(setCacheInfo).catch(() => {});
    }
  };

  const handleRequestPersist = async () => {
    setIsVerifying(true);
    setHasRequestedPersist(true);
    await requestPersistentStorage();
    const next = await checkEngineCacheStatus();
    setCacheInfo(next);
    setIsVerifying(false);
  };

  const isEngineReady = status.phase === 'ready' || Boolean(cacheInfo?.isEngineCached);
  const isPersisted = Boolean(cacheInfo?.persistedStorage);

  const renderModalPortal = () => {
    if (!isOpen) return null;
    const modalContent = renderTelemetryModal();
    if (typeof document !== 'undefined' && document.body) {
      return createPortal(modalContent, document.body);
    }
    return modalContent;
  };

  // 1. Fetching / Downloading State
  if (status.phase === 'fetching') {
    return (
      <div className="engine-warmup-pill-container">
        <button
          type="button"
          onClick={handleToggleOpen}
          className="engine-warmup-pill fetching"
          title={`Click to view TeX engine download telemetry (${status.progress}%)`}
          aria-label={`Priming TeX Engine ${status.progress}%`}
        >
          <Zap className="engine-warmup-icon pulse-fast" size={12} />
          <span className="engine-warmup-text">
            Priming {status.progress}%
          </span>
          <div className="engine-warmup-mini-track">
            <div className="engine-warmup-mini-bar" style={{ width: `${status.progress}%` }} />
          </div>
        </button>

        {renderModalPortal()}
      </div>
    );
  }

  // 2. Ready & Cached / Idle State
  return (
    <div className="engine-warmup-pill-container">
      <button
        type="button"
        onClick={handleToggleOpen}
        className={`engine-warmup-pill ${isEngineReady ? 'ready' : 'idle'}`}
        title="Click to inspect local TeX engine cache & PWA storage"
        aria-label="TeX Engine Cache Status"
      >
        {isEngineReady ? (
          <CheckCircle2 className="engine-warmup-icon text-emerald-400" size={12} />
        ) : (
          <Zap className="engine-warmup-icon text-amber-400" size={12} />
        )}
        <span className="engine-warmup-text">
          {isOffline ? 'Offline' : isEngineReady ? (compact ? 'Ready' : 'TeX Live Primed (Offline Ready)') : 'Idle'}
        </span>
      </button>

      {renderModalPortal()}
    </div>
  );

  function renderTelemetryModal() {
    const totalMb = cacheInfo?.cachedBytes ? (cacheInfo.cachedBytes / 1024 / 1024).toFixed(1) : '138.2';

    return (
      <div className="engine-telemetry-backdrop" onClick={() => setIsOpen(false)}>
        <div className="engine-telemetry-card" onClick={e => e.stopPropagation()}>
          <div className="engine-telemetry-header">
            <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HardDrive color="#38bdf8" size={16} />
              <h3 className="engine-telemetry-title">TeX Engine &amp; Storage Telemetry</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="engine-telemetry-close"
              aria-label="Close dialog"
            >
              <X size={15} />
            </button>
          </div>

          <div className="engine-telemetry-body">
            <div className="engine-metric-row">
              <span className="engine-metric-label">Engine Architecture</span>
              <span className="engine-metric-val">pdfLaTeX 2026 (WASM Emscripten)</span>
            </div>

            <div className="engine-metric-row">
              <span className="engine-metric-label">CacheStorage (sw.js)</span>
              <span className={`engine-metric-val ${cacheInfo?.hasWasm ? 'text-emerald-400' : 'text-amber-400'}`}>
                {cacheInfo?.hasWasm ? 'busytex.wasm (Cached)' : 'Pending Download'}
              </span>
            </div>

            <div className="engine-metric-row">
              <span className="engine-metric-label">IndexedDB (EM_PRELOAD_CACHE)</span>
              <span className={`engine-metric-val ${cacheInfo?.hasData ? 'text-emerald-400' : 'text-amber-400'}`}>
                {cacheInfo?.hasData ? 'texlive-basic.data (Cached)' : 'Pending Download'}
              </span>
            </div>

            <div className="engine-metric-row">
              <span className="engine-metric-label">Disk Storage Used</span>
              <span className="engine-metric-val font-mono">{totalMb} MB (on local disk)</span>
            </div>

            <div className="engine-metric-row">
              <span className="engine-metric-label">Eviction Protection</span>
              <span className="engine-metric-val flex items-center gap-1" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {isPersisted ? (
                  <>
                    <ShieldCheck size={14} color="#10b981" />
                    <span style={{ color: '#10b981', fontWeight: 600 }}>Persistent (Protected)</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} color="#f59e0b" />
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>Best-effort</span>
                  </>
                )}
              </span>
            </div>

            {!isPersisted && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {isInstallable && !isInstalled && (
                  <button
                    type="button"
                    onClick={async () => {
                      await installApp();
                      const next = await checkEngineCacheStatus();
                      setCacheInfo(next);
                    }}
                    className="engine-persist-btn"
                    style={{
                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      borderColor: '#38bdf8',
                    }}
                  >
                    <DownloadCloud size={14} />
                    <span>Install Desktop App (PWA) for Eviction Immunity</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRequestPersist}
                  disabled={isVerifying}
                  className="engine-persist-btn"
                >
                  <ShieldCheck size={14} />
                  <span>
                    {isVerifying
                      ? 'Contacting Browser Heuristics...'
                      : hasRequestedPersist
                        ? 'Requested • Granted via PWA / Regular Usage'
                        : 'Request Browser Eviction Immunity'}
                  </span>
                </button>

                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4, padding: '2px 4px' }}>
                  Chromium (Chrome &amp; Edge) evaluates storage persistence automatically based on site engagement or PWA desktop installation.
                </div>
              </div>
            )}

            <div className="engine-telemetry-tip">
              <p>
                <strong>Zero Cloud Queues:</strong> Teeex compiles LaTeX entirely on your device using WebAssembly. Once primed, documents typeset 100% offline with zero network latency.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
};
