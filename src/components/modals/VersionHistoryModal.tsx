import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Copy,
  FileText,
  ChevronDown,
  Plus,
} from 'lucide-react';
import type { ProjectFile } from '../../types/latex';
import {
  computeLineDiff,
  computeProjectFileDiffs,
  type DiffResult,
  type FileDiffSummary,
} from '../../services/diffService';
import {
  getProjectBranches,
  getActiveBranch,
  setActiveBranch,
  createBranch,
  type Checkpoint,
  type WorkingTreeStatus,
} from '../../services/checkpointsService';
import { readEmergencyDraft, type RecoveredDraftInfo } from '../../hooks/useAutosaveRecovery';

export type { Checkpoint };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  checkpoints: Checkpoint[];
  currentFiles: ProjectFile[];
  workingTreeStatus?: WorkingTreeStatus;
  activeBranch?: string;
  branches?: string[];
  onSwitchBranch?: (branchName: string, checkoutHead?: boolean) => void;
  onCreateBranch?: (branchName: string) => void;
  onDeleteBranch?: (branchName: string) => void;
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

const ROW_HEIGHT = 22;
const OVERSCAN = 15;

export const VersionHistoryModal: React.FC<Props> = ({
  isOpen,
  onClose,
  checkpoints = [],
  currentFiles = [],
  workingTreeStatus,
  activeBranch,
  branches,
  onSwitchBranch,
  onCreateBranch,
  onDeleteBranch,
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

  // Branch management
  const effectiveActiveBranch = activeBranch || getActiveBranch(activeProjectId) || 'main';
  const safeBranches = branches || getProjectBranches(activeProjectId) || ['main'];
  const [isBranchPopoverOpen, setIsBranchPopoverOpen] = useState(false);
  const [branchSearchQuery, setBranchSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState<'all' | 'current'>('all');

  // Derive working tree if not passed
  const isWorkingClean = workingTreeStatus
    ? workingTreeStatus.isClean
    : safeCheckpoints.length > 0 &&
      safeCheckpoints[0].files.length === safeCurrentFiles.length &&
      safeCurrentFiles.every(f => {
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

  // View mode: 'diff' (what changed) vs 'snapshot' (full older version file reader)
  const [viewMode, setViewMode] = useState<'diff' | 'snapshot'>('diff');
  // Diff sub-mode: 'unified' vs 'split'
  const [diffMode, setDiffMode] = useState<'split' | 'unified'>('unified');
  // Comparison target: 'parent' (compare commit to parent) vs 'current' (compare commit to current working tree)
  const [comparisonTarget, setComparisonTarget] = useState<'parent' | 'current'>('parent');

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
  const [copiedCode, setCopiedCode] = useState(false);

  // Virtualization Scroll & Viewport Measurement
  const virtualViewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    const el = virtualViewportRef.current;
    if (!el) return;

    const onScroll = () => {
      setScrollTop(el.scrollTop);
    };
    const onResize = () => {
      setViewportHeight(el.clientHeight);
    };

    onResize();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [viewMode, diffMode, selectedFileName]);

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
      return {
        oldFiles,
        newFiles,
        labelOld: headCommit ? `HEAD (${headCommit.shortSha || 'head'})` : 'Initial',
        labelNew: 'Working Tree (Uncommitted)',
        isRootBaseline: false,
      };
    }

    if (!selectedCheckpoint) {
      return {
        oldFiles: [],
        newFiles: safeCurrentFiles,
        labelOld: 'Base',
        labelNew: 'Current',
        isRootBaseline: false,
      };
    }

    if (comparisonTarget === 'current') {
      return {
        oldFiles: selectedCheckpoint.files,
        newFiles: safeCurrentFiles,
        labelOld: `${selectedCheckpoint.name} (${selectedCheckpoint.shortSha || selectedCheckpoint.id.slice(0, 7)})`,
        labelNew: 'Current Working Tree',
        isRootBaseline: false,
      };
    }

    // Default 'parent' comparison
    const parent = selectedCheckpoint.parentId ? safeCheckpoints.find(c => c.id === selectedCheckpoint.parentId) : null;
    const isRoot = !parent;
    const oldFiles = parent ? parent.files : [];
    const newFiles = selectedCheckpoint.files;

    return {
      oldFiles,
      newFiles,
      labelOld: parent ? `${parent.name} (${parent.shortSha})` : 'Root / Init (Baseline)',
      labelNew: `${selectedCheckpoint.name} (${selectedCheckpoint.shortSha || selectedCheckpoint.id.slice(0, 7)})`,
      isRootBaseline: isRoot,
    };
  }, [inspectingWorkingTree, headCommit, safeCurrentFiles, selectedCheckpoint, safeCheckpoints, comparisonTarget]);

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

  // Full file snapshot content for "View Older Version"
  const snapshotContent = useMemo(() => {
    if (inspectingWorkingTree) {
      return safeCurrentFiles.find(f => f.name === selectedFileName)?.content || '';
    }
    return selectedCheckpoint?.files.find(f => f.name === selectedFileName)?.content || '';
  }, [inspectingWorkingTree, safeCurrentFiles, selectedCheckpoint, selectedFileName]);

  const snapshotLines = useMemo(() => {
    if (!snapshotContent) return [];
    return snapshotContent.split('\n');
  }, [snapshotContent]);

  // Virtualization window calculations
  const virtualUnifiedWindow = useMemo(() => {
    const totalCount = activeDiffResult.lines.length;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(totalCount, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
    return {
      totalCount,
      startIndex,
      endIndex,
      topPadding: startIndex * ROW_HEIGHT,
      bottomPadding: Math.max(0, (totalCount - endIndex) * ROW_HEIGHT),
      visibleItems: activeDiffResult.lines.slice(startIndex, endIndex),
    };
  }, [activeDiffResult.lines, scrollTop, viewportHeight]);

  const virtualSplitWindow = useMemo(() => {
    const totalCount = activeDiffResult.splitRows.length;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(totalCount, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
    return {
      totalCount,
      startIndex,
      endIndex,
      topPadding: startIndex * ROW_HEIGHT,
      bottomPadding: Math.max(0, (totalCount - endIndex) * ROW_HEIGHT),
      visibleItems: activeDiffResult.splitRows.slice(startIndex, endIndex),
    };
  }, [activeDiffResult.splitRows, scrollTop, viewportHeight]);

  const virtualSnapshotWindow = useMemo(() => {
    const totalCount = snapshotLines.length;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(totalCount, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
    return {
      totalCount,
      startIndex,
      endIndex,
      topPadding: startIndex * ROW_HEIGHT,
      bottomPadding: Math.max(0, (totalCount - endIndex) * ROW_HEIGHT),
      visibleItems: snapshotLines.slice(startIndex, endIndex),
    };
  }, [snapshotLines, scrollTop, viewportHeight]);

  // Calculate sync status (ahead commits)
  const aheadCount = useMemo(() => {
    return safeCheckpoints.filter(c => !c.isSyncedToCloud && !c.isAutoSave).length;
  }, [safeCheckpoints]);

  // Filtered branches for switcher
  const filteredBranches = useMemo(() => {
    if (!branchSearchQuery.trim()) return safeBranches;
    const q = branchSearchQuery.toLowerCase();
    return safeBranches.filter(b => b.toLowerCase().includes(q));
  }, [safeBranches, branchSearchQuery]);

  const handleSwitchToBranch = (b: string) => {
    if (onSwitchBranch) {
      onSwitchBranch(b, true);
    } else {
      setActiveBranch(activeProjectId, b);
    }
  };

  const handleCreateNewBranch = (name: string) => {
    if (onCreateBranch) {
      onCreateBranch(name);
    } else {
      createBranch(activeProjectId, name);
    }
    setBranchSearchQuery('');
    setIsBranchPopoverOpen(false);
  };

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

                {/* Interactive Branch Switcher Popover Trigger */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setIsBranchPopoverOpen(prev => !prev)}
                    className="btn-ghost"
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 4,
                      backgroundColor: isCloudConnected ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface-2)',
                      color: isCloudConnected ? '#10b981' : '#38bdf8',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      border: '1px solid var(--border-subtle)',
                    }}
                    title="Switch or create Git branches"
                  >
                    <GitBranch size={12} />
                    <span>branch: {effectiveActiveBranch}</span>
                    <ChevronDown size={11} style={{ transform: isBranchPopoverOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                  </button>

                  {/* Branch Dropdown Popover */}
                  {isBranchPopoverOpen && (
                    <div className="git-branch-dropdown-popover">
                      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>Switch Branch</span>
                        <button
                          type="button"
                          onClick={() => setIsBranchPopoverOpen(false)}
                          className="btn-ghost"
                          style={{ padding: '1px 4px', fontSize: 11, color: 'var(--text-muted)' }}
                        >
                          ✕
                        </button>
                      </div>

                      <div style={{ padding: 6, borderBottom: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', backgroundColor: 'var(--bg-app)', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                          <Search size={11} color="var(--text-muted)" />
                          <input
                            type="text"
                            placeholder="Find or create branch..."
                            value={branchSearchQuery}
                            onChange={(e) => setBranchSearchQuery(e.target.value)}
                            style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 11, width: '100%' }}
                          />
                        </div>
                      </div>

                      <div style={{ maxHeight: 180, overflowY: 'auto', padding: 4 }}>
                        {filteredBranches.map(b => {
                          const isActive = b === effectiveActiveBranch;
                          return (
                            <div
                              key={b}
                              className={`git-branch-item ${isActive ? 'is-active' : ''}`}
                              onClick={() => {
                                handleSwitchToBranch(b);
                                setIsBranchPopoverOpen(false);
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <GitBranch size={12} />
                                <span>{b}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {isActive && <Check size={12} color="#38bdf8" />}
                                {b !== 'main' && !isActive && onDeleteBranch && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (window.confirm(`Delete branch "${b}"?`)) {
                                        onDeleteBranch(b);
                                      }
                                    }}
                                    className="btn-ghost"
                                    style={{ padding: '1px 3px', color: 'var(--text-muted)' }}
                                    title="Delete branch"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {branchSearchQuery.trim() && !safeBranches.includes(branchSearchQuery.trim().toLowerCase()) && (
                        <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-0)' }}>
                          <button
                            type="button"
                            onClick={() => handleCreateNewBranch(branchSearchQuery.trim())}
                            className="btn-primary"
                            style={{ width: '100%', fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                          >
                            <Plus size={12} />
                            <span>Create branch: {branchSearchQuery.trim().toLowerCase()}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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

        {/* Content Body: Left Control Panel | Right Diff & Snapshot Viewer */}
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
                  setViewMode('diff');
                }}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'changes' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: activeTab === 'changes' ? '#38bdf8' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: isWorkingClean ? '#10b981' : '#f59e0b' }} />
                <span>Changes</span>
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
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'commits' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: activeTab === 'commits' ? '#38bdf8' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <GitCommit size={12} />
                <span>Commits ({safeCheckpoints.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('drafts')}
                style={{
                  padding: '5px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'drafts' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                  color: activeTab === 'drafts' ? '#f87171' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
                title="Emergency crash drafts (accident recovery)"
              >
                <ShieldAlert size={12} />
              </button>
            </div>

            {/* TAB 1: CHANGES (WORKING TREE & COMMIT COMPOSER) */}
            {activeTab === 'changes' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {/* Working Tree File Status List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <span>Working Tree</span>
                    <span>{isWorkingClean ? 'Clean' : `${projectDiffSummaries.filter(d => d.status !== 'unchanged').length} changed`}</span>
                  </div>

                  {isWorkingClean ? (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                      <Check size={20} color="#10b981" style={{ margin: '0 auto 6px auto', display: 'block' }} />
                      <span>Working tree is clean. No uncommitted modifications.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                      {projectDiffSummaries.map((diff) => {
                        const isSelected = selectedFileName === diff.fileName;
                        return (
                          <div
                            key={diff.fileId}
                            onClick={() => {
                              setSelectedFileName(diff.fileName);
                              setInspectingWorkingTree(true);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '5px 8px',
                              borderRadius: 4,
                              cursor: 'pointer',
                              backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                              border: `1px solid ${isSelected ? '#38bdf8' : 'transparent'}`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span className={diff.status === 'modified' ? 'file-status-pill-m' : diff.status === 'added' ? 'file-status-pill-a' : 'file-status-pill-d'}>
                                {diff.status === 'modified' ? 'M' : diff.status === 'added' ? 'A' : 'D'}
                              </span>
                              <span style={{ fontSize: 11.5, color: isSelected ? '#38bdf8' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {diff.fileName}
                              </span>
                            </div>

                            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', display: 'inline-flex', gap: 4 }}>
                              {diff.additions > 0 && <span style={{ color: '#10b981' }}>+{diff.additions}</span>}
                              {diff.deletions > 0 && <span style={{ color: '#f43f5e' }}>-{diff.deletions}</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Commit Composer Form */}
                <form
                  onSubmit={handleCommitSubmit}
                  style={{
                    padding: 10,
                    borderTop: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-surface-0)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Commit Composer</span>
                    <span style={{ color: 'var(--text-faint)' }}>branch: {effectiveActiveBranch}</span>
                  </div>

                  <input
                    type="text"
                    placeholder="Commit message (e.g. feat: solve equations)"
                    value={commitMessage}
                    onChange={e => setCommitMessage(e.target.value)}
                    className="modal-input"
                    style={{ fontSize: 11.5, padding: '5px 8px' }}
                    required
                  />

                  <textarea
                    placeholder="Optional description / extended notes..."
                    value={commitDescription}
                    onChange={e => setCommitDescription(e.target.value)}
                    className="modal-input"
                    rows={2}
                    style={{ fontSize: 11, padding: '4px 8px', resize: 'none' }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ctrl+Enter to commit</span>
                    <button
                      type="submit"
                      disabled={!commitMessage.trim()}
                      className="btn-primary"
                      style={{ fontSize: 11, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      <GitCommit size={12} />
                      <span>Commit to {effectiveActiveBranch}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 2: COMMITS (GIT TIMELINE GRAPH & RESTORE ACTIONS) */}
            {activeTab === 'commits' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {/* Branch Filter Pills */}
                <div style={{ display: 'flex', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-0)' }}>
                  <button
                    type="button"
                    onClick={() => setBranchFilter('all')}
                    style={{
                      padding: '2px 8px',
                      fontSize: 10.5,
                      borderRadius: 12,
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: branchFilter === 'all' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                      color: branchFilter === 'all' ? '#38bdf8' : 'var(--text-muted)',
                      fontWeight: branchFilter === 'all' ? 700 : 500,
                    }}
                  >
                    All ({safeCheckpoints.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBranchFilter('current')}
                    style={{
                      padding: '2px 8px',
                      fontSize: 10.5,
                      borderRadius: 12,
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: branchFilter === 'current' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                      color: branchFilter === 'current' ? '#38bdf8' : 'var(--text-muted)',
                      fontWeight: branchFilter === 'current' ? 700 : 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <GitBranch size={10} />
                    <span>{effectiveActiveBranch} ({safeCheckpoints.filter(c => (c.branch || 'main') === effectiveActiveBranch).length})</span>
                  </button>
                </div>

                {/* Search Bar */}
                <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', backgroundColor: 'var(--bg-surface-0)', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                    <Search size={11} color="var(--text-muted)" />
                    <input
                      type="text"
                      placeholder="Search commits by message, SHA or author..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 11, width: '100%' }}
                    />
                  </div>
                </div>

                {/* Commit Timeline Graph */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(() => {
                    let filtered = safeCheckpoints;
                    if (branchFilter === 'current') {
                      filtered = filtered.filter(cp => (cp.branch || 'main') === effectiveActiveBranch);
                    }
                    if (searchQuery.trim()) {
                      const q = searchQuery.toLowerCase();
                      filtered = filtered.filter(cp =>
                        cp.name?.toLowerCase().includes(q) ||
                        cp.message?.toLowerCase().includes(q) ||
                        cp.author?.toLowerCase().includes(q) ||
                        cp.shortSha?.toLowerCase().includes(q)
                      );
                    }

                    if (filtered.length === 0) {
                      return (
                        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                          {searchQuery ? 'No commits match your search query.' : 'No commits on this branch. Make your first commit on the Changes tab!'}
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
                            // If commit has no parent (like initial baseline), default to Snapshot View for clean readability
                            if (!cp.parentId && safeCheckpoints[safeCheckpoints.length - 1]?.id === cp.id) {
                              setViewMode('snapshot');
                            }
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

          {/* Right Panel: High-Performance Virtualized Diff Viewer & Historical Snapshot Viewer */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--bg-app)' }}>
            {/* Top Toolbar: File Selector, View Mode Switcher, Comparison Switcher, Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-1)', gap: 8, flexWrap: 'wrap' }}>
              {/* File Pill Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', maxWidth: '40%' }}>
                {projectDiffSummaries.map((diff) => {
                  const isSelected = selectedFileName === diff.fileName;
                  return (
                    <button
                      key={diff.fileId}
                      type="button"
                      onClick={() => setSelectedFileName(diff.fileName)}
                      style={{
                        padding: '3px 8px',
                        fontSize: 11,
                        borderRadius: 4,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        border: `1px solid ${isSelected ? '#38bdf8' : 'var(--border-subtle)'}`,
                        backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-surface-0)',
                        color: isSelected ? '#38bdf8' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span className={diff.status === 'modified' ? 'file-status-pill-m' : diff.status === 'added' ? 'file-status-pill-a' : 'file-status-pill-d'}>
                        {diff.status === 'modified' ? 'M' : diff.status === 'added' ? 'A' : 'D'}
                      </span>
                      <span>{diff.fileName}</span>
                    </button>
                  );
                })}
              </div>

              {/* View Mode & Comparison Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* View Mode Toggle: [ Diff View | Snapshot View ] */}
                <div style={{ display: 'inline-flex', padding: 2, borderRadius: 4, backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)' }}>
                  <button
                    type="button"
                    onClick={() => setViewMode('diff')}
                    style={{
                      padding: '3px 8px',
                      fontSize: 10.5,
                      borderRadius: 3,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: viewMode === 'diff' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                      color: viewMode === 'diff' ? '#38bdf8' : 'var(--text-muted)',
                      fontWeight: viewMode === 'diff' ? 700 : 500,
                    }}
                    title="View green additions and red deletions"
                  >
                    <GitCommit size={11} /> Diff
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('snapshot')}
                    style={{
                      padding: '3px 8px',
                      fontSize: 10.5,
                      borderRadius: 3,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: viewMode === 'snapshot' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                      color: viewMode === 'snapshot' ? '#38bdf8' : 'var(--text-muted)',
                      fontWeight: viewMode === 'snapshot' ? 700 : 500,
                    }}
                    title="View older version as complete document"
                  >
                    <FileText size={11} /> View Older Version
                  </button>
                </div>

                {viewMode === 'diff' && (
                  <>
                    {/* Unified vs Side-by-Side */}
                    <div style={{ display: 'inline-flex', padding: 2, borderRadius: 4, backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)' }}>
                      <button
                        type="button"
                        onClick={() => setDiffMode('unified')}
                        style={{
                          padding: '3px 7px',
                          fontSize: 10.5,
                          borderRadius: 3,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: diffMode === 'unified' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                          color: diffMode === 'unified' ? '#38bdf8' : 'var(--text-muted)',
                          fontWeight: diffMode === 'unified' ? 700 : 500,
                        }}
                      >
                        <AlignLeft size={11} /> Unified
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiffMode('split')}
                        style={{
                          padding: '3px 7px',
                          fontSize: 10.5,
                          borderRadius: 3,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: diffMode === 'split' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                          color: diffMode === 'split' ? '#38bdf8' : 'var(--text-muted)',
                          fontWeight: diffMode === 'split' ? 700 : 500,
                        }}
                      >
                        <Columns size={11} /> Split
                      </button>
                    </div>

                    {/* Comparison Target: [ vs Parent | vs Current ] */}
                    {!inspectingWorkingTree && (
                      <div style={{ display: 'inline-flex', padding: 2, borderRadius: 4, backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)' }}>
                        <button
                          type="button"
                          onClick={() => setComparisonTarget('parent')}
                          style={{
                            padding: '3px 7px',
                            fontSize: 10,
                            borderRadius: 3,
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: comparisonTarget === 'parent' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                            color: comparisonTarget === 'parent' ? '#38bdf8' : 'var(--text-muted)',
                            fontWeight: comparisonTarget === 'parent' ? 700 : 500,
                          }}
                          title="Compare with parent commit"
                        >
                          vs Parent
                        </button>
                        <button
                          type="button"
                          onClick={() => setComparisonTarget('current')}
                          style={{
                            padding: '3px 7px',
                            fontSize: 10,
                            borderRadius: 3,
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: comparisonTarget === 'current' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                            color: comparisonTarget === 'current' ? '#38bdf8' : 'var(--text-muted)',
                            fontWeight: comparisonTarget === 'current' ? 700 : 500,
                          }}
                          title="Compare with current working editor"
                        >
                          vs Current
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Actions for this file / commit */}
                {viewMode === 'snapshot' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!navigator.clipboard) return;
                      navigator.clipboard.writeText(snapshotContent);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 1400);
                    }}
                    className="btn-ghost"
                    style={{ padding: '3px 8px', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    title="Copy full document code"
                  >
                    {copiedCode ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                    <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                )}

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
                <span>{viewMode === 'diff' ? 'Comparing:' : 'Viewing:'}</span>
                {viewMode === 'diff' ? (
                  <>
                    <span style={{ color: '#f43f5e', fontWeight: 600 }}>{comparison.labelOld}</span>
                    <ArrowRight size={10} />
                    <span style={{ color: '#10b981', fontWeight: 600 }}>{comparison.labelNew}</span>
                  </>
                ) : (
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                    {inspectingWorkingTree ? 'Current Working Editor' : `${selectedCheckpoint?.name} (${selectedCheckpoint?.shortSha})`}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>{selectedFileName}</span>
                {viewMode === 'diff' ? (
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: '#10b981' }}>+{activeDiffResult.additions}</span>{' '}
                    <span style={{ color: '#f43f5e' }}>-{activeDiffResult.deletions}</span>
                  </span>
                ) : (
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{snapshotLines.length} lines</span>
                )}
              </div>
            </div>

            {/* Root Baseline Helper Alert (When selecting baseline commit in diff mode) */}
            {viewMode === 'diff' && comparison.isRootBaseline && comparisonTarget === 'parent' && (
              <div style={{ padding: '8px 12px', backgroundColor: 'rgba(56, 189, 248, 0.08)', borderBottom: '1px solid rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#38bdf8' }}>
                  <Clock size={13} />
                  <span>Initial Project Baseline (no earlier parent). Switch to Snapshot View to inspect the full document, or Compare vs Current Editor.</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setViewMode('snapshot')}
                    className="btn-primary"
                    style={{ fontSize: 10.5, padding: '2px 8px' }}
                  >
                    View Document
                  </button>
                  <button
                    type="button"
                    onClick={() => setComparisonTarget('current')}
                    className="btn-ghost"
                    style={{ fontSize: 10.5, padding: '2px 8px' }}
                  >
                    Compare vs Current
                  </button>
                </div>
              </div>
            )}

            {/* High-Performance Virtualized Container */}
            <div
              ref={virtualViewportRef}
              className="virtual-diff-viewport"
              style={{ flex: 1, backgroundColor: 'var(--bg-app)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: `${ROW_HEIGHT}px` }}
            >
              {viewMode === 'snapshot' ? (
                /* SNAPSHOT FULL FILE CODE READER (VIRTUALIZED) */
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: virtualSnapshotWindow.topPadding }} />
                  {virtualSnapshotWindow.visibleItems.map((lineText, idx) => {
                    const lineNum = virtualSnapshotWindow.startIndex + idx + 1;
                    return (
                      <div key={lineNum} className="snapshot-line">
                        <span className="snapshot-line-num">{lineNum}</span>
                        <span className="snapshot-line-code">{lineText || ' '}</span>
                      </div>
                    );
                  })}
                  <div style={{ height: virtualSnapshotWindow.bottomPadding }} />
                </div>
              ) : diffMode === 'unified' ? (
                /* UNIFIED INLINE DIFF VIEW (VIRTUALIZED) */
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: virtualUnifiedWindow.topPadding }} />
                  {virtualUnifiedWindow.visibleItems.map((line, idx) => {
                    const absIdx = virtualUnifiedWindow.startIndex + idx;
                    const isAdded = line.type === 'added';
                    const isRemoved = line.type === 'removed';

                    return (
                      <div
                        key={absIdx}
                        className={isAdded ? 'diff-line-added' : isRemoved ? 'diff-line-removed' : ''}
                        style={{
                          display: 'flex',
                          height: ROW_HEIGHT,
                          boxSizing: 'border-box',
                          padding: '0 8px',
                          alignItems: 'center',
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
                        {/* Code Content with Intra-Line Word Highlighting */}
                        <span style={{ flex: 1, color: isAdded ? '#34d399' : isRemoved ? '#f87171' : 'var(--text-primary)', whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                  <div style={{ height: virtualUnifiedWindow.bottomPadding }} />
                </div>
              ) : (
                /* SIDE-BY-SIDE SPLIT VIEW (VIRTUALIZED) */
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-0)', position: 'sticky', top: 0, zIndex: 2 }}>
                    <div style={{ flex: 1, padding: '3px 8px', fontSize: 10, color: '#f43f5e', borderRight: '1px solid var(--border-subtle)', fontWeight: 600 }}>
                      Original: {comparison.labelOld}
                    </div>
                    <div style={{ flex: 1, padding: '3px 8px', fontSize: 10, color: '#10b981', fontWeight: 600 }}>
                      Modified: {comparison.labelNew}
                    </div>
                  </div>

                  <div style={{ height: virtualSplitWindow.topPadding }} />
                  {virtualSplitWindow.visibleItems.map((row, idx) => {
                    const absIdx = virtualSplitWindow.startIndex + idx;
                    const leftRemoved = row.left?.type === 'removed';
                    const rightAdded = row.right?.type === 'added';

                    return (
                      <div key={absIdx} style={{ display: 'flex', height: ROW_HEIGHT, boxSizing: 'border-box' }}>
                        {/* Left column (old) */}
                        <div
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 6px',
                            backgroundColor: leftRemoved ? 'rgba(244, 63, 94, 0.12)' : 'transparent',
                            borderRight: '1px solid var(--border-subtle)',
                            overflow: 'hidden',
                          }}
                        >
                          <span style={{ width: 30, textAlign: 'right', paddingRight: 6, color: 'var(--text-faint)', userSelect: 'none', flexShrink: 0 }}>
                            {row.left?.lineNumber || ''}
                          </span>
                          <span style={{ flex: 1, color: leftRemoved ? '#f87171' : 'var(--text-muted)', whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.left?.tokens ? (
                              row.left.tokens.map((tok, tIdx) => (
                                <span key={tIdx} className={tok.type === 'removed' ? 'diff-word-removed' : ''}>
                                  {tok.text}
                                </span>
                              ))
                            ) : (
                              row.left?.text || ''
                            )}
                          </span>
                        </div>

                        {/* Right column (new) */}
                        <div
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 6px',
                            backgroundColor: rightAdded ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                            overflow: 'hidden',
                          }}
                        >
                          <span style={{ width: 30, textAlign: 'right', paddingRight: 6, color: 'var(--text-faint)', userSelect: 'none', flexShrink: 0 }}>
                            {row.right?.lineNumber || ''}
                          </span>
                          <span style={{ flex: 1, color: rightAdded ? '#34d399' : 'var(--text-primary)', whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.right?.tokens ? (
                              row.right.tokens.map((tok, tIdx) => (
                                <span key={tIdx} className={tok.type === 'added' ? 'diff-word-added' : ''}>
                                  {tok.text}
                                </span>
                              ))
                            ) : (
                              row.right?.text || ''
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ height: virtualSplitWindow.bottomPadding }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Restored Toast Feedback */}
      {restoredToast && (
        <div style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', backgroundColor: '#10b981', color: '#fff', padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 10px 25px rgba(0,0,0,0.4)', zIndex: 9999 }}>
          <Check size={14} />
          <span>
            {restoredToast === 'commit'
              ? 'Project successfully checked out to this commit!'
              : restoredToast === 'file'
              ? `File "${selectedFileName}" restored from revision!`
              : 'Emergency draft restored!'}
          </span>
        </div>
      )}
    </div>
  );
};

// Styling Constants
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
  zIndex: 1050,
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  width: '95vw',
  maxWidth: 1280,
  height: '88vh',
  maxHeight: 900,
  backgroundColor: 'var(--bg-surface-1)',
  borderRadius: 12,
  border: '1px solid var(--border-medium)',
  boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.65)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'var(--bg-surface-0)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const sidebarPanelStyle: React.CSSProperties = {
  width: 320,
  borderRight: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-1)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};
