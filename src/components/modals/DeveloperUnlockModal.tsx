import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  X,
  Code,
  Database,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  isPlatformDeveloper,
  unlockPlatformDeveloper,
  lockPlatformDeveloper,
  isDemoModeEnabled,
  setDemoModeEnabled,
} from '../../services/developerService';

interface DeveloperUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeveloperStatusChanged: () => void;
  onOpenVault: () => void;
}

export const DeveloperUnlockModal: React.FC<DeveloperUnlockModalProps> = ({
  isOpen,
  onClose,
  onDeveloperStatusChanged,
  onOpenVault,
}) => {
  const [passcode, setPasscode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isDev = isPlatformDeveloper();
  const demoActive = isDemoModeEnabled();

  if (!isOpen) return null;

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;

    const res = unlockPlatformDeveloper(passcode);
    if (res.success) {
      setErrorMessage(null);
      setSuccessMessage('Website Developer Clearance Verified!');
      setPasscode('');
      onDeveloperStatusChanged();
      setTimeout(() => setSuccessMessage(null), 2500);
    } else {
      setErrorMessage(res.error || 'Invalid developer passcode');
    }
  };

  const handleLock = () => {
    lockPlatformDeveloper();
    onDeveloperStatusChanged();
    setSuccessMessage('Developer privileges locked.');
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const handleToggleDemoMode = () => {
    setDemoModeEnabled(!demoActive);
    onDeveloperStatusChanged();
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                padding: 7,
                borderRadius: 'var(--radius-sm)',
                backgroundColor: isDev ? 'rgba(16, 185, 129, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isDev ? <ShieldCheck size={18} color="#10b981" /> : <Lock size={18} color="#38bdf8" />}
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {isDev ? 'Website Developer & Owner Console' : 'Platform Developer Access'}
              </h2>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                {isDev
                  ? 'Super-Admin clearance active • Infrastructure & Dev tools unlocked'
                  : 'Restricted to Teeex website creator & platform administrator'}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Security Notice */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              fontSize: 11.5,
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={14} color="#f59e0b" />
              Role Privilege Separation
            </div>
            <span>
              <strong>Project Owners</strong> manage their papers and co-authors. Sensitive items (Supabase Cloud Vault, API keys, database schema migrations, and test accounts) are reserved strictly for the <strong>Website Developer / Platform Owner</strong>.
            </span>
          </div>

          {/* Feedback messages */}
          {errorMessage && (
            <div style={errorBannerStyle}>
              <AlertCircle size={14} color="#f43f5e" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div style={successBannerStyle}>
              <CheckCircle2 size={14} color="#10b981" />
              <span>{successMessage}</span>
            </div>
          )}

          {isDev ? (
            /* Unlocked Developer Controls */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                DEVELOPER PRIVILEGES ACTIVE
              </div>

              {/* Action: Open Supabase Vault */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenVault();
                }}
                className="btn-primary"
                style={{ height: 40, justifyContent: 'flex-start', padding: '0 14px', gap: 10 }}
              >
                <Database size={15} />
                <div style={{ textAlign: 'left', flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Open Cloud &amp; Database Vault</div>
                  <div style={{ fontSize: 10, opacity: 0.8 }}>Manage Supabase URL, anon key, and SQL migrations</div>
                </div>
              </button>

              {/* Action: Toggle Demo Accounts Switcher */}
              <button
                type="button"
                onClick={handleToggleDemoMode}
                className="btn-secondary"
                style={{ height: 40, justifyContent: 'flex-start', padding: '0 14px', gap: 10 }}
              >
                <Code size={15} color={demoActive ? '#10b981' : 'var(--text-secondary)'} />
                <div style={{ textAlign: 'left', flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    Developer Test Switcher in Auth: {demoActive ? 'VISIBLE' : 'HIDDEN'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {demoActive ? 'Demo accounts visible in Sign In dialog' : 'Clean login form shown to public users'}
                  </div>
                </div>
                <span className={`badge ${demoActive ? 'badge-emerald' : ''}`} style={{ fontSize: 10 }}>
                  {demoActive ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* Lock Button */}
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleLock}
                  className="btn-ghost"
                  style={{ color: '#f43f5e', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Lock size={13} />
                  <span>Lock Developer Mode</span>
                </button>
              </div>
            </div>
          ) : (
            /* Passcode Unlock Form */
            <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  ENTER DEVELOPER PASSCODE
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    placeholder="Enter website owner passcode"
                    value={passcode}
                    onChange={e => {
                      setPasscode(e.target.value);
                      setErrorMessage(null);
                    }}
                    autoFocus
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 12px 0 34px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-surface-0)',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                  <KeyRound size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 11, top: 12 }} />
                </div>
              </div>

              <button
                type="submit"
                disabled={!passcode.trim()}
                className="btn-primary"
                style={{ height: 38, fontSize: 12.5, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
              >
                <Unlock size={14} /> Unlock Developer Privileges
              </button>
            </form>
          )}
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
  backdropFilter: 'blur(5px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 105,
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 460,
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'var(--bg-surface-0)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 'var(--radius-sm)',
  display: 'flex',
};

const errorBannerStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'rgba(244, 63, 94, 0.1)',
  border: '1px solid rgba(244, 63, 94, 0.25)',
  color: '#f43f5e',
  fontSize: 11.5,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const successBannerStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'rgba(16, 185, 129, 0.1)',
  border: '1px solid rgba(16, 185, 129, 0.25)',
  color: '#10b981',
  fontSize: 11.5,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
