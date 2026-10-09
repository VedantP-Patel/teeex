import React, { useState, useEffect } from 'react';
import { X, UserCheck, UserX, Shield, AlertCircle } from 'lucide-react';
import type { UserProfile } from '../../types/latex';
import { getLocalRegisteredUsers, approveLocalUser, rejectLocalUser } from '../../services/authService';
import { getSupabaseClient, isSupabaseConnected } from '../../services/supabaseClient';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
}

export const AdminUsersModal: React.FC<Props> = ({ isOpen, onClose, currentUser }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);

  const loadUsers = async () => {
    if (isSupabaseConnected()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase.from('profiles').select('*');
        if (!error && data) {
          setUsers(data.map(d => ({
            id: d.id,
            email: d.email,
            fullName: d.full_name,
            avatarColor: d.avatar_color,
            isAdmin: d.is_admin,
            isApproved: d.is_approved,
          })));
          return;
        }
      }
    }
    setUsers(getLocalRegisteredUsers());
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  if (!isOpen || !currentUser?.isAdmin) return null;

  const pendingUsers = users.filter(u => !u.isApproved && !u.isAdmin);
  const approvedUsers = users.filter(u => u.isApproved && !u.isAdmin);

  const handleApprove = async (user: UserProfile) => {
    if (isSupabaseConnected()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.from('profiles').update({ is_approved: true }).eq('id', user.id);
        loadUsers();
        return;
      }
    }
    approveLocalUser(user.email);
    loadUsers();
  };

  const handleReject = async (user: UserProfile) => {
    if (isSupabaseConnected()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.from('profiles').delete().eq('id', user.id);
        loadUsers();
        return;
      }
    }
    if (rejectLocalUser) {
      rejectLocalUser(user.email);
      loadUsers();
    } else {
      alert("Reject function not implemented in authService.ts yet!");
    }
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={badgeIconStyle}>
              <Shield size={16} color="#f43f5e" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                System Administration
              </h2>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Manage user access requests
              </p>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h3 style={sectionTitleStyle}>Pending Access Requests ({pendingUsers.length})</h3>
            {pendingUsers.length === 0 ? (
              <div style={emptyStateStyle}>No pending users.</div>
            ) : (
              <div style={listStyle}>
                {pendingUsers.map(user => (
                  <div key={user.id} style={userItemStyle}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{user.fullName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user.email}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleApprove(user)} style={approveBtnStyle} title="Approve User">
                        <UserCheck size={14} /> Approve
                      </button>
                      <button onClick={() => handleReject(user)} style={rejectBtnStyle} title="Reject User">
                        <UserX size={14} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 10 }}>
            <h3 style={sectionTitleStyle}>Approved Users ({approvedUsers.length})</h3>
            {approvedUsers.length === 0 ? (
              <div style={emptyStateStyle}>No approved mock users.</div>
            ) : (
              <div style={listStyle}>
                {approvedUsers.map(user => (
                  <div key={user.id} style={userItemStyle}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{user.fullName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user.email}</div>
                    </div>
                    <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                       <UserCheck size={12} /> Approved
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={noticeBannerStyle}>
            <AlertCircle size={14} color="#38bdf8" style={{ flexShrink: 0 }} />
            <span>
              {isSupabaseConnected() 
                ? "You are connected to Supabase. Approvals here update the 'profiles' table directly."
                : "This panel manages local mock users. Connect to Supabase to manage real users."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Styles (using standard CSS in JS) ---
const backdropStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.65)',
  backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
  animation: 'fadeIn 0.2s ease forwards',
};

const modalStyle: React.CSSProperties = {
  width: 500,
  maxWidth: '90%',
  maxHeight: '90vh',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-medium)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
  display: 'flex',
  flexDirection: 'column',
  animation: 'modalContent 0.2s ease forwards',
  overflowY: 'auto'
};

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 22px',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-1)',
  borderTopLeftRadius: 'var(--radius-lg)',
  borderTopRightRadius: 'var(--radius-lg)',
};

const badgeIconStyle: React.CSSProperties = {
  width: 32, height: 32,
  borderRadius: 8,
  backgroundColor: 'rgba(244, 63, 94, 0.15)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--text-muted)',
  cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 12,
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
};

const emptyStateStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  padding: '12px 16px',
  backgroundColor: 'var(--bg-surface-1)',
  borderRadius: 'var(--radius-md)',
  border: '1px dashed var(--border-subtle)',
  textAlign: 'center',
};

const approveBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 12px',
  backgroundColor: 'rgba(16, 185, 129, 0.15)',
  color: '#10b981',
  border: '1px solid rgba(16, 185, 129, 0.3)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 12, fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const rejectBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 12px',
  backgroundColor: 'rgba(244, 63, 94, 0.15)',
  color: '#f43f5e',
  border: '1px solid rgba(244, 63, 94, 0.3)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 12, fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const noticeBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '12px 16px',
  backgroundColor: 'rgba(56, 189, 248, 0.05)',
  border: '1px solid rgba(56, 189, 248, 0.2)',
  borderRadius: 'var(--radius-md)',
  marginTop: 16,
  fontSize: 11.5,
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
};
