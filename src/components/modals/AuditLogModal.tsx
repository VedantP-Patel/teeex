import React, { useState } from 'react';
import { X, ShieldCheck, Clock, User } from 'lucide-react';
import { getAuditLogs } from '../../services/auditService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
}

export const AuditLogModal: React.FC<Props> = ({
  isOpen,
  onClose,
  projectId,
  projectTitle,
}) => {
  const [filter, setFilter] = useState<'all' | 'security' | 'document' | 'collaboration'>('all');

  if (!isOpen) return null;

  const logs = getAuditLogs(projectId);
  const filtered = logs.filter(l => filter === 'all' || l.category === filter);

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={iconBadgeStyle}>
              <ShieldCheck size={16} color="#10b981" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Security & Activity Audit Trail
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                Immutable event record for {projectTitle}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Filter Bar */}
        <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 6 }}>
          {(['all', 'security', 'document', 'collaboration'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className="btn-ghost"
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs)',
                backgroundColor: filter === cat ? 'var(--bg-surface-2)' : 'transparent',
                color: filter === cat ? '#38bdf8' : 'var(--text-muted)',
                fontWeight: filter === cat ? 600 : 400,
                textTransform: 'capitalize',
              }}
            >
              {cat}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {filtered.length} recorded events
          </span>
        </div>

        {/* Log Entries List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 12 }}>
              No audit logs recorded for this category yet.
            </div>
          ) : (
            filtered.map(entry => (
              <div
                key={entry.id}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-surface-0)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {entry.action}
                    </span>
                    <span
                      className={`badge ${
                        entry.category === 'security'
                          ? 'badge-rose'
                          : entry.category === 'collaboration'
                          ? 'badge-amber'
                          : 'badge-cyan'
                      }`}
                      style={{ fontSize: 9.5 }}
                    >
                      {entry.category}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {entry.detail}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <User size={10} />
                    <span>{entry.userName} ({entry.userRole})</span>
                  </div>
                </div>

                <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  <Clock size={10} />
                  <span>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface-0)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 11.5 }}>
            Close
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
  maxWidth: 580,
  maxHeight: '75vh',
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
  backgroundColor: 'rgba(16, 185, 129, 0.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
