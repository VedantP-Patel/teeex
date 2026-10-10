import React, { useState, useMemo } from 'react';
import {
  Plus,
  RotateCcw,
  X,
  GitCommit,
  Check,
  Columns,
  AlignLeft,
  FileText,
  FileCode,
  GitCompare,
  Copy
} from 'lucide-react';
import type { ProjectFile } from '../../types/latex';
import { computeLineDiff } from '../../services/diffService';

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
  onRestoreSingleFile?: (file: ProjectFile) => void;
}

export const VersionHistoryModal: React.FC<Props> = ({
  isOpen,
  onClose,
  checkpoints = [],
  currentFiles = [],
  onCreateCheckpoint,
  onRestoreCheckpoint,
  onRestoreSingleFile,
}) => {
  const [newCheckpointName, setNewCheckpointName] = useState('');
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>(
    checkpoints && checkpoints.length > 0 ? checkpoints[0].id : ''
  );
  const [diffMode, setDiffMode] = useState<'split' | 'unified'>('unified');
  const [selectedFileId, setSelectedFileId] = useState<string>(() => {
    return currentFiles?.find(f => f.name.endsWith('.tex'))?.id || currentFiles?.[0]?.id || 'main.tex';
  });
  const [restoredToast, setRestoredToast] = useState<'all' | 'file' | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const safeCheckpoints = checkpoints || [];
  const selectedCheckpoint = safeCheckpoints.find(c => c.id === selectedCheckpointId) || safeCheckpoints[0] || null;

  // Resolve active file comparison
  const safeCurrentFiles = currentFiles || [];
  const currentFile = safeCurrentFiles.find(f => f.id === selectedFileId) || safeCurrentFiles[0] || null;
  const checkpointFile = selectedCheckpoint?.files?.find(f => f.id === selectedFileId || f.name === currentFile?.name) || null;

  const currentContent = currentFile?.content || '';
  const checkpointContent = checkpointFile?.content || '';

  // Calculate real LCS diff (always called unconditionally to satisfy React rules of hooks!)
  const diffResult = useMemo(() => {
    return computeLineDiff(checkpointContent, currentContent);
  }, [checkpointContent, currentContent]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCheckpointName.trim()) return;
    onCreateCheckpoint(newCheckpointName.trim());
    setNewCheckpointName('');
  };

  const handleRestoreAll = () => {
    if (!selectedCheckpoint) return;
    onRestoreCheckpoint(selectedCheckpoint);
    setRestoredToast('all');
    setTimeout(() => {
      setRestoredToast(null);
      onClose();
    }, 1200);
  };

  const handleRestoreThisFile = () => {
    if (!checkpointFile || !onRestoreSingleFile) return;
    onRestoreSingleFile(checkpointFile);
    setRestoredToast('file');
    setTimeout(() => {
      setRestoredToast(null);
    }, 1400);
  };

  const handleCopyCheckpointText = () => {
    if (!checkpointContent) return;
    navigator.clipboard.writeText(checkpointContent);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 1400);
  };

  // Guard: Return null AFTER all hooks are evaluated
  if (!isOpen) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(56, 189, 248, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GitCompare size={18} color="#38bdf8" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Visual Version History &amp; Diff
              </h2>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Compare current document lines with historical checkpoints side-by-side
              </p>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle} title="Close (Esc)">
            <X size={18} />
          </button>
        </div>

        {/* Content Body: Left Timeline | Right Diff Viewer */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Timeline Panel */}
          <div style={timelinePanelStyle}>
            {/* Create Checkpoint Form */}
            <form onSubmit={handleCreate} style={{ padding: 12, borderBottom: '1px solid var(--border-subtle)' }}>
              <label style={labelStyle}>SAVE SNAPSHOT</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="e.g. Draft 1 / Pre-Review"
                  value={newCheckpointName}
                  onChange={e => setNewCheckpointName(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    fontSize: 11.5,
                    backgroundColor: 'var(--bg-surface-0)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                  }}
                />
                <button type="submit" className="btn-primary" style={{ padding: '6px 10px', fontSize: 11 }}>
                  <Plus size={13} /> Save
                </button>
              </div>
            </form>

            {/* Checkpoints List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 6px', letterSpacing: '0.05em' }}>
                CHECKPOINTS ({checkpoints.length})
              </div>
              {checkpoints.map(cp => {
                const isSelected = cp.id === selectedCheckpointId;
                return (
                  <div
                    key={cp.id}
                    onClick={() => setSelectedCheckpointId(cp.id)}
                    style={{
                      ...checkpointItemStyle,
                      backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-surface-0)',
                      borderColor: isSelected ? '#38bdf8' : 'var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <GitCommit size={14} color={isSelected ? '#38bdf8' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? '#38bdf8' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cp.name}
                        </span>
                      </div>
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {cp.timestamp}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                      <span>by {cp.author}</span>
                      <span>{cp.files?.length || 0} file{(cp.files?.length || 0) > 1 ? 's' : ''}</span>
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
                {/* Diff Sub-Header: File Selector + View Mode Switcher + Actions */}
                <div style={diffSubHeaderStyle}>
                  {/* File Selector Tabs */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', flex: 1 }}>
                    {currentFiles.map(f => {
                      const isFileSelected = f.id === selectedFileId;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setSelectedFileId(f.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 8px',
                            fontSize: 11,
                            fontFamily: 'var(--font-mono)',
                            borderRadius: 4,
                            border: `1px solid ${isFileSelected ? '#38bdf8' : 'var(--border-subtle)'}`,
                            backgroundColor: isFileSelected ? 'rgba(56, 189, 248, 0.14)' : 'var(--bg-surface-1)',
                            color: isFileSelected ? '#38bdf8' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          {f.name.endsWith('.tex') ? <FileCode size={11} /> : <FileText size={11} />}
                          <span>{f.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Diff Stats Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>+{diffResult.additions}</span>
                      <span style={{ color: '#f43f5e', fontWeight: 700 }}>-{diffResult.deletions}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{diffResult.unchanged} unchanged</span>
                    </div>

                    {/* Unified vs Split Mode Switch */}
                    <div style={{ display: 'inline-flex', backgroundColor: 'var(--bg-surface-1)', borderRadius: 4, padding: 2, border: '1px solid var(--border-subtle)' }}>
                      <button
                        type="button"
                        onClick={() => setDiffMode('unified')}
                        style={{
                          padding: '3px 8px',
                          fontSize: 10.5,
                          borderRadius: 3,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: diffMode === 'unified' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                          color: diffMode === 'unified' ? '#38bdf8' : 'var(--text-muted)',
                        }}
                        title="Unified view (standard diff)"
                      >
                        <AlignLeft size={11} />
                        <span>Unified</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiffMode('split')}
                        style={{
                          padding: '3px 8px',
                          fontSize: 10.5,
                          borderRadius: 3,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: diffMode === 'split' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                          color: diffMode === 'split' ? '#38bdf8' : 'var(--text-muted)',
                        }}
                        title="Split view (Side-by-side comparison)"
                      >
                        <Columns size={11} />
                        <span>Side-by-Side</span>
                      </button>
                    </div>

                    {/* Quick Copy Snippet */}
                    <button
                      type="button"
                      onClick={handleCopyCheckpointText}
                      className="btn-ghost"
                      style={{ padding: '4px 6px', fontSize: 11, color: 'var(--text-muted)' }}
                      title="Copy checkpoint content to clipboard"
                    >
                      {copiedSnippet ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                {/* Diff Viewer Body */}
                <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-app)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.6 }}>
                  {diffMode === 'unified' ? (
                    /* UNIFIED VIEW */
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {diffResult.lines.map((line, idx) => {
                        const isAdded = line.type === 'added';
                        const isRemoved = line.type === 'removed';

                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              padding: '1px 8px',
                              backgroundColor: isAdded
                                ? 'rgba(16, 185, 129, 0.12)'
                                : isRemoved
                                ? 'rgba(244, 63, 94, 0.12)'
                                : 'transparent',
                              borderLeft: isAdded
                                ? '3px solid #10b981'
                                : isRemoved
                                ? '3px solid #f43f5e'
                                : '3px solid transparent',
                            }}
                          >
                            {/* Old Line # */}
                            <span style={{ width: 36, textAlign: 'right', paddingRight: 8, color: 'var(--text-faint)', userSelect: 'none', flexShrink: 0 }}>
                              {line.oldLineNumber || ''}
                            </span>
                            {/* New Line # */}
                            <span style={{ width: 36, textAlign: 'right', paddingRight: 8, color: 'var(--text-faint)', userSelect: 'none', flexShrink: 0, borderRight: '1px solid var(--border-subtle)' }}>
                              {line.newLineNumber || ''}
                            </span>
                            {/* Marker */}
                            <span style={{ width: 20, textAlign: 'center', fontWeight: 700, userSelect: 'none', color: isAdded ? '#10b981' : isRemoved ? '#f43f5e' : 'var(--text-faint)' }}>
                              {isAdded ? '+' : isRemoved ? '−' : ' '}
                            </span>
                            {/* Code Text */}
                            <span style={{ flex: 1, color: isAdded ? '#10b981' : isRemoved ? '#f43f5e' : 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {line.text}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* SIDE-BY-SIDE SPLIT VIEW */
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {/* Split Column Headers */}
                      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-0)', position: 'sticky', top: 0, zIndex: 2 }}>
                        <div style={{ flex: 1, padding: '4px 12px', fontSize: 10, fontWeight: 700, color: '#f43f5e', borderRight: '1px solid var(--border-subtle)' }}>
                          CHECKPOINT: {selectedCheckpoint?.name || 'Checkpoint'}
                        </div>
                        <div style={{ flex: 1, padding: '4px 12px', fontSize: 10, fontWeight: 700, color: '#10b981' }}>
                          CURRENT REVISION (WORKING TREE)
                        </div>
                      </div>

                      {diffResult.splitRows.map((row, idx) => {
                        const left = row.left;
                        const right = row.right;

                        return (
                          <div key={idx} style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                            {/* Left Pane (Checkpoint) */}
                            <div
                              style={{
                                flex: 1,
                                display: 'flex',
                                padding: '1px 8px',
                                borderRight: '1px solid var(--border-subtle)',
                                backgroundColor: left?.type === 'removed' ? 'rgba(244, 63, 94, 0.12)' : 'transparent',
                                color: left?.type === 'removed' ? '#f43f5e' : 'var(--text-secondary)',
                                minWidth: 0,
                              }}
                            >
                              <span style={{ width: 32, textAlign: 'right', paddingRight: 6, color: 'var(--text-faint)', userSelect: 'none', flexShrink: 0 }}>
                                {left?.lineNumber || ''}
                              </span>
                              <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {left?.text || ''}
                              </span>
                            </div>

                            {/* Right Pane (Current) */}
                            <div
                              style={{
                                flex: 1,
                                display: 'flex',
                                padding: '1px 8px',
                                backgroundColor: right?.type === 'added' ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                                color: right?.type === 'added' ? '#10b981' : 'var(--text-primary)',
                                minWidth: 0,
                              }}
                            >
                              <span style={{ width: 32, textAlign: 'right', paddingRight: 6, color: 'var(--text-faint)', userSelect: 'none', flexShrink: 0 }}>
                                {right?.lineNumber || ''}
                              </span>
                              <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {right?.text || ''}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Diff Action Bar */}
                <div style={diffActionBarStyle}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Comparing <strong>{currentFile?.name}</strong> against <strong>{selectedCheckpoint?.name || 'Checkpoint'}</strong>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {onRestoreSingleFile && checkpointFile && (
                      <button
                        onClick={handleRestoreThisFile}
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '5px 12px' }}
                        title="Revert only this selected file back to the checkpoint version"
                      >
                        {restoredToast === 'file' ? (
                          <><Check size={13} color="#10b981" /> Reverted {currentFile?.name}!</>
                        ) : (
                          <><RotateCcw size={12} /> Revert File ({currentFile?.name})</>
                        )}
                      </button>
                    )}

                    <button
                      onClick={handleRestoreAll}
                      className="btn-primary"
                      style={{ fontSize: 11, padding: '5px 14px' }}
                      title="Roll back all document files to this exact historical checkpoint"
                    >
                      {restoredToast === 'all' ? (
                        <><Check size={13} color="#10b981" /> Version Restored!</>
                      ) : (
                        <><RotateCcw size={13} /> Restore Full Checkpoint</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                No checkpoint selected. Create one using the form on the left.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-0)' }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
            Diff calculated with Longest Common Subsequence (LCS) engine
          </span>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 11.5, padding: '4px 14px' }}>
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
  width: '1020px',
  maxWidth: '96vw',
  height: '82vh',
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
  padding: '12px 18px',
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
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.05em',
  marginBottom: 6,
};

const timelinePanelStyle: React.CSSProperties = {
  width: '280px',
  borderRight: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'var(--bg-surface-0)',
  flexShrink: 0,
};

const diffPanelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  backgroundColor: 'var(--bg-app)',
};

const checkpointItemStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const diffSubHeaderStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: 'var(--bg-surface-0)',
  gap: 12,
};

const diffActionBarStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderTop: '1px solid var(--border-subtle)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: 'var(--bg-surface-0)',
};
