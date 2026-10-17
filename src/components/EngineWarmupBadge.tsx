import React, { useState, useEffect } from 'react';
import {
  Zap,
  CheckCircle2,
  HardDrive,
  ShieldCheck,
  X,
  AlertCircle,
} from 'lucide-react';
import type { EngineStatus } from '../services/latexCompiler';
import { checkEngineCacheStatus, requestPersistentStorage, type EngineCacheStatus } from '../services/serviceWorker';

interface Props {
  status: EngineStatus;
  isOffline?: boolean;
  compact?: boolean;
}

export const EngineWarmupBadge: React.FC<Props> = ({ status, isOffline, compact = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<EngineCacheStatus | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    checkEngineCacheStatus().then(setCacheInfo).catch(() => {});
  }, [status.phase]);

  const handleToggleOpen = () => {
    setIsOpen(prev => !prev);
    if (!isOpen) {
      checkEngineCacheStatus().then(setCacheInfo).catch(() => {});
    }
  };

  const handleRequestPersist = async () => {
    setIsVerifying(true);
    await requestPersistentStorage();
    const next = await checkEngineCacheStatus();
    setCacheInfo(next);
    setIsVerifying(false);
  };

  const isEngineReady = status.phase === 'ready' || Boolean(cacheInfo?.isEngineCached);
  const isPersisted = Boolean(cacheInfo?.persistedStorage);

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

        {isOpen && renderTelemetryModal()}
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

      {isOpen && renderTelemetryModal()}
    </div>
  );

  function renderTelemetryModal() {
    const totalMb = cacheInfo?.cachedBytes ? (cacheInfo.cachedBytes / 1024 / 1024).toFixed(1) : '138.2';

    return (
      <div className="engine-telemetry-backdrop" onClick={() => setIsOpen(false)}>
        <div className="engine-telemetry-card" onClick={e => e.stopPropagation()}>
          <div className="engine-telemetry-header">
            <div className="flex items-center gap-2">
              <HardDrive className="text-sky-400" size={16} />
              <h3 className="engine-telemetry-title">TeX Engine & Storage Telemetry</h3>
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
              <span className="engine-metric-val flex items-center gap-1">
                {isPersisted ? (
                  <>
                    <ShieldCheck size={14} className="text-emerald-400" />
                    <span className="text-emerald-400">Persistent (Protected)</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} className="text-amber-400" />
                    <span className="text-amber-400">Best-effort</span>
                  </>
                )}
              </span>
            </div>

            {!isPersisted && (
              <button
                type="button"
                onClick={handleRequestPersist}
                disabled={isVerifying}
                className="engine-persist-btn"
              >
                <ShieldCheck size={14} />
                <span>Request Permanent Eviction-Proof Storage</span>
              </button>
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
