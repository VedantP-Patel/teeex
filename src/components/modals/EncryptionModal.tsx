import React, { useState } from 'react';
import { X, Lock, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { generateSalt } from '../../services/encryptionService';
import type { ProjectFile } from '../../types/latex';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isEncrypted: boolean;
  encryptionSalt?: string;
  files: ProjectFile[];
  onToggleEncryption: (enabled: boolean, passphrase: string, salt: string) => void;
}

export const EncryptionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  isEncrypted,
  encryptionSalt,
  files,
  onToggleEncryption,
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleApply = async () => {
    setError(null);

    if (!isEncrypted) {
      // Enabling encryption
      if (passphrase.length < 6) {
        setError('Passphrase must be at least 6 characters long.');
        return;
      }
      if (passphrase !== confirmPassphrase) {
        setError('Passphrases do not match.');
        return;
      }

      const salt = encryptionSalt || generateSalt();
      onToggleEncryption(true, passphrase, salt);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1000);
    } else {
      // Disabling encryption
      if (!passphrase) {
        setError('Enter the existing passphrase to decrypt and unlock.');
        return;
      }
      onToggleEncryption(false, passphrase, encryptionSalt || '');
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1000);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={iconBadgeStyle}>
              <Lock size={16} color="#38bdf8" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {isEncrypted ? 'Document Vault: Encrypted' : 'Enable End-to-End Encryption'}
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                Military-Grade AES-256-GCM Zero-Knowledge Manuscript Protection
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            padding: 12,
            backgroundColor: isEncrypted ? 'rgba(16, 185, 129, 0.08)' : 'rgba(56, 189, 248, 0.08)',
            border: `1px solid ${isEncrypted ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.2)'}`,
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
          }}>
            {isEncrypted ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong>Manuscript is encrypted.</strong> File contents are stored as encrypted blobs. To disable encryption or change key, enter your current passphrase.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <ShieldCheck size={16} color="#38bdf8" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  All {files.length} LaTeX files in this project will be encrypted on your device using <strong>AES-256-GCM</strong> with 100,000 rounds of PBKDF2. No unencrypted text is ever stored on the server.
                </div>
              </div>
            )}
          </div>

          {/* Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                {isEncrypted ? 'Current Vault Passphrase' : 'New Encryption Passphrase'}
              </label>
              <input
                type="password"
                placeholder="Enter passphrase..."
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                style={inputStyle}
                autoFocus
              />
            </div>

            {!isEncrypted && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Confirm Passphrase
                </label>
                <input
                  type="password"
                  placeholder="Confirm passphrase..."
                  value={confirmPassphrase}
                  onChange={e => setConfirmPassphrase(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}
          </div>

          {error && (
            <div style={{ fontSize: 11, color: '#f43f5e', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={13} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div style={{ fontSize: 11, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={13} />
              <span>{isEncrypted ? 'Decryption applied successfully!' : 'Encryption enabled!'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface-0)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 11.5 }}>
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="btn-primary"
            style={{
              fontSize: 11.5,
              backgroundColor: isEncrypted ? '#f59e0b' : '#0284c7',
            }}
          >
            {isEncrypted ? 'Disable Encryption' : 'Encrypt Project (AES-256)'}
          </button>
        </div>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  backdropFilter: 'blur(4px)',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-medium)',
  borderRadius: 'var(--radius-md)',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
  width: '100%',
  maxWidth: 480,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '14px 20px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'var(--bg-surface-0)',
};

const iconBadgeStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'rgba(56, 189, 248, 0.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-medium)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};
