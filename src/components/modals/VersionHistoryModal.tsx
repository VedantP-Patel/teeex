import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  GitCommit,
  GitBranch,
  Check,
  Columns,
  AlignLeft,
  Trash2,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  Clock,
  ShieldAlert,
  ArrowRight,
  Download,
  Search,
  Undo2,
} from 'lucide-react';
import type { ProjectFile } from '../../types/latex';
import {
  computeLineDiff,
  computeProjectFileDiffs,
  type DiffResult,
  type FileDiffSummary,
} from '../../services/diffService';
import type {
  Checkpoint,
  WorkingTreeStatus,
} from '../../services/checkpointsService';
import { readEmergencyDraft, type RecoveredDraftInfo } from '../../hooks/useAutosaveRecovery';

export type { Checkpoint };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  checkpoints: Checkpoint[];
  currentFiles: ProjectFile[];
  workingTreeStatus?: WorkingTreeStatus;
  onCreateCommit?: (message: string, description?: string) => void;
  onCreateCheckpoint: (name: string) => void;
  onRestoreCheckpoint: (checkpoint: Checkpoint) => void;
  onRestoreSingleFile?: (file: ProjectFile) => void;
  onDeleteCheckpoint?: (checkpointId: string) => void;
  onPushCommits?: () => Promise<void>;
  onPullCommits?: () => Promise<void>;
  onSyncCloud?: () => void;
  isCloudConnected?: boolean;
  activeProjectId?: string;
}

