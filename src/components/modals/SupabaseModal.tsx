import React, { useState } from 'react';
import { Database, CheckCircle2, X, Cloud, Link2, LogOut, UploadCloud } from 'lucide-react';
import {
  configureSupabase,
  disconnectSupabase,
  isSupabaseConnected
} from '../../services/supabaseClient';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSyncWithCloud: () => void;
}

export const SupabaseModal: React.FC<Props> = ({ isOpen, onClose, onSyncWithCloud }) => {
  const [url, setUrl] = useState(() => localStorage.getItem('teeex_supabase_url') || '');
  const [anonKey, setAnonKey] = useState(() => localStorage.getItem('teeex_supabase_anon_key') || '');
  const [connected, setConnected] = useState(() => isSupabaseConnected());
  const [saveToast, setSaveToast] = useState(false);

  if (!isOpen) return null;

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !anonKey.trim()) return;

    const ok = configureSupabase(url.trim(), anonKey.trim());
    if (ok) {
      setConnected(true);
      onSyncWithCloud();
    }
  };

  const handleConnectDemo = () => {
    const demoUrl = 'https://demo-teeex-latex.supabase.co';
    const demoKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo-anon-key-teeex-studio';
    setUrl(demoUrl);
    setAnonKey(demoKey);
    configureSupabase(demoUrl, demoKey);
    setConnected(true);
    onSyncWithCloud();
  };

  const handleDisconnect = () => {
    disconnectSupabase();
    setConnected(false);
  };

  const handleSaveToCloud = () => {
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={18} color="#10b981" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Supabase Cloud Integration</h2>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {connected ? (
            /* Connected View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={statusBannerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={20} color="#10b981" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#10b981' }}>Connected to Supabase Project</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{url}</div>
                  </div>
                </div>
                <span className="badge badge-emerald">Online</span>
              </div>

              {/* Cloud Capabilities */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={featureBoxStyle}>
                  <Cloud size={16} color="#38bdf8" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>Cloud Persistence</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Auto-saves document snapshots to PostgreSQL</div>
                  </div>
                </div>

                <div style={featureBoxStyle}>
                  <Link2 size={16} color="#a855f7" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>Global Realtime</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Multi-device cursor sync across the globe</div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button
                  onClick={handleSaveToCloud}
                  className="btn-primary"
                  style={{ flex: 1, fontSize: 12 }}
                >
                  <UploadCloud size={14} />
                  {saveToast ? 'Project Synced to Cloud!' : 'Sync Project to Supabase'}
                </button>

                <button
                  onClick={handleDisconnect}
                  className="btn-secondary"
                  style={{ color: 'var(--accent-rose)', fontSize: 12 }}
                >
                  <LogOut size={14} /> Disconnect
                </button>
              </div>
            </div>
          ) : (
            /* Setup Form */
            <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                Connect your Supabase project to enable persistent database storage, figure uploads, and multi-device cloud collaboration.
              </p>

              <div>
                <label style={labelStyle}>SUPABASE PROJECT URL</label>
                <input
                  type="text"
                  placeholder="https://xyzcompany.supabase.co"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12 }}
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>ANON PUBLIC KEY</label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={anonKey}
                  onChange={e => setAnonKey(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12 }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, fontSize: 12 }}>
                  <Database size={13} /> Connect to Supabase
                </button>

                <button
                  type="button"
                  onClick={handleConnectDemo}
                  className="btn-secondary"
                  style={{ fontSize: 12 }}
                  title="Enable zero-config Cloud Mode"
                >
                  <Cloud size={13} color="#38bdf8" /> Try Demo Cloud
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', backgroundColor: 'var(--bg-surface-0)' }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.72)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  animation: 'modalBackdrop 0.2s ease forwards',
};

const modalStyle: React.CSSProperties = {
  width: '560px',
  maxWidth: '92vw',
  backgroundColor: 'var(--bg-surface-1)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-medium)',
  boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.65)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: 'modalContent 0.25s var(--ease-spring) forwards',
};

const headerStyle: React.CSSProperties = {
  padding: '14px 20px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'var(--bg-surface-0)',
};

const closeBtnStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  padding: 4,
  borderRadius: 'var(--radius-sm)',
};

const statusBannerStyle: React.CSSProperties = {
  padding: 12,
  backgroundColor: 'rgba(16, 185, 129, 0.08)',
  border: '1px solid rgba(16, 185, 129, 0.25)',
  borderRadius: 'var(--radius-sm)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const featureBoxStyle: React.CSSProperties = {
  padding: 10,
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: 4,
  letterSpacing: '0.04em',
};
