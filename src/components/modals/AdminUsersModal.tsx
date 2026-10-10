import React, { useState, useEffect } from 'react';
import {
  X,
  UserCheck,
  UserX,
  Shield,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  RotateCcw,
  Loader2,
  Search,
} from 'lucide-react';
import type { UserProfile } from '../../types/latex';
import {
  getLocalRegisteredUsers,
  approveLocalUser,
  rejectLocalUser,
  getApprovedEmails,
  markUserAsApproved,
  markUserAsRejected,
} from '../../services/authService';
import { getSupabaseClient, isSupabaseConnected } from '../../services/supabaseClient';
import { isPlatformDeveloper } from '../../services/developerService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
}

export const AdminUsersModal: React.FC<Props> = ({ isOpen, onClose, currentUser }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const isDev = isPlatformDeveloper();

  const loadUsers = async () => {
    setIsLoading(true);
    const approvedSet = getApprovedEmails();

    try {
      if (isSupabaseConnected()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data, error } = await supabase.from('profiles').select('*');
          if (!error && data && data.length > 0) {
            setUsers(
              data.map(d => {
                const emailNorm = (d.email || '').toLowerCase().trim();
                const isApproved = d.is_approved === true || approvedSet.has(emailNorm);
                return {
                  id: d.id,
                  email: d.email,
                  fullName: d.full_name || emailNorm.split('@')[0],
                  avatarColor: d.avatar_color || '#38bdf8',
                  isAdmin: d.is_admin === true,
                  isApproved,
                };
              })
            );
            return;
          }
        }
      }

      // Local fallback
      const localUsers = getLocalRegisteredUsers();
      setUsers(
        localUsers.map(u => ({
          ...u,
          isApproved: u.isApproved === true || approvedSet.has((u.email || '').toLowerCase().trim()),
        }))
      );
    } catch (e) {
      console.warn('Failed to load users in admin modal:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  if (!isOpen || (!currentUser?.isAdmin && !isDev)) return null;

  const q = searchQuery.toLowerCase().trim();
  const filteredUsers = users.filter(u => {
    if (!q) return true;
    return (
      (u.fullName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

  const pendingUsers = filteredUsers.filter(u => !u.isApproved && !u.isAdmin);
  const approvedUsers = filteredUsers.filter(u => u.isApproved && !u.isAdmin);

  const handleApprove = async (user: UserProfile) => {
    setProcessingId(user.id);
    setStatusMessage(null);

    // 1. Instant optimistic state update
    setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, isApproved: true } : u)));

    // 2. Persist to local & approval cache
    markUserAsApproved(user.email);
    approveLocalUser(user.email);

    // 3. Supabase cloud sync
    let cloudSynced = false;
    if (isSupabaseConnected()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .update({ is_approved: true, updated_at: new Date().toISOString() })
            .eq('id', user.id)
            .select();

          if (!error && data && data.length > 0) {
            cloudSynced = true;
          } else {
            // Fallback match by email
            const { data: byEmailData } = await supabase
              .from('profiles')
              .update({ is_approved: true, updated_at: new Date().toISOString() })
              .eq('email', user.email)
              .select();
            if (byEmailData && byEmailData.length > 0) {
              cloudSynced = true;
            }
          }
        } catch (e) {
          console.warn('Direct Supabase update error:', e);
        }

        // Try RPC if schema has security definer approve_profile
        try {
          const { error: rpcErr } = await supabase.rpc('approve_profile', { target_user_id: user.id });
          if (!rpcErr) cloudSynced = true;
        } catch {
          // ignore
        }
      }
    }

    setProcessingId(null);
    setStatusMessage({
      type: 'success',
      text: `${user.fullName || user.email} approved! Granted full access${cloudSynced ? ' (Cloud synced)' : ''}.`,
    });
    setTimeout(() => setStatusMessage(null), 4500);
  };

  const handleReject = async (user: UserProfile) => {
    setProcessingId(user.id);
    setStatusMessage(null);

    // 1. Optimistic removal
    setUsers(prev => prev.filter(u => u.id !== user.id));

    // 2. Persist rejection
    markUserAsRejected(user.email);
    rejectLocalUser(user.email);

    // 3. Supabase cloud delete
    if (isSupabaseConnected()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('profiles').delete().eq('id', user.id);
        } catch (e) {
          console.warn('Supabase delete profile error:', e);
        }

        try {
          await supabase.rpc('reject_profile', { target_user_id: user.id });
        } catch {
          // ignore
        }
      }
    }

    setProcessingId(null);
    setStatusMessage({
      type: 'info',
      text: `Access request for ${user.fullName || user.email} was rejected.`,
    });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleRevoke = async (user: UserProfile) => {
    setProcessingId(user.id);
    setStatusMessage(null);

    // 1. Optimistically move back to pending
    setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, isApproved: false } : u)));

    // 2. Persist revocation
    markUserAsRejected(user.email);

    // 3. Cloud update
    if (isSupabaseConnected()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          await supabase
            .from('profiles')
            .update({ is_approved: false, updated_at: new Date().toISOString() })
            .eq('id', user.id);
        } catch {
          // ignore
        }
      }
    }

    setProcessingId(null);
    setStatusMessage({
      type: 'info',
      text: `Access revoked for ${user.fullName || user.email} (moved to pending).`,
    });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={badgeIconStyle}>
              <Shield size={18} color="#f43f5e" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  System Administration
                </h2>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 999,
                    backgroundColor: 'rgba(244, 63, 94, 0.15)',
                    color: '#f43f5e',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Admin Vault
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Review and approve user registrations for paper editing
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={loadUsers}
              disabled={isLoading}
              style={{
                ...iconBtnStyle,
                cursor: isLoading ? 'default' : 'pointer',
              }}
              title="Refresh users list"
            >
              <RefreshCw
                size={14}
                style={{
                  animation: isLoading ? 'spin 0.8s linear infinite' : 'none',
                  color: 'var(--text-secondary)',
                }}
              />
            </button>
            <button onClick={onClose} style={closeBtnStyle} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status Notification Banner */}
        {statusMessage && (
          <div
            style={{
              padding: '10px 18px',
              backgroundColor:
                statusMessage.type === 'success'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(56, 189, 248, 0.12)',
              borderBottom: `1px solid ${
                statusMessage.type === 'success'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(56, 189, 248, 0.3)'
              }`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 600,
              color: statusMessage.type === 'success' ? '#10b981' : '#38bdf8',
            }}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={15} />
            ) : (
              <AlertCircle size={15} />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Search Bar */}
        {users.length > 3 && (
          <div style={{ padding: '12px 22px 0 22px' }}>
            <div style={searchContainerStyle}>
              <Search size={13} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Search user by name or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={searchInputStyle}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <X size={12} color="var(--text-muted)" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Pending Users Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h3 style={sectionTitleStyle}>Pending Access Requests</h3>
                <span style={countBadgeStyle(pendingUsers.length > 0 ? '#f43f5e' : 'var(--text-muted)')}>
                  {pendingUsers.length}
                </span>
              </div>
            </div>

            {pendingUsers.length === 0 ? (
              <div style={emptyStateStyle}>
                <CheckCircle2 size={18} color="#10b981" style={{ opacity: 0.8 }} />
                <span>All access requests have been reviewed and approved.</span>
              </div>
            ) : (
              <div style={listStyle}>
                {pendingUsers.map(user => {
                  const isBusy = processingId === user.id;
                  const initials = (user.fullName || user.email)
                    .split(' ')
                    .map(w => w[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <div key={user.id} style={userItemStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            backgroundColor: user.avatarColor || '#38bdf8',
                            color: '#0f172a',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: 12,
                            flexShrink: 0,
                          }}
                        >
                          {initials}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {user.fullName || 'Registered User'}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{user.email}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => handleApprove(user)}
                          disabled={isBusy}
                          style={{
                            ...approveBtnStyle,
                            opacity: isBusy ? 0.6 : 1,
                            cursor: isBusy ? 'wait' : 'pointer',
                          }}
                          title="Approve User Registration"
                        >
                          {isBusy ? (
                            <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                          ) : (
                            <UserCheck size={14} />
                          )}
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => handleReject(user)}
                          disabled={isBusy}
                          style={{
                            ...rejectBtnStyle,
                            opacity: isBusy ? 0.6 : 1,
                            cursor: isBusy ? 'wait' : 'pointer',
                          }}
                          title="Reject User Request"
                        >
                          <UserX size={14} />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Approved Users Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h3 style={sectionTitleStyle}>Approved Users</h3>
                <span style={countBadgeStyle('#10b981')}>{approvedUsers.length}</span>
              </div>
            </div>

            {approvedUsers.length === 0 ? (
              <div style={emptyStateStyle}>No approved academic users yet.</div>
            ) : (
              <div style={listStyle}>
                {approvedUsers.map(user => {
                  const isBusy = processingId === user.id;
                  const initials = (user.fullName || user.email)
                    .split(' ')
                    .map(w => w[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <div key={user.id} style={userItemStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            backgroundColor: user.avatarColor || '#38bdf8',
                            color: '#0f172a',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: 12,
                            flexShrink: 0,
                          }}
                        >
                          {initials}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {user.fullName || 'Academic User'}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{user.email}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#10b981',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                          }}
                        >
                          <UserCheck size={12} /> Approved
                        </div>
                        <button
                          onClick={() => handleRevoke(user)}
                          disabled={isBusy}
                          style={revokeBtnStyle}
                          title="Revoke access and move user back to pending"
                        >
                          <RotateCcw size={11} /> Revoke
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Database Notice Banner */}
          <div style={noticeBannerStyle}>
            <AlertCircle size={15} color="#38bdf8" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {isSupabaseConnected() ? 'Supabase Profiles Synchronization' : 'Local Storage Sandbox'}
              </span>
              <span>
                {isSupabaseConnected()
                  ? "Approvals instantly update user clearance and synchronize with Supabase 'profiles'. Users can log in immediately upon approval."
                  : 'Currently operating in local mock storage. Connect to Supabase in the Cloud Database Vault for multi-device sync.'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Styles ---
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
  zIndex: 1000,
  animation: 'fadeIn 0.2s ease forwards',
};

const modalStyle: React.CSSProperties = {
  width: 540,
  maxWidth: '92%',
  maxHeight: '88vh',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-medium)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
  display: 'flex',
  flexDirection: 'column',
  animation: 'modalContent 0.2s ease forwards',
  overflowY: 'auto',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 22px',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-1)',
  borderTopLeftRadius: 'var(--radius-lg)',
  borderTopRightRadius: 'var(--radius-lg)',
};

const badgeIconStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  backgroundColor: 'rgba(244, 63, 94, 0.14)',
  border: '1px solid rgba(244, 63, 94, 0.25)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 6,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s ease',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-muted)',
  padding: '6px 8px',
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s ease',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: 0,
};

const countBadgeStyle = (color: string): React.CSSProperties => ({
  fontSize: 10,
  fontWeight: 700,
  padding: '1px 6px',
  borderRadius: 999,
  backgroundColor: 'var(--bg-surface-2)',
  color: color,
  border: '1px solid var(--border-subtle)',
});

const searchContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 12px',
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'none',
  border: 'none',
  outline: 'none',
  fontSize: 12,
  color: 'var(--text-primary)',
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const userItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  transition: 'border-color 0.15s ease',
};

const emptyStateStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  padding: '16px 20px',
  backgroundColor: 'var(--bg-surface-1)',
  borderRadius: 'var(--radius-md)',
  border: '1px dashed var(--border-subtle)',
  textAlign: 'center',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

const approveBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 14px',
  backgroundColor: 'rgba(16, 185, 129, 0.18)',
  color: '#10b981',
  border: '1px solid rgba(16, 185, 129, 0.4)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 12,
  fontWeight: 600,
  transition: 'all 0.15s ease',
};

const rejectBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  backgroundColor: 'rgba(244, 63, 94, 0.15)',
  color: '#f43f5e',
  border: '1px solid rgba(244, 63, 94, 0.35)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 12,
  fontWeight: 600,
  transition: 'all 0.15s ease',
};

const revokeBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  backgroundColor: 'transparent',
  color: 'var(--text-muted)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 4,
  fontSize: 10.5,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const noticeBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '12px 16px',
  backgroundColor: 'rgba(56, 189, 248, 0.06)',
  border: '1px solid rgba(56, 189, 248, 0.22)',
  borderRadius: 'var(--radius-md)',
  fontSize: 11.5,
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
};