export const VersionHistoryModal: React.FC<Props> = ({
  isOpen,
  onClose,
  checkpoints = [],
  currentFiles = [],
  workingTreeStatus,
  onCreateCommit,
  onCreateCheckpoint,
  onRestoreCheckpoint,
  onRestoreSingleFile,
  onDeleteCheckpoint,
  onPushCommits,
  onPullCommits,
  onSyncCloud,
  isCloudConnected = false,
  activeProjectId = '',
}) => {
  const safeCheckpoints = useMemo(() => checkpoints || [], [checkpoints]);
  const safeCurrentFiles = useMemo(() => currentFiles || [], [currentFiles]);
  const headCommit = safeCheckpoints[0] || null;

  // Derive working tree if not passed
  const isWorkingClean = workingTreeStatus ? workingTreeStatus.isClean : safeCheckpoints.length > 0 && safeCheckpoints[0].files.length === safeCurrentFiles.length && safeCurrentFiles.every(f => {
    const matched = safeCheckpoints[0].files.find(cf => cf.name === f.name);
    return matched && matched.content === f.content;
  });

  const [activeTab, setActiveTab] = useState<'changes' | 'commits' | 'drafts'>(() => {
    return !isWorkingClean ? 'changes' : 'commits';
  });

  const [inspectingWorkingTree, setInspectingWorkingTree] = useState<boolean>(!isWorkingClean);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>(
    safeCheckpoints.length > 0 ? safeCheckpoints[0].id : ''
  );
  const [diffMode, setDiffMode] = useState<'split' | 'unified'>('unified');
  const [selectedFileName, setSelectedFileName] = useState<string>(() => {
    return safeCurrentFiles.find(f => f.name.endsWith('.tex'))?.name || safeCurrentFiles[0]?.name || 'main.tex';
  });

  // Commit form
  const [commitMessage, setCommitMessage] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [restoredToast, setRestoredToast] = useState<'commit' | 'file' | 'draft' | null>(null);
  const [copiedSha, setCopiedSha] = useState<string | null>(null);

  // Emergency crash draft
  const [emergencyDraft, setEmergencyDraft] = useState<RecoveredDraftInfo | null>(null);

  useEffect(() => {
    if (isOpen && activeProjectId) {
      setEmergencyDraft(readEmergencyDraft(activeProjectId));
    }
  }, [isOpen, activeProjectId]);

  // Selected commit resolution
  const selectedCheckpoint = safeCheckpoints.find(c => c.id === selectedCheckpointId) || safeCheckpoints[0] || null;

  // Determine comparison snapshots
  const comparison = useMemo(() => {
    if (inspectingWorkingTree) {
      const oldFiles = headCommit ? headCommit.files : [];
      const newFiles = safeCurrentFiles;
      return { oldFiles, newFiles, labelOld: headCommit ? `HEAD (${headCommit.shortSha || 'head'})` : 'Initial', labelNew: 'Working Tree (Uncommitted)' };
    }

    if (!selectedCheckpoint) {
      return { oldFiles: [], newFiles: safeCurrentFiles, labelOld: 'Base', labelNew: 'Current' };
    }

    const parent = selectedCheckpoint.parentId ? safeCheckpoints.find(c => c.id === selectedCheckpoint.parentId) : null;
    const oldFiles = parent ? parent.files : [];
    const newFiles = selectedCheckpoint.files;
    return {
      oldFiles,
      newFiles,
      labelOld: parent ? `${parent.name} (${parent.shortSha})` : 'Root / Init',
      labelNew: `${selectedCheckpoint.name} (${selectedCheckpoint.shortSha || selectedCheckpoint.id.slice(0, 7)})`,
    };
  }, [inspectingWorkingTree, headCommit, safeCurrentFiles, selectedCheckpoint, safeCheckpoints]);

  // Compute multi-file diff summary
  const projectDiffSummaries: FileDiffSummary[] = useMemo(() => {
    return computeProjectFileDiffs(comparison.oldFiles, comparison.newFiles);
  }, [comparison]);

  // Active file diff resolution
  const activeFileDiff = useMemo(() => {
    const matched = projectDiffSummaries.find(d => d.fileName === selectedFileName);
    if (matched) return matched;
    return projectDiffSummaries[0] || null;
  }, [projectDiffSummaries, selectedFileName]);

  const activeDiffResult: DiffResult = useMemo(() => {
    if (activeFileDiff) return activeFileDiff.diff;
    return computeLineDiff('', '');
  }, [activeFileDiff]);

  // Calculate sync status (ahead commits)
  const aheadCount = useMemo(() => {
    return safeCheckpoints.filter(c => !c.isSyncedToCloud && !c.isAutoSave).length;
  }, [safeCheckpoints]);

  // Commit submission
  const handleCommitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim()) return;

    if (onCreateCommit) {
      onCreateCommit(commitMessage.trim(), commitDescription.trim());
    } else {
      onCreateCheckpoint(commitMessage.trim());
    }

    setCommitMessage('');
    setCommitDescription('');
    setInspectingWorkingTree(false);
    setActiveTab('commits');
  };

  const handlePush = async () => {
    if (!onPushCommits) return;
    setIsSyncing(true);
    try {
      await onPushCommits();
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePull = async () => {
    if (!onPullCommits) return;
    setIsSyncing(true);
    try {
      await onPullCommits();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      if (onPullCommits) await onPullCommits();
      if (onPushCommits) await onPushCommits();
      if (onSyncCloud) onSyncCloud();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestoreCommit = () => {
    if (!selectedCheckpoint) return;
    onRestoreCheckpoint(selectedCheckpoint);
    setRestoredToast('commit');
    setTimeout(() => {
      setRestoredToast(null);
      onClose();
    }, 1200);
  };

  const handleRestoreFile = () => {
    if (!activeFileDiff || !onRestoreSingleFile) return;
    const fileToRestore: ProjectFile = {
      id: activeFileDiff.fileId,
      name: activeFileDiff.fileName,
      content: activeFileDiff.oldContent,
      type: activeFileDiff.fileName.endsWith('.bib') ? 'bib' : activeFileDiff.fileName.endsWith('.sty') ? 'sty' : 'tex',
    };
    onRestoreSingleFile(fileToRestore);
    setRestoredToast('file');
    setTimeout(() => {
      setRestoredToast(null);
    }, 1400);
  };

  const handleRestoreEmergencyDraft = () => {
    if (!emergencyDraft) return;
    const draftCp: Checkpoint = {
      id: `emergency-draft-${emergencyDraft.timestamp}`,
      shortSha: 'draft',
      projectId: activeProjectId,
      name: `Recovered Emergency Draft (${new Date(emergencyDraft.timestamp).toLocaleTimeString()})`,
      message: `Recovered Emergency Draft (${new Date(emergencyDraft.timestamp).toLocaleTimeString()})`,
      timestamp: new Date(emergencyDraft.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      author: 'Crash Recovery',
      files: emergencyDraft.files,
      isAutoSave: true,
      createdAt: new Date(emergencyDraft.timestamp).toISOString(),
    };
    onRestoreCheckpoint(draftCp);
    setRestoredToast('draft');
    setTimeout(() => {
      setRestoredToast(null);
      onClose();
    }, 1200);
  };

  const handleCopySha = (sha: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(sha);
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(null), 1500);
  };

  const handleDownloadZip = () => {
    if (!selectedCheckpoint) return;
    import('jszip').then(({ default: JSZip }) => {
      const zip = new JSZip();
      for (const f of selectedCheckpoint.files) {
        zip.file(f.name, f.content);
      }
      zip.generateAsync({ type: 'blob' }).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `teeex-commit-${selectedCheckpoint.shortSha || 'snapshot'}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  };

  // Keyboard shortcut Ctrl+Enter to commit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (activeTab === 'changes' && commitMessage.trim()) {
        e.preventDefault();
        handleCommitSubmit(e as unknown as React.FormEvent);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Header Bar */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(56, 189, 248, 0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GitBranch size={18} color="#38bdf8" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Source Control &amp; Git Version History
                </h2>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, backgroundColor: isCloudConnected ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface-2)', color: isCloudConnected ? '#10b981' : '#38bdf8', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  branch: main {isCloudConnected ? '(cloud)' : '(local)'}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                High-fidelity green/red diffs, Git-style commit log, and remote cloud synchronization
              </p>
            </div>
          </div>

          {/* Sync & Remote Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {aheadCount > 0 ? (
              <span className="git-sync-badge-ahead" title={`${aheadCount} local commit(s) ready to push to cloud`}>
                <UploadCloud size={11} /> {aheadCount} to push
              </span>
            ) : (
              <span className="git-sync-badge-synced" title="Local commits are in sync with cloud">
                <Check size={11} /> Synced
              </span>
            )}

            {onPullCommits && (
              <button
                type="button"
                onClick={handlePull}
                disabled={isSyncing}
                className="btn-ghost"
                style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                title="Pull latest remote commits"
              >
                <DownloadCloud size={13} /> Pull
              </button>
            )}

            {onPushCommits && (
              <button
                type="button"
                onClick={handlePush}
                disabled={isSyncing || aheadCount === 0}
                className="btn-ghost"
                style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                title="Push local commits to cloud repository"
              >
                <UploadCloud size={13} /> Push
              </button>
            )}

            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="btn-ghost"
              style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title="Synchronize repository (Pull & Push)"
            >
              <RefreshCw size={12} className={isSyncing ? 'spin-animation' : ''} /> Sync
            </button>

            <button onClick={onClose} style={closeBtnStyle} title="Close (Esc)">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body: Left Control Panel | Right Diff Viewer */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Panel: Tabs for Changes, Commits, and Emergency Drafts */}
          <div style={sidebarPanelStyle}>
            {/* Tab Segment Switcher */}
            <div style={{ display: 'flex', padding: 8, gap: 4, borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-0)' }}>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('changes');
                  setInspectingWorkingTree(true);
                }}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  fontSize: 11,
                  fontWeight: activeTab === 'changes' ? 700 : 500,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  backgroundColor: activeTab === 'changes' ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
                  color: activeTab === 'changes' ? '#38bdf8' : 'var(--text-muted)',
                }}
              >
                <GitCommit size={12} />
                <span>Changes</span>
                {!isWorkingClean && (
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 999, backgroundColor: '#f59e0b', color: '#000', fontWeight: 700 }}>
                    {workingTreeStatus?.files.length || '!'}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('commits');
                  setInspectingWorkingTree(false);
                }}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  fontSize: 11,
                  fontWeight: activeTab === 'commits' ? 700 : 500,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  backgroundColor: activeTab === 'commits' ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
                  color: activeTab === 'commits' ? '#38bdf8' : 'var(--text-muted)',
                }}
              >
                <Clock size={12} />
                <span>Commits ({safeCheckpoints.filter(c => !c.isAutoSave).length})</span>
              </button>

              {emergencyDraft && (
                <button
                  type="button"
                  onClick={() => setActiveTab('drafts')}
                  style={{
                    padding: '5px 8px',
                    fontSize: 11,
                    fontWeight: activeTab === 'drafts' ? 700 : 500,
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: activeTab === 'drafts' ? 'rgba(239, 68, 68, 0.18)' : 'transparent',
                    color: activeTab === 'drafts' ? '#f87171' : 'var(--text-muted)',
                  }}
                  title="Crash-recovery safety draft"
                >
                  <ShieldAlert size={12} />
                </button>
              )}
            </div>

            {/* TAB 1: CHANGES & COMMIT FORM */}
            {activeTab === 'changes' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
                {/* Working Tree Changes List */}
                <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Working Tree Changes
                    </span>
                    {workingTreeStatus && (
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>+{workingTreeStatus.totalAdditions}</span>{' '}
                        <span style={{ color: '#f43f5e', fontWeight: 700 }}>-{workingTreeStatus.totalDeletions}</span>
                      </span>
                    )}
                  </div>

                  {isWorkingClean ? (
                    <div style={{ padding: '16px 8px', textAlign: 'center', color: '#10b981', fontSize: 11.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <Check size={20} />
                      <span>Working tree clean. All changes committed to main.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {projectDiffSummaries.filter(f => f.status !== 'unchanged').map(f => {
                        const isSelected = selectedFileName === f.fileName && inspectingWorkingTree;
                        return (
                          <div
                            key={f.fileName}
                            onClick={() => {
                              setSelectedFileName(f.fileName);
                              setInspectingWorkingTree(true);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '5px 8px',
                              borderRadius: 4,
                              cursor: 'pointer',
                              backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.14)' : 'var(--bg-surface-0)',
                              border: `1px solid ${isSelected ? '#38bdf8' : 'var(--border-subtle)'}`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span className={`file-status-pill-${f.status[0]}`}>
                                {f.status[0].toUpperCase()}
                              </span>
                              <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: isSelected ? '#38bdf8' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {f.fileName}
                              </span>
                            </div>
                            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                              <span style={{ color: '#10b981' }}>+{f.additions}</span>{' '}
                              <span style={{ color: '#f43f5e' }}>-{f.deletions}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Commit Composer Box */}
                <form onSubmit={handleCommitSubmit} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-0)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Commit Message
                    </span>
                    <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Ctrl+Enter to commit</span>
                  </div>

                  <input
                    type="text"
                    placeholder="e.g. feat: write experimental evaluation"
                    value={commitMessage}
                    onChange={e => setCommitMessage(e.target.value)}
                    style={{
                      padding: '7px 10px',
                      fontSize: 12,
                      backgroundColor: 'var(--bg-app)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 4,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  />

                  <textarea
                    placeholder="Extended commit description (optional notes for collaborators)..."
                    value={commitDescription}
                    onChange={e => setCommitDescription(e.target.value)}
                    rows={2}
                    style={{
                      padding: '6px 10px',
                      fontSize: 11,
                      backgroundColor: 'var(--bg-app)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 4,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-sans)',
                      resize: 'none',
                    }}
                  />

                  <button
                    type="submit"
                    disabled={!commitMessage.trim()}
                    className="btn-primary"
                    style={{
                      padding: '8px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      opacity: commitMessage.trim() ? 1 : 0.5,
                      cursor: commitMessage.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <GitCommit size={14} />
                    <span>Commit to main</span>
                  </button>
                </form>
              </div>
            )}

            {/* TAB 2: COMMIT LOG & TIMELINE GRAPH */}
            {activeTab === 'commits' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {/* Search Bar */}
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', position: 'relative' }}>
                  <Search size={12} color="var(--text-muted)" style={{ position: 'absolute', left: 20, top: 16 }} />
                  <input
                    type="text"
                    placeholder="Search commits by message, SHA or author..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 8px 5px 28px',
                      fontSize: 11,
                      backgroundColor: 'var(--bg-surface-0)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 4,
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                {/* Timeline List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(() => {
                    const filtered = safeCheckpoints.filter(c => {
                      if (c.isAutoSave) return false; // Strictly omit noisy autosaves from clean commit log
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        c.name.toLowerCase().includes(q) ||
                        (c.description && c.description.toLowerCase().includes(q)) ||
                        c.author.toLowerCase().includes(q) ||
                        c.shortSha?.toLowerCase().includes(q)
                      );
                    });

                    if (filtered.length === 0) {
                      return (
                        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                          {searchQuery ? 'No commits match your search query.' : 'No commits recorded yet. Make your first commit on the Changes tab!'}
                        </div>
                      );
                    }

                    return filtered.map((cp) => {
                      const isSelected = cp.id === selectedCheckpointId && !inspectingWorkingTree;
                      return (
                        <div
                          key={cp.id}
                          className={`git-commit-node ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => {
                            setSelectedCheckpointId(cp.id);
                            setInspectingWorkingTree(false);
                          }}
                          style={{
                            padding: '8px 10px',
                            backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-surface-0)',
                            border: `1px solid ${isSelected ? '#38bdf8' : 'var(--border-subtle)'}`,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                              <GitCommit size={14} color={isSelected ? '#38bdf8' : '#94a3b8'} style={{ flexShrink: 0 }} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? '#38bdf8' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {cp.name}
                              </span>
                            </div>

                            <span
                              className="git-sha-badge"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopySha(cp.shortSha || cp.id.slice(0, 7));
                              }}
                              title="Click to copy commit hash"
                            >
                              {copiedSha === (cp.shortSha || cp.id.slice(0, 7)) ? <Check size={10} color="#10b981" /> : cp.shortSha || cp.id.slice(0, 7)}
                            </span>
                          </div>

                          {cp.description && (
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 4, lineClamp: 2, overflow: 'hidden' }}>
                              {cp.description}
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                            <span>{cp.author} • {cp.timestamp}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {cp.stats && (
                                <span style={{ fontFamily: 'var(--font-mono)' }}>
                                  <span style={{ color: '#10b981' }}>+{cp.stats.additions}</span>{' '}
                                  <span style={{ color: '#f43f5e' }}>-{cp.stats.deletions}</span>
                                </span>
                              )}
                              {onDeleteCheckpoint && safeCheckpoints.length > 1 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Delete checkpoint "${cp.name}"?`)) {
                                      onDeleteCheckpoint(cp.id);
                                    }
                                  }}
                                  className="btn-ghost"
                                  style={{ padding: '2px 4px', fontSize: 10, color: 'var(--text-muted)' }}
                                  title="Delete checkpoint"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* TAB 3: EMERGENCY DRAFTS (ACCIDENT RECOVERY SAFETY NET) */}
            {activeTab === 'drafts' && emergencyDraft && (
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ padding: 10, borderRadius: 6, backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f87171', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    <ShieldAlert size={14} />
                    <span>Emergency Crash Draft Found</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>
                    Teeex silently saves local recovery drafts so power cuts or closed browser tabs never lose your uncommitted keystrokes.
                  </p>
                </div>

                <div style={{ padding: 10, borderRadius: 6, backgroundColor: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', fontSize: 11.5 }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Last saved uncommitted draft:</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {new Date(emergencyDraft.timestamp).toLocaleString()}
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                    Contains {emergencyDraft.fileCount} file(s)
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRestoreEmergencyDraft}
                  className="btn-primary"
                  style={{ padding: '8px 12px', fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Undo2 size={13} />
                  <span>Restore Emergency Draft</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Panel: High-Contrast Visual Diff Viewer */}
          <div style={diffPanelStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Diff Sub-Header: Comparison context + File Tabs + View Switcher + Actions */}
              <div style={diffSubHeaderStyle}>
                {/* File Selector Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', flex: 1 }}>
                  {projectDiffSummaries.map(f => {
                    const isFileSelected = f.fileName === selectedFileName;
                    return (
                      <button
                        key={f.fileName}
                        type="button"
                        onClick={() => setSelectedFileName(f.fileName)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
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
                        <span className={`file-status-pill-${f.status[0]}`}>{f.status[0].toUpperCase()}</span>
                        <span>{f.fileName}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Diff Stats Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ color: '#10b981', fontWeight: 700 }}>+{activeDiffResult.additions}</span>
                    <span style={{ color: '#f43f5e', fontWeight: 700 }}>-{activeDiffResult.deletions}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{activeDiffResult.unchanged} unchanged</span>
                  </div>

                  {/* Unified vs Side-by-Side Switch */}
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
                        fontWeight: diffMode === 'unified' ? 700 : 500,
                      }}
                      title="Unified inline diff view"
                    >
                      <AlignLeft size={11} /> Unified
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
                        fontWeight: diffMode === 'split' ? 700 : 500,
                      }}
                      title="Side-by-side split diff view"
                    >
                      <Columns size={11} /> Side-by-Side
                    </button>
                  </div>

                  {/* Actions for this file / commit */}
                  {onRestoreSingleFile && !inspectingWorkingTree && (
                    <button
                      type="button"
                      onClick={handleRestoreFile}
                      className="btn-ghost"
                      style={{ padding: '3px 7px', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 3, color: '#38bdf8' }}
                      title="Restore only this file from this commit"
                    >
                      <Undo2 size={11} /> Restore File
                    </button>
                  )}

                  {!inspectingWorkingTree && selectedCheckpoint && (
                    <button
                      type="button"
                      onClick={handleRestoreCommit}
                      className="btn-primary"
                      style={{ padding: '3px 9px', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      title="Roll back entire project to this commit"
                    >
                      <Undo2 size={11} /> Checkout Commit
                    </button>
                  )}

                  {!inspectingWorkingTree && selectedCheckpoint && (
                    <button
                      type="button"
                      onClick={handleDownloadZip}
                      className="btn-ghost"
                      style={{ padding: '3px 7px', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                      title="Download ZIP at this commit"
                    >
                      <Download size={11} /> ZIP
                    </button>
                  )}
                </div>
              </div>

              {/* Comparison Legend Context Banner */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', fontSize: 10, backgroundColor: 'var(--bg-surface-0)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Comparing:</span>
                  <span style={{ color: '#f43f5e', fontWeight: 600 }}>{comparison.labelOld}</span>
                  <ArrowRight size={10} />
                  <span style={{ color: '#10b981', fontWeight: 600 }}>{comparison.labelNew}</span>
                </div>
                <div>{activeFileDiff?.fileName || 'No file selected'}</div>
              </div>

              {/* Diff Code Container */}
              <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-app)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.6 }}>
                {diffMode === 'unified' ? (
                  /* UNIFIED INLINE VIEW */
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {activeDiffResult.lines.map((line, idx) => {
                      const isAdded = line.type === 'added';
                      const isRemoved = line.type === 'removed';

                      return (
                        <div
                          key={idx}
                          className={isAdded ? 'diff-line-added' : isRemoved ? 'diff-line-removed' : ''}
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
                          {/* Line numbers */}
                          <span style={{ width: 34, textAlign: 'right', paddingRight: 6, color: 'var(--text-faint)', userSelect: 'none', flexShrink: 0 }}>
                            {line.oldLineNumber || ''}
                          </span>
                          <span style={{ width: 34, textAlign: 'right', paddingRight: 6, color: 'var(--text-faint)', userSelect: 'none', flexShrink: 0, borderRight: '1px solid var(--border-subtle)' }}>
                            {line.newLineNumber || ''}
                          </span>
                          {/* Marker */}
                          <span style={{ width: 18, textAlign: 'center', fontWeight: 700, userSelect: 'none', color: isAdded ? '#10b981' : isRemoved ? '#f43f5e' : 'var(--text-faint)', flexShrink: 0 }}>
                            {isAdded ? '+' : isRemoved ? '−' : ' '}
                          </span>
                          {/* Code Content with Word Highlighting */}
                          <span style={{ flex: 1, color: isAdded ? '#34d399' : isRemoved ? '#f87171' : 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {line.tokens && line.tokens.length > 0 ? (
                              line.tokens.map((tok, tIdx) => {
                                if (tok.type === 'added') {
                                  return (
                                    <span key={tIdx} className="diff-word-added">
                                      {tok.text}
                                    </span>
                                  );
                                }
                                if (tok.type === 'removed') {
                                  return (
                                    <span key={tIdx} className="diff-word-removed">
                                      {tok.text}
                                    </span>
                                  );
                                }
                                return <span key={tIdx}>{tok.text}</span>;
                              })
                            ) : (
                              line.text
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* SIDE-BY-SIDE SPLIT VIEW */
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-0)', position: 'sticky', top: 0, zIndex: 2 }}>
                      <div style={{ flex: 1, padding: '4px 12px', fontSize: 10, fontWeight: 700, color: '#f43f5e', borderRight: '1px solid var(--border-subtle)' }}>
                        OLD: {comparison.labelOld}
                      </div>
                      <div style={{ flex: 1, padding: '4px 12px', fontSize: 10, fontWeight: 700, color: '#10b981' }}>
                        NEW: {comparison.labelNew}
                      </div>
                    </div>

                    {activeDiffResult.splitRows.map((row, idx) => {
                      const left = row.left;
                      const right = row.right;

                      return (
                        <div key={idx} style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          {/* Left Column (Old) */}
                          <div
                            style={{
                              flex: 1,
                              display: 'flex',
                              padding: '1px 6px',
                              borderRight: '1px solid var(--border-subtle)',
                              backgroundColor: left?.type === 'removed' ? 'rgba(244, 63, 94, 0.12)' : 'transparent',
                              borderLeft: left?.type === 'removed' ? '3px solid #f43f5e' : '3px solid transparent',
                              color: left?.type === 'removed' ? '#f87171' : 'var(--text-secondary)',
                              minWidth: 0,
                            }}
                          >
                            <span style={{ width: 30, textAlign: 'right', paddingRight: 6, color: 'var(--text-faint)', userSelect: 'none', flexShrink: 0 }}>
                              {left?.lineNumber || ''}
                            </span>
                            <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {left?.tokens && left.tokens.length > 0 ? (
                                left.tokens.map((tok, tIdx) => (
                                  <span key={tIdx} className={tok.type === 'removed' ? 'diff-word-removed' : ''}>
                                    {tok.text}
                                  </span>
                                ))
                              ) : (
                                left?.text || ''
                              )}
                            </span>
                          </div>

                          {/* Right Column (New) */}
                          <div
                            style={{
                              flex: 1,
                              display: 'flex',
                              padding: '1px 6px',
                              backgroundColor: right?.type === 'added' ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                              borderLeft: right?.type === 'added' ? '3px solid #10b981' : '3px solid transparent',
                              color: right?.type === 'added' ? '#34d399' : 'var(--text-primary)',
                              minWidth: 0,
                            }}
                          >
                            <span style={{ width: 30, textAlign: 'right', paddingRight: 6, color: 'var(--text-faint)', userSelect: 'none', flexShrink: 0 }}>
                              {right?.lineNumber || ''}
                            </span>
                            <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {right?.tokens && right.tokens.length > 0 ? (
                                right.tokens.map((tok, tIdx) => (
                                  <span key={tIdx} className={tok.type === 'added' ? 'diff-word-added' : ''}>
                                    {tok.text}
                                  </span>
                                ))
                              ) : (
                                right?.text || ''
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Floating Toast Notification */}
        {restoredToast && (
          <div
            style={{
              position: 'absolute',
              bottom: 24,
              right: 24,
              backgroundColor: '#10b981',
              color: '#000',
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              zIndex: 100,
            }}
          >
            <Check size={14} />
            <span>
              {restoredToast === 'commit'
                ? 'Project checked out to historical commit!'
                : restoredToast === 'draft'
                ? 'Emergency crash draft restored!'
                : 'File restored successfully!'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// Layout Styles
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.72)',
  backdropFilter: 'blur(4px)',
  zIndex: 1100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 1200,
  height: '88vh',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-medium)',
  borderRadius: 10,
  boxShadow: '0 20px 45px rgba(0, 0, 0, 0.55)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  position: 'relative',
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
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 4,
};

const sidebarPanelStyle: React.CSSProperties = {
  width: 330,
  borderRight: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  flexShrink: 0,
};

const diffPanelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  backgroundColor: 'var(--bg-app)',
};

const diffSubHeaderStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};
