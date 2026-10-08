import React, { useState } from 'react';
import { Users, Copy, Check, ExternalLink, X } from 'lucide-react';
import type { Collaborator } from '../../types/latex';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  peers: Collaborator[];
  selfUser: Collaborator;
}

export const ShareModal: React.FC<Props> = ({ isOpen, onClose, roomId, peers, selfUser }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentUrl = window.location.origin + window.location.pathname + `?room=${roomId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openNewTab = () => {
    window.open(currentUrl, '_blank');
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} color="#38bdf8" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Collaborative Room & Invite</h2>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Share Link Box */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              PROJECT SHARE LINK
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                readOnly
                value={currentUrl}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: '#38bdf8',
                  backgroundColor: 'var(--bg-surface-0)',
                }}
              />
              <button
                onClick={handleCopy}
                className="btn-primary"
                style={{ minWidth: 100, fontSize: 12 }}
              >
                {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
              </button>
            </div>
          </div>

          {/* Instant Multi-Tab Test Button */}
          <div style={{
            backgroundColor: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#38bdf8' }}>Test Live Collaboration Now</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Open this room in a second window side-by-side to watch real-time sync in action.
              </div>
            </div>
            <button onClick={openNewTab} className="btn-secondary" style={{ fontSize: 12 }}>
              <ExternalLink size={13} /> Open Tab
            </button>
          </div>

          {/* Active Collaborators */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                ACTIVE PARTICIPANTS ({peers.length + 1})
              </span>
              <span className="badge badge-emerald">
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
                Live CRDT Sync
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
              {/* You */}
              <div style={peerItemStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ ...avatarStyle, backgroundColor: selfUser.color }}>
                    {selfUser.avatar}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {selfUser.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(You)</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Editing {selfUser.activeFile}</div>
                  </div>
                </div>
                <span className="badge badge-cyan">Host</span>
              </div>

              {/* Peers */}
              {peers.map(p => (
                <div key={p.id} style={peerItemStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ ...avatarStyle, backgroundColor: p.color }}>
                      {p.avatar}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        Line {p.cursorLine} &bull; {p.status === 'typing' ? 'Typing...' : 'Viewing'}
                      </div>
                    </div>
                  </div>
                  <span className="badge" style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-secondary)' }}>
                    Editor
                  </span>
                </div>
              ))}
            </div>
          </div>
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
  width: '540px',
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

const peerItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 10px',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
};

const avatarStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: 11,
};
