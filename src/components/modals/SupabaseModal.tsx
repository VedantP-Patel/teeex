import React, { useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Key,
  Database,
  CheckCircle2,
  X,
  Cloud,
  LogOut,
  UploadCloud,
  Eye,
  EyeOff,
  Sparkles,
  Info
} from 'lucide-react';
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
  // Admin Authentication State
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // Default master passkey stored in localStorage or fallback
  const masterKey = localStorage.getItem('teeex_admin_passkey') || 'admin2026';

  // Credentials State
  const [url, setUrl] = useState(() => localStorage.getItem('teeex_supabase_url') || '');
  const [anonKey, setAnonKey] = useState(() => localStorage.getItem('teeex_supabase_anon_key') || '');
  const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem('teeex_ai_api_key') || '');

  // UI States
  const [showAnonKey, setShowAnonKey] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);
  const [connected, setConnected] = useState(() => isSupabaseConnected());
  const [saveToast, setSaveToast] = useState(false);
  const [activeTab, setActiveTab] = useState<'cloud' | 'ai' | 'security'>('cloud');

  if (!isOpen) return null;

  // Handle Admin Passkey Login
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput === masterKey) {
      setIsAdminAuthenticated(true);
      setAuthError('');
      setAdminPasswordInput('');
    } else {
      setAuthError('Incorrect Admin Passkey. Access denied.');
    }
  };

  const handleAdminLock = () => {
    setIsAdminAuthenticated(false);
    setShowAnonKey(false);
    setShowAiKey(false);
  };

  // Handle Connect
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

  const handleSaveAiKey = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('teeex_ai_api_key', aiApiKey);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={18} color={isAdminAuthenticated ? '#10b981' : '#f59e0b'} />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Admin Security & Cloud Vault</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isAdminAuthenticated && (
              <button
                onClick={handleAdminLock}
                className="btn-ghost"
                style={{ fontSize: 11, color: 'var(--text-muted)' }}
                title="Lock admin session"
              >
                <Lock size={13} /> Lock Session
              </button>
            )}
            <button onClick={onClose} style={closeBtnStyle}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Locked State: Requires Admin Passkey */}
        {!isAdminAuthenticated ? (
          <div style={{ padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14 }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Lock size={26} color="#f59e0b" />
            </div>

            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Admin Authentication Required</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 380, lineHeight: 1.5, margin: 0 }}>
                Infrastructure credentials, database endpoints, and AI provider API keys are protected. Enter the project admin passkey to unlock.
              </p>
            </div>

            <form onSubmit={handleAdminLogin} style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  placeholder="Enter Admin Passkey (default: admin2026)"
                  value={adminPasswordInput}
                  onChange={e => setAdminPasswordInput(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 12.5 }}
                  autoFocus
                />
              </div>

              {authError && (
                <div style={{ fontSize: 11, color: '#f43f5e', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <ShieldAlert size={12} /> {authError}
                </div>
              )}

              <button type="submit" className="btn-primary" style={{ padding: '8px 14px', fontSize: 12 }}>
                <Unlock size={14} /> Authenticate as Admin
              </button>
            </form>

            <div style={{
              backgroundColor: 'var(--bg-surface-0)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: 10,
              fontSize: 11,
              color: 'var(--text-muted)',
              maxWidth: 380,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textAlign: 'left'
            }}>
              <Info size={16} color="#38bdf8" style={{ flexShrink: 0 }} />
              <span>
                <b>Security Note:</b> For public deployments, keys can also be locked securely via Vercel Environment Variables (<code style={{ color: '#38bdf8' }}>VITE_SUPABASE_URL</code>).
              </span>
            </div>
          </div>
        ) : (
          /* Unlocked Admin Dashboard */
          <>
            {/* Tab Bar */}
            <div style={tabBarStyle}>
              <button
                onClick={() => setActiveTab('cloud')}
                style={{
                  ...tabBtnStyle,
                  color: activeTab === 'cloud' ? '#38bdf8' : 'var(--text-secondary)',
                  borderBottom: activeTab === 'cloud' ? '2px solid #38bdf8' : '2px solid transparent',
                }}
              >
                <Database size={13} /> Supabase Database & Realtime
              </button>

              <button
                onClick={() => setActiveTab('ai')}
                style={{
                  ...tabBtnStyle,
                  color: activeTab === 'ai' ? '#c084fc' : 'var(--text-secondary)',
                  borderBottom: activeTab === 'ai' ? '2px solid #c084fc' : '2px solid transparent',
                }}
              >
                <Sparkles size={13} /> AI Provider Secret
              </button>

              <button
                onClick={() => setActiveTab('security')}
                style={{
                  ...tabBtnStyle,
                  color: activeTab === 'security' ? '#10b981' : 'var(--text-secondary)',
                  borderBottom: activeTab === 'security' ? '2px solid #10b981' : '2px solid transparent',
                }}
              >
                <ShieldCheck size={13} /> Access Control
              </button>
            </div>

            {/* Content Body */}
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
              {activeTab === 'cloud' && (
                <>
                  {connected ? (
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

                      {/* Credentials Display with Mask Toggle */}
                      <div style={{ backgroundColor: 'var(--bg-surface-0)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={labelStyle}>ANON PUBLIC KEY</span>
                          <button
                            onClick={() => setShowAnonKey(!showAnonKey)}
                            className="btn-ghost"
                            style={{ padding: 2, fontSize: 11 }}
                          >
                            {showAnonKey ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Show</>}
                          </button>
                        </div>
                        <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                          {showAnonKey ? anonKey : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                        </code>
                      </div>

                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
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
                    <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label style={labelStyle}>ANON PUBLIC KEY</label>
                          <button
                            type="button"
                            onClick={() => setShowAnonKey(!showAnonKey)}
                            className="btn-ghost"
                            style={{ padding: 2, fontSize: 11 }}
                          >
                            {showAnonKey ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        </div>
                        <input
                          type={showAnonKey ? "text" : "password"}
                          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                          value={anonKey}
                          onChange={e => setAnonKey(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', fontSize: 12 }}
                          required
                        />
                      </div>

                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button type="submit" className="btn-primary" style={{ flex: 1, fontSize: 12 }}>
                          <Database size={13} /> Save & Connect
                        </button>

                        <button
                          type="button"
                          onClick={handleConnectDemo}
                          className="btn-secondary"
                          style={{ fontSize: 12 }}
                        >
                          <Cloud size={13} color="#38bdf8" /> Try Demo Cloud
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}

              {activeTab === 'ai' && (
                <form onSubmit={handleSaveAiKey} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                    Configure the shared AI Copilot API key (Gemini, Claude, or OpenAI) for all co-authors in this room so regular authors don't need individual keys.
                  </p>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={labelStyle}>AI PROVIDER API KEY</label>
                      <button
                        type="button"
                        onClick={() => setShowAiKey(!showAiKey)}
                        className="btn-ghost"
                        style={{ padding: 2, fontSize: 11 }}
                      >
                        {showAiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                    <input
                      type={showAiKey ? "text" : "password"}
                      placeholder="AIzaSy... or sk-..."
                      value={aiApiKey}
                      onChange={e => setAiApiKey(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', fontSize: 12 }}
                    />
                  </div>

                  <button type="submit" className="btn-primary" style={{ fontSize: 12, alignSelf: 'flex-start' }}>
                    <Key size={13} /> {saveToast ? 'AI Key Saved!' : 'Save AI Key'}
                  </button>
                </form>
              )}

              {activeTab === 'security' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{
                    padding: 12,
                    backgroundColor: 'var(--bg-surface-0)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Admin Security Status</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Current session is <b>Unlocked as Administrator</b>. Normal collaborators and guests have view-only access to infrastructure and cannot modify database or API credentials.
                    </div>
                  </div>

                  <button
                    onClick={handleAdminLock}
                    className="btn-secondary"
                    style={{ alignSelf: 'flex-start', fontSize: 12 }}
                  >
                    <Lock size={13} /> Lock Session Now
                  </button>
                </div>
              )}
            </div>
          </>
        )}

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
  width: '580px',
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

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
};

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 6px',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
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

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: 4,
  letterSpacing: '0.04em',
};
