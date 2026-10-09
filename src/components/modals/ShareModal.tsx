import React, { useState } from 'react';
import {
  Users,
  Copy,
  Check,
  X,
  Mail,
  UserPlus,
  Shield,
  Edit3,
  Eye,
  Trash2,
  Lock,
  Key,
  RefreshCw,
  ShieldOff,
  Clock
} from 'lucide-react';
import type { Collaborator, ProjectMember, ProjectRole, UserProfile } from '../../types/latex';
import {
  getRoomShareTokens,
  rotateRoomShareTokens,
  revokeRoomShareTokens,
  type RoomShareTokens,
} from '../../services/shareSecurityService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  peers: Collaborator[];
  selfUser: Collaborator;
  currentUser?: UserProfile | null;
  projectMembers?: ProjectMember[];
  onInviteMember?: (email: string, role: ProjectRole) => void;
  onUpdateMemberRole?: (memberId: string, newRole: ProjectRole) => void;
  onRemoveMember?: (memberId: string) => void;
  currentRole?: ProjectRole;
}

export const ShareModal: React.FC<Props> = ({
  isOpen,
  onClose,
  roomId,
  peers,
  selfUser,
  currentUser,
  projectMembers = [],
  onInviteMember,
  onUpdateMemberRole,
  onRemoveMember,
  currentRole = 'owner',
}) => {
  const [copied, setCopied] = useState(false);
  const [linkRole, setLinkRole] = useState<'editor' | 'viewer'>('editor');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('editor');
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [tokensState, setTokensState] = useState<RoomShareTokens>(() => getRoomShareTokens(roomId));
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: 'success' | 'warn' } | null>(null);

  if (!isOpen) return null;

  const activeKey = linkRole === 'editor' ? tokensState.editToken : tokensState.viewToken;
  const currentUrl = tokensState.isRevoked
    ? 'Access Revoked (Generate new keys below to re-enable sharing)'
    : `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}&key=${activeKey}`;

  const handleCopy = () => {
    if (tokensState.isRevoked) return;
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRotateKeys = () => {
    const rotated = rotateRoomShareTokens(roomId, expiresInDays);
    setTokensState(rotated);
    setActionFeedback({
      message: 'Fresh secret keys generated! All previously shared links have been invalidated.',
      type: 'success',
    });
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleRevokeKeys = () => {
    revokeRoomShareTokens(roomId);
    setTokensState(prev => ({ ...prev, isRevoked: true }));
    setActionFeedback({
      message: 'All links revoked. Room is now strictly private.',
      type: 'warn',
    });
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    if (onInviteMember) {
      onInviteMember(inviteEmail.trim(), inviteRole);
    }
    setInviteFeedback(`Invited ${inviteEmail.trim()} as ${inviteRole}.`);
    setInviteEmail('');
    setTimeout(() => setInviteFeedback(null), 3000);
  };

  const getRoleIcon = (role: ProjectRole) => {
    switch (role) {
      case 'owner': return <Shield size={11} color="#38bdf8" />;
      case 'editor': return <Edit3 size={11} color="#10b981" />;
      case 'viewer': return <Eye size={11} color="#f59e0b" />;
    }
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} color="#38bdf8" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Collaboration &amp; Permissions</h2>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '78vh', overflowY: 'auto' }}>
          {/* Share Link Box with Role Picker */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                SHAREABLE ROOM LINK
              </label>

              {/* Permission Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, backgroundColor: 'var(--bg-surface-0)', padding: '2px 4px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => setLinkRole('editor')}
                  style={{
                    ...roleToggleBtnStyle,
                    backgroundColor: linkRole === 'editor' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    color: linkRole === 'editor' ? '#38bdf8' : 'var(--text-muted)',
                  }}
                >
                  <Edit3 size={11} /> Can Edit
                </button>
                <button
                  type="button"
                  onClick={() => setLinkRole('viewer')}
                  style={{
                    ...roleToggleBtnStyle,
                    backgroundColor: linkRole === 'viewer' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                    color: linkRole === 'viewer' ? '#f59e0b' : 'var(--text-muted)',
                  }}
                >
                  <Eye size={11} /> View Only
                </button>
              </div>
            </div>

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
                  color: linkRole === 'viewer' ? '#f59e0b' : '#38bdf8',
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
            <div style={{
              fontSize: 11,
              marginTop: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: linkRole === 'viewer' ? '#f59e0b' : '#38bdf8',
              backgroundColor: linkRole === 'viewer' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(56, 189, 248, 0.08)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-xs)',
              border: `1px solid ${linkRole === 'viewer' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.2)'}`,
            }}>
              {linkRole === 'viewer' ? <Lock size={12} /> : <Key size={12} />}
              <span>
                {tokensState.isRevoked
                  ? 'All capability keys revoked. Collaborators cannot access this room until keys are regenerated.'
                  : linkRole === 'viewer'
                  ? 'Cryptographically sealed view link (vw_...). Viewers cannot elevate to edit access by altering query parameters.'
                  : 'Authoritative edit capability key (ed_...). Anyone with this link has real-time co-authoring & editing privileges.'}
              </span>
            </div>

            {/* Key Rotation & Expiration Controls Strip */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 10,
              paddingTop: 8,
              borderTop: '1px solid var(--border-subtle)',
              fontSize: 11,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                <Clock size={12} />
                <span>Link Expiration:</span>
                <select
                  value={expiresInDays === null ? 'never' : expiresInDays}
                  onChange={(e) => {
                    const val = e.target.value;
                    const days = val === 'never' ? null : parseInt(val, 10);
                    setExpiresInDays(days);
                    const rotated = rotateRoomShareTokens(roomId, days);
                    setTokensState(rotated);
                    setActionFeedback({
                      message: days ? `Expiration set to ${days} days.` : 'Expiration set to Never (permanent).',
                      type: 'success',
                    });
                    setTimeout(() => setActionFeedback(null), 3000);
                  }}
                  style={{
                    backgroundColor: 'var(--bg-surface-0)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    padding: '2px 6px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="never">Never (Permanent)</option>
                  <option value="7">7 Days</option>
                  <option value="30">30 Days</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleRotateKeys}
                  className="btn-ghost"
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    color: '#38bdf8',
                  }}
                  title="Generate new capability keys and invalidate previously shared links"
                >
                  <RefreshCw size={11} /> Rotate Keys
                </button>
                <button
                  type="button"
                  onClick={handleRevokeKeys}
                  className="btn-ghost"
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    color: '#f43f5e',
                  }}
                  title="Revoke all active links immediately"
                >
                  <ShieldOff size={11} /> Revoke Links
                </button>
              </div>
            </div>

            {actionFeedback && (
              <div style={{
                marginTop: 6,
                fontSize: 11,
                padding: '4px 8px',
                borderRadius: 'var(--radius-xs)',
                backgroundColor: actionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                color: actionFeedback.type === 'success' ? '#10b981' : '#f43f5e',
                border: `1px solid ${actionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <Check size={12} />
                <span>{actionFeedback.message}</span>
              </div>
            )}
          </div>

          {/* Email Invite Box (For Owners & Editors) */}
          {currentRole !== 'viewer' && (
            <form onSubmit={handleSendInvite} style={inviteBoxStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <UserPlus size={14} color="#38bdf8" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Invite Collaborator by Email
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                  <Mail size={13} color="var(--text-muted)" style={{ marginLeft: 8 }} />
                  <input
                    type="email"
                    required
                    placeholder="colleague@institution.edu"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    style={{ flex: 1, padding: '7px 10px', fontSize: 12, background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
                  />
                </div>

                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as ProjectRole)}
                  style={roleSelectStyle}
                >
                  <option value="editor">Editor (Can edit)</option>
                  <option value="viewer">Viewer (Read-only)</option>
                </select>

                <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>
                  Invite
                </button>
              </div>

              {inviteFeedback && (
                <div style={{ fontSize: 11, color: '#10b981', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Check size={12} /> {inviteFeedback}
                </div>
              )}
            </form>
          )}

          {/* Project Members & Roles List */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                PROJECT MEMBERS &amp; ROLES ({projectMembers.length > 0 ? projectMembers.length : peers.length + 1})
              </span>
              <span className="badge badge-emerald">
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
                Live Sync
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {projectMembers.length > 0 ? (
                projectMembers.map(m => {
                  const isCurrentSelf = Boolean(
                    (currentUser?.email && m.email?.toLowerCase() === currentUser.email.toLowerCase()) ||
                    (selfUser?.name && m.email?.toLowerCase() === selfUser.name.toLowerCase()) ||
                    (selfUser?.id && m.id === selfUser.id)
                  );
                  const displayName = (isCurrentSelf && currentUser?.fullName)
                    ? currentUser.fullName
                    : m.name;
                  const displayAvatar = (isCurrentSelf && currentUser?.fullName)
                    ? currentUser.fullName.substring(0, 2).toUpperCase()
                    : (m.avatar || displayName.substring(0, 2).toUpperCase());
                  const avatarColor = (isCurrentSelf && currentUser?.avatarColor)
                    ? currentUser.avatarColor
                    : m.avatarColor;

                  return (
                    <div key={m.id} style={peerItemStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ ...avatarStyle, backgroundColor: avatarColor }}>
                          {displayAvatar}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {displayName} {isCurrentSelf && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(You)</span>}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{m.email}</div>
                        </div>
                      </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {currentRole === 'owner' && m.role !== 'owner' && onUpdateMemberRole ? (
                        <select
                          value={m.role}
                          onChange={e => onUpdateMemberRole(m.id, e.target.value as ProjectRole)}
                          style={{ ...roleSelectStyle, padding: '3px 6px', fontSize: 11 }}
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : (
                        <span className={`badge ${m.role === 'owner' ? 'badge-cyan' : m.role === 'editor' ? 'badge-emerald' : ''}`} style={{ fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {getRoleIcon(m.role)}
                          {m.role === 'owner' ? 'Host' : m.role}
                        </span>
                      )}

                      {currentRole === 'owner' && m.role !== 'owner' && onRemoveMember && (
                        <button
                          onClick={() => onRemoveMember(m.id)}
                          className="btn-ghost"
                          style={{ padding: 4, color: '#f43f5e' }}
                          title="Remove collaborator"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
                /* Fallback to peer list */
                <>
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
                      <span className="badge badge-emerald">Editor</span>
                    </div>
                  ))}
                </>
              )}
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
  background: 'none',
  border: 'none',
  cursor: 'pointer',
};

const roleToggleBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: 10.5,
  borderRadius: 'var(--radius-xs)',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontWeight: 600,
  transition: 'all 0.15s ease',
};

const inviteBoxStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 12,
};

const roleSelectStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: 11.5,
  padding: '6px 8px',
  outline: 'none',
  cursor: 'pointer',
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
