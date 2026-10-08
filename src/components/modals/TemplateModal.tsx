import React from 'react';
import { BookOpen, X, FileText } from 'lucide-react';
import { STARTER_TEMPLATES } from '../../services/templates';
import type { Template } from '../../types/latex';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: Template) => void;
}

export const TemplateModal: React.FC<Props> = ({ isOpen, onClose, onSelectTemplate }) => {
  if (!isOpen) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={18} color="#a855f7" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Academic Template Gallery</h2>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* List of Templates */}
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, overflowY: 'auto', flex: 1 }}>
          {STARTER_TEMPLATES.map(tpl => (
            <div
              key={tpl.id}
              onClick={() => {
                onSelectTemplate(tpl);
                onClose();
              }}
              style={templateCardStyle}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileText size={16} color="#38bdf8" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{tpl.name}</span>
                </div>
                <span className="badge badge-cyan">{tpl.badge}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, margin: '0 0 12px 0' }}>
                {tpl.description}
              </p>
              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tpl.files.length} file(s)</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#38bdf8' }}>Load Template &rarr;</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', backgroundColor: 'var(--bg-surface-0)' }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>
            Cancel
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
  width: '680px',
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

const templateCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 16,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  transition: 'all 0.2s ease',
};
