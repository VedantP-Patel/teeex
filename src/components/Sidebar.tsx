import React, { useState, useMemo } from 'react';
import {
  FileText,
  FileCode,
  Plus,
  Trash2,
  ListTree,
  FileSpreadsheet,
  BarChart2,
  History,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon
} from 'lucide-react';
import type { ProjectFile, ParsedDocument, ProjectRole } from '../types/latex';

interface Props {
  files: ProjectFile[];
  folders?: string[];
  activeFileId: string;
  onSelectFile: (fileId: string) => void;
  onCreateFile: (name: string, type: 'tex' | 'bib', targetFolder?: string) => void;
  onDeleteFile: (fileId: string) => void;
  onCreateFolder?: (folderName: string) => void;
  onDeleteFolder?: (folderName: string) => void;
  documentOutline: ParsedDocument['sections'];
  onJumpToLine: (line: number) => void;
  wordCount: number;
  equationCount: number;
  onOpenWordCount?: () => void;
  onOpenHistory?: () => void;
  role?: ProjectRole;
}

export const Sidebar: React.FC<Props> = ({
  files,
  folders = ['sections', 'figures'],
  activeFileId,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  onCreateFolder,
  onDeleteFolder,
  documentOutline,
  onJumpToLine,
  wordCount,
  equationCount,
  onOpenWordCount,
  onOpenHistory,
  role = 'owner',
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'outline'>('files');

  // Creation Modes: null | 'root-file' | 'root-folder' | `folder:${folderName}`
  const [creationMode, setCreationMode] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');

  // Open Folders Set
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set(folders));

  const toggleFolder = (fName: string) => {
    setOpenFolders(prev => {
      const next = new Set(prev);
      if (next.has(fName)) next.delete(fName);
      else next.add(fName);
      return next;
    });
  };

  // Helper: Extract folder of a file
  const getFileFolder = (f: ProjectFile): string | null => {
    if (f.folder) return f.folder;
    if (f.name.includes('/')) {
      return f.name.split('/')[0];
    }
    return null;
  };

  // Helper: Display name without folder prefix
  const getFileDisplayName = (f: ProjectFile): string => {
    if (f.name.includes('/')) {
      const parts = f.name.split('/');
      return parts[parts.length - 1];
    }
    return f.name;
  };

  // Aggregate all unique folders
  const allFolders = useMemo(() => {
    const set = new Set<string>(folders);
    files.forEach(f => {
      const fFolder = getFileFolder(f);
      if (fFolder) set.add(fFolder);
    });
    return Array.from(set).sort();
  }, [folders, files]);

  // Group files by folder
  const filesByFolder = useMemo(() => {
    const map = new Map<string, ProjectFile[]>();
    allFolders.forEach(f => map.set(f, []));
    files.forEach(f => {
      const folderName = getFileFolder(f);
      if (folderName) {
        if (!map.has(folderName)) map.set(folderName, []);
        map.get(folderName)!.push(f);
      }
    });
    return map;
  }, [allFolders, files]);

  // Files at root
  const rootFiles = useMemo(() => {
    return files.filter(f => getFileFolder(f) === null);
  }, [files]);

  // Handle Form Submission
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newItemName.trim();
    if (!clean) {
      setCreationMode(null);
      return;
    }

    if (creationMode === 'root-folder') {
      if (onCreateFolder) {
        onCreateFolder(clean);
      }
      setOpenFolders(prev => new Set(prev).add(clean));
    } else if (creationMode === 'root-file') {
      const isBib = clean.endsWith('.bib');
      if (clean.includes('/')) {
        const parts = clean.split('/');
        const folderPart = parts.slice(0, -1).join('/');
        if (onCreateFolder) onCreateFolder(folderPart);
        onCreateFile(clean, isBib ? 'bib' : 'tex', folderPart);
      } else {
        onCreateFile(clean, isBib ? 'bib' : 'tex');
      }
    } else if (creationMode?.startsWith('folder:')) {
      const targetFolder = creationMode.replace('folder:', '');
      const isBib = clean.endsWith('.bib');
      onCreateFile(clean, isBib ? 'bib' : 'tex', targetFolder);
      setOpenFolders(prev => new Set(prev).add(targetFolder));
    }

    setNewItemName('');
    setCreationMode(null);
  };

  const getFileIcon = (f: ProjectFile, isActive: boolean) => {
    if (f.type === 'image' || f.name.match(/\.(png|jpe?g|svg|pdf)$/i)) {
      return <ImageIcon size={13} color="#10b981" />;
    }
    if (f.name.endsWith('.bib') || f.type === 'bib') {
      return <FileSpreadsheet size={13} color="#f59e0b" />;
    }
    if (f.name.endsWith('.tex') || f.type === 'tex') {
      return <FileCode size={13} color={isActive ? '#38bdf8' : 'var(--text-muted)'} />;
    }
    return <FileText size={13} color="var(--text-muted)" />;
  };

  return (
    <aside style={sidebarStyle}>
      {/* Tab Switcher */}
      <div style={tabBarStyle}>
        <button
          onClick={() => setActiveTab('files')}
          style={{
            ...tabButtonStyle,
            color: activeTab === 'files' ? '#38bdf8' : 'var(--text-secondary)',
            borderBottom: activeTab === 'files' ? '2px solid #38bdf8' : '2px solid transparent',
          }}
        >
          <FileText size={13} /> Files ({files.length})
        </button>

        <button
          onClick={() => setActiveTab('outline')}
          style={{
            ...tabButtonStyle,
            color: activeTab === 'outline' ? '#38bdf8' : 'var(--text-secondary)',
            borderBottom: activeTab === 'outline' ? '2px solid #38bdf8' : '2px solid transparent',
          }}
        >
          <ListTree size={13} /> Outline ({documentOutline.length})
        </button>
      </div>

      {/* Files List View */}
      {activeTab === 'files' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {/* Header & New File / New Folder Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px 8px 6px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              WORKSPACE FILES
            </span>
            {role !== 'viewer' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={() => {
                    setCreationMode('root-file');
                    setNewItemName('');
                  }}
                  className="btn-ghost"
                  style={{ padding: '3px 5px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
                  title="New File"
                >
                  <FilePlus size={13} color="#38bdf8" />
                  <span style={{ fontSize: 10, fontWeight: 600 }}>File</span>
                </button>

                <button
                  onClick={() => {
                    setCreationMode('root-folder');
                    setNewItemName('');
                  }}
                  className="btn-ghost"
                  style={{ padding: '3px 5px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
                  title="New Folder Directory"
                >
                  <FolderPlus size={13} color="#f59e0b" />
                  <span style={{ fontSize: 10, fontWeight: 600 }}>Folder</span>
                </button>
              </div>
            )}
          </div>

          {/* Inline creation input for root file */}
          {creationMode === 'root-file' && role !== 'viewer' && (
            <form onSubmit={handleCreateSubmit} style={{ padding: '4px 6px', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, backgroundColor: 'var(--bg-surface-1)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', border: '1px solid #38bdf8' }}>
                <FileCode size={13} color="#38bdf8" />
                <input
                  type="text"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="filename.tex or .bib"
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11.5, color: 'var(--text-primary)', outline: 'none' }}
                  autoFocus
                  onBlur={() => !newItemName && setCreationMode(null)}
                  onKeyDown={e => e.key === 'Escape' && setCreationMode(null)}
                />
              </div>
            </form>
          )}

          {/* Inline creation input for root folder */}
          {creationMode === 'root-folder' && role !== 'viewer' && (
            <form onSubmit={handleCreateSubmit} style={{ padding: '4px 6px', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, backgroundColor: 'var(--bg-surface-1)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', border: '1px solid #f59e0b' }}>
                <FolderPlus size={13} color="#f59e0b" />
                <input
                  type="text"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="folder name (e.g. sections)"
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11.5, color: 'var(--text-primary)', outline: 'none' }}
                  autoFocus
                  onBlur={() => !newItemName && setCreationMode(null)}
                  onKeyDown={e => e.key === 'Escape' && setCreationMode(null)}
                />
              </div>
            </form>
          )}

          {/* Folders & Nested Files */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {allFolders.map(folderName => {
              const folderFiles = filesByFolder.get(folderName) || [];
              const isOpen = openFolders.has(folderName);
              const isCreatingInThisFolder = creationMode === `folder:${folderName}`;

              return (
                <div key={folderName} style={{ marginBottom: 2 }}>
                  {/* Folder Row */}
                  <div
                    onClick={() => toggleFolder(folderName)}
                    style={folderRowStyle}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                      {isOpen ? (
                        <ChevronDown size={12} color="var(--text-muted)" />
                      ) : (
                        <ChevronRight size={12} color="var(--text-muted)" />
                      )}
                      {isOpen ? (
                        <FolderOpen size={13} color="#f59e0b" />
                      ) : (
                        <Folder size={13} color="#f59e0b" />
                      )}
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {folderName}
                      </span>
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', marginLeft: 2 }}>
                        ({folderFiles.length})
                      </span>
                    </div>

                    {role !== 'viewer' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setCreationMode(`folder:${folderName}`);
                            setOpenFolders(prev => new Set(prev).add(folderName));
                            setNewItemName('');
                          }}
                          className="btn-ghost"
                          style={{ padding: 2, color: 'var(--text-muted)' }}
                          title={`Add file to ${folderName}/`}
                        >
                          <Plus size={12} />
                        </button>
                        {onDeleteFolder && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (window.confirm(`Delete folder '${folderName}' and its files?`)) {
                                onDeleteFolder(folderName);
                              }
                            }}
                            className="btn-ghost"
                            style={{ padding: 2, color: 'var(--text-muted)' }}
                            title="Delete folder"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Folder Children */}
                  {isOpen && (
                    <div style={{ paddingLeft: 14, borderLeft: '1px solid rgba(255, 255, 255, 0.08)', marginLeft: 8, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {/* Sub-file Creation Input inside folder */}
                      {isCreatingInThisFolder && role !== 'viewer' && (
                        <form onSubmit={handleCreateSubmit} style={{ padding: '3px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, backgroundColor: 'var(--bg-surface-1)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', border: '1px solid #38bdf8' }}>
                            <FileCode size={12} color="#38bdf8" />
                            <input
                              type="text"
                              value={newItemName}
                              onChange={e => setNewItemName(e.target.value)}
                              placeholder="filename.tex in folder"
                              style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, color: 'var(--text-primary)', outline: 'none' }}
                              autoFocus
                              onBlur={() => !newItemName && setCreationMode(null)}
                              onKeyDown={e => e.key === 'Escape' && setCreationMode(null)}
                            />
                          </div>
                        </form>
                      )}

                      {folderFiles.length === 0 && !isCreatingInThisFolder ? (
                        <div
                          onClick={() => {
                            setCreationMode(`folder:${folderName}`);
                            setNewItemName('');
                          }}
                          style={{ fontSize: 10.5, color: 'var(--text-muted)', padding: '4px 6px', fontStyle: 'italic', cursor: 'pointer' }}
                        >
                          Empty folder &bull; <span style={{ color: '#38bdf8' }}>+ Add file</span>
                        </div>
                      ) : (
                        folderFiles.map(f => {
                          const isActive = f.id === activeFileId;
                          return (
                            <div
                              key={f.id}
                              onClick={() => onSelectFile(f.id)}
                              style={{
                                ...fileItemStyle,
                                backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
                                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontWeight: isActive ? 600 : 400,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                                {getFileIcon(f, isActive)}
                                <span style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {getFileDisplayName(f)}
                                </span>
                              </div>

                              {files.length > 1 && !f.isEntry && role !== 'viewer' && (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    onDeleteFile(f.id);
                                  }}
                                  className="file-delete-btn"
                                  style={{ color: 'var(--text-muted)', padding: 2 }}
                                  title="Delete file"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Root Files Header & Items */}
            {rootFiles.length > 0 && (
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {rootFiles.map(f => {
                  const isActive = f.id === activeFileId;
                  const isMain = f.isEntry || f.name === 'main.tex';

                  return (
                    <div
                      key={f.id}
                      onClick={() => onSelectFile(f.id)}
                      style={{
                        ...fileItemStyle,
                        backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        {getFileIcon(f, isActive)}
                        <span style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.name}
                        </span>
                        {isMain && (
                          <span style={{ fontSize: 8.5, fontWeight: 700, padding: '1px 4px', borderRadius: 3, backgroundColor: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', letterSpacing: '0.04em' }}>
                            ROOT
                          </span>
                        )}
                      </div>

                      {files.length > 1 && !f.isEntry && f.name !== 'main.tex' && role !== 'viewer' && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onDeleteFile(f.id);
                          }}
                          className="file-delete-btn"
                          style={{ color: 'var(--text-muted)', padding: 2 }}
                          title="Delete file"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document Outline View */}
      {activeTab === 'outline' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          <div style={{ padding: '4px 8px 8px 8px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              STRUCTURE NAVIGATION
            </span>
          </div>

          {documentOutline.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '12px 8px' }}>
              No sections detected. Use \section{} in LaTeX.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {documentOutline.map((sec, idx) => (
                <button
                  key={idx}
                  onClick={() => onJumpToLine(sec.line)}
                  style={{
                    ...outlineItemStyle,
                    paddingLeft: sec.level === 1 ? 8 : sec.level === 2 ? 18 : 26,
                  }}
                  title={`Jump to line ${sec.line}`}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                    L{sec.line}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                    {sec.title}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Statistics & History Footer */}
      <div style={footerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <button
            onClick={onOpenWordCount}
            className="btn-ghost"
            style={{ padding: '2px 4px', fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}
            title="Inspect Word Count & Conference Limits"
          >
            <BarChart2 size={12} color="#38bdf8" />
            <span><b>{wordCount}</b> words</span>
          </button>

          <button
            onClick={onOpenHistory}
            className="btn-ghost"
            style={{ padding: '2px 4px', fontSize: 11, color: 'var(--text-muted)' }}
            title="View Checkpoint History & Diff"
          >
            <History size={12} />
            <span>History</span>
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 4 }}>
          {equationCount} equations &bull; Auto-saved
        </div>
      </div>
    </aside>
  );
};

const sidebarStyle: React.CSSProperties = {
  width: 220,
  height: '100%',
  backgroundColor: 'var(--bg-surface-0)',
  borderRight: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  userSelect: 'none',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
};

const tabButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 4px',
  fontSize: 11,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  cursor: 'pointer',
};

const folderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '5px 6px',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  transition: 'background var(--transition-fast)',
  userSelect: 'none',
};

const fileItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '5px 6px',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  transition: 'background var(--transition-fast)',
};

const outlineItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 8px',
  borderRadius: 'var(--radius-sm)',
  fontSize: 11.5,
  textAlign: 'left',
  width: '100%',
  cursor: 'pointer',
};

const footerStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderTop: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
};
