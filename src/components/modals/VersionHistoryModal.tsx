import React, { useState } from 'react';
import { History, Plus, RotateCcw, X, GitCommit, Check } from 'lucide-react';
import type { ProjectFile } from '../../types/latex';

export interface Checkpoint {
  id: string;
  name: string;
  timestamp: string;
  author: string;
  files: ProjectFile[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  checkpoints: Checkpoint[];
  currentFiles: ProjectFile[];
  onCreateCheckpoint: (name: string) => void;
  onRestoreCheckpoint: (checkpoint: Checkpoint) => void;
}

export const VersionHistoryModal: React.FC<Props> = ({
  isOpen,
  onClose,
  checkpoints,
  currentFiles,
  onCreateCheckpoint,
  onRestoreCheckpoint,
}) => {
  const [newCheckpointName, setNewCheckpointName] = useState('');
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>(
    checkpoints.length > 0 ? checkpoints[0].id : ''
  );
  const [restoredToast, setRestoredToast] = useState(false);

  if (!isOpen) return null;

  const selectedCheckpoint = checkpoints.find(c => c.id === selectedCheckpointId) || checkpoints[0];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCheckpointName.trim()) return;
    onCreateCheckpoint(newCheckpointName.trim());
    setNewCheckpointName('');
  };

  const handleRestore = () => {
    if (!selectedCheckpoint) return;
    onRestoreCheckpoint(selectedCheckpoint);
    setRestoredToast(true);
    setTimeout(() => {
      setRestoredToast(false);
      onClose();
    }, 1200);
  };

  // Compute a clean line diff between checkpoint main.tex and current main.tex
  const currentMain = currentFiles.find(f => f.name.endsWith('.tex'))?.content || '';
  const checkpointMain = selectedCheckpoint?.files.find(f => f.name.endsWith('.tex'))?.content || '';

  const currentLines = currentMain.split('\n');
  const checkpointLines = checkpointMain.split('\n');

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={18} color="#38bdf8" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Version History & Checkpoint Diff</h2>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Content Body: Left Timeline | Right Diff Viewer */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Timeline Panel */}
          <div style={timelinePanelStyle}>
            {/* Create Checkpoint Form */}
            <form onSubmit={handleCreate} style={{ padding: 12, borderBottom: '1px solid var(--border-subtle)' }}>
              <label style={labelStyle}>CREATE NEW CHECKPOINT</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="e.g. Draft 1 or Pre-Revision"
                  value={newCheckpointName}
                  onChange={e => setNewCheckpointName(e.target.value)}
                  style={{ flex: 1, padding: '5px 8px', fontSize: 11.5 }}
                />
                <button type="submit" className="btn-primary" style={{ padding: '5px 10px', fontSize: 11 }}>
                  <Plus size={13} /> Save
                </button>
              </div>
            </form>

            {/* Checkpoints List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 6px' }}>
                TIMELINE ({checkpoints.length})
              </span>
              {checkpoints.map(cp => {
                const isSelected = cp.id === selectedCheckpointId;
                return (
                  <div
                    key={cp.id}
                    onClick={() => setSelectedCheckpointId(cp.id)}
                    style={{
                      ...checkpointItemStyle,
                      backgroundColor: isSelected ? 'var(--bg-active)' : 'transparent',
                      borderColor: isSelected ? 'var(--border-medium)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <GitCommit size={14} color={isSelected ? '#38bdf8' : 'var(--text-muted)'} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{cp.name}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{cp.author}</span>
                      <span>{cp.timestamp}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Diff Viewer Panel */}
          <div style={diffPanelStyle}>
            {selectedCheckpoint ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Diff Header */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-0)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>Comparing with: {selectedCheckpoint.name}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                      Main document ({checkpointLines.length} lines in checkpoint vs {currentLines.length} lines currently)
                    </div>
                  </div>

                  <button
                    onClick={handleRestore}
                    className="btn-primary"
                    style={{ fontSize: 11, padding: '5px 12px' }}
                    title="Rollback document to this exact version"
                  >
                    {restoredToast ? <><Check size={13} color="#10b981" /> Restored!</> : <><RotateCcw size={13} /> Restore Version</>}
                  </button>
                </div>

                {/* Diff Lines View */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.6 }}>
                  {checkpointLines.slice(0, 100).map((line, idx) => {
                    const currentLine = currentLines[idx];
                    const isChanged = currentLine !== line;

                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          backgroundColor: isChanged ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                          padding: '1px 4px',
                          borderRadius: 2,
                        }}
                      >
                        <span style={{ width: 36, color: 'var(--text-faint)', userSelect: 'none', flexShrink: 0 }}>
                          {idx + 1}
                        </span>
                        <span style={{ color: isChanged ? '#38bdf8' : 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {line}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                No checkpoint selected.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', backgroundColor: 'var(--bg-surface-0)' }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>
            Close
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
  width: '840px',
  maxWidth: '94vw',
  height: '75vh',
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

const timelinePanelStyle: React.CSSProperties = {
  width: 260,
  borderRight: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'var(--bg-surface-0)',
};

const diffPanelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'var(--bg-app)',
};

const checkpointItemStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'all 0.15s ease',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: 4,
  letterSpacing: '0.04em',
};
