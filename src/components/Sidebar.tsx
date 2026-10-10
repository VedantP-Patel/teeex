import React, { useState, useMemo, useRef } from 'react';
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
  Image as ImageIcon,
  PanelLeftClose,
  Search,
  X,
  Upload,
  UploadCloud,
  ImagePlus
} from 'lucide-react';
import type { ProjectFile, ParsedDocument, ProjectRole } from '../types/latex';
import { extractLatexLabels } from '../services/latexParser';

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
  onCollapse?: () => void;
  activeCursorLine?: number;
  parsedDoc?: ParsedDocument;
  onImportFiles?: (files: FileList | File[], targetFolder?: string) => void;
  onOpenImageUpload?: () => void;
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
  onCollapse,
  activeCursorLine,
  parsedDoc,
  onImportFiles,
  onOpenImageUpload,
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'outline'>('files');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  // Document Outline Filter & Search State
  const [outlineFilter, setOutlineFilter] = useState<'all' | 'sections' | 'figures' | 'tables' | 'math'>('all');
  const [outlineSearch, setOutlineSearch] = useState('');

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

  // Outline Nodes computation for Document Outline Tree
  interface OutlineNode {
    id: string;
    type: 'section' | 'subsection' | 'subsubsection' | 'figure' | 'table' | 'equation';
    title: string;
    caption?: string;
    line: number;
    level: number;
  }

  const allOutlineNodes = useMemo<OutlineNode[]>(() => {
    const nodes: OutlineNode[] = [];

    // 1. Sections from documentOutline
    (documentOutline || []).forEach((sec, idx) => {
      nodes.push({
        id: `sec-${idx}-${sec.line}`,
        type: sec.level === 1 ? 'section' : sec.level === 2 ? 'subsection' : 'subsubsection',
        title: sec.title,
        line: sec.line,
        level: sec.level,
      });
    });

    // 2. Labels for Figures, Tables, Equations
    const labels = extractLatexLabels(files);
    labels.forEach(l => {
      if (l.type === 'figure') {
        nodes.push({
          id: `fig-${l.key}-${l.line}`,
          type: 'figure',
          title: l.caption || `Figure: ${l.key}`,
          caption: l.key,
          line: l.line,
          level: 2,
        });
      } else if (l.type === 'table') {
        nodes.push({
          id: `tab-${l.key}-${l.line}`,
          type: 'table',
          title: l.caption || `Table: ${l.key}`,
          caption: l.key,
          line: l.line,
          level: 2,
        });
      } else if (l.type === 'equation') {
        nodes.push({
          id: `eq-${l.key}-${l.line}`,
          type: 'equation',
          title: `Eq: ${l.key}`,
          caption: l.caption,
          line: l.line,
          level: 2,
        });
      }
    });

    // 3. Parsed math blocks without labels
    if (parsedDoc?.mathBlocks) {
      parsedDoc.mathBlocks.forEach((mb, idx) => {
        if (!nodes.some(n => n.type === 'equation' && Math.abs(n.line - mb.line) <= 1)) {
          const preview = mb.latex.replace(/\\label\{[^}]+\}/g, '').trim().slice(0, 32);
          nodes.push({
            id: `mathblock-${idx}-${mb.line}`,
            type: 'equation',
            title: `$$ ${preview}${mb.latex.length > 32 ? '...' : ''} $$`,
            line: mb.line,
            level: 2,
          });
        }
      });
    }

    return nodes.sort((a, b) => a.line - b.line);
  }, [documentOutline, files, parsedDoc]);

  const filteredOutlineNodes = useMemo(() => {
    return allOutlineNodes.filter(node => {
      if (outlineFilter === 'sections' && !['section', 'subsection', 'subsubsection'].includes(node.type)) return false;
      if (outlineFilter === 'figures' && node.type !== 'figure') return false;
      if (outlineFilter === 'tables' && node.type !== 'table') return false;
      if (outlineFilter === 'math' && node.type !== 'equation') return false;

      if (outlineSearch.trim()) {
        const q = outlineSearch.toLowerCase();
        return node.title.toLowerCase().includes(q) || (node.caption && node.caption.toLowerCase().includes(q));
      }
      return true;
    });
  }, [allOutlineNodes, outlineFilter, outlineSearch]);

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

        {onCollapse && (
          <button
            onClick={onCollapse}
            className="btn-ghost"
            style={{ padding: '6px 8px', borderRadius: 0, color: 'var(--text-muted)' }}
            title="Collapse Sidebar"
          >
            <PanelLeftClose size={13} />
          </button>
        )}
      </div>

      {/* Files List View */}
      {activeTab === 'files' && (
        <div
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={e => {
            e.preventDefault();
            if (e.dataTransfer.files && onImportFiles) {
              onImportFiles(e.dataTransfer.files);
            }
          }}
          style={{ flex: 1, overflowY: 'auto', padding: 8 }}
        >
          {/* Hidden file input for general upload */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".tex,.bib,.sty,.cls,.png,.jpg,.jpeg,.svg,.webp,.pdf,.txt"
            style={{ display: 'none' }}
            onChange={e => {
              if (e.target.files && onImportFiles) {
                onImportFiles(e.target.files);
              }
              e.target.value = '';
            }}
          />

          {/* Hidden image input for direct figure import */}
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.svg,.webp,.pdf"
            style={{ display: 'none' }}
            onChange={e => {
              if (e.target.files && onImportFiles) {
                onImportFiles(e.target.files, 'figures');
              }
              e.target.value = '';
            }}
          />

          {/* Header & New File / New Folder / Upload Buttons */}
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

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-ghost"
                  style={{ padding: '3px 5px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, color: '#10b981' }}
                  title="Upload / Import LaTeX files or figures from your computer"
                >
                  <Upload size={12} color="#10b981" />
                  <span style={{ fontSize: 10, fontWeight: 600 }}>Upload</span>
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
              const isOverThis = dragOverFolder === folderName;

              return (
                <div key={folderName} style={{ marginBottom: 2 }}>
                  {/* Folder Row */}
                  <div
                    onClick={() => toggleFolder(folderName)}
                    onDragOver={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'copy';
                      if (dragOverFolder !== folderName) setDragOverFolder(folderName);
                    }}
                    onDragLeave={e => {
                      e.stopPropagation();
                      if (dragOverFolder === folderName) setDragOverFolder(null);
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverFolder(null);
                      if (e.dataTransfer.files && onImportFiles) {
                        onImportFiles(e.dataTransfer.files, folderName);
                      }
                    }}
                    style={{
                      ...folderRowStyle,
                      backgroundColor: isOverThis ? 'rgba(56, 189, 248, 0.16)' : folderRowStyle.backgroundColor,
                      border: isOverThis ? '1px dashed #38bdf8' : '1px solid transparent',
                      transition: 'all 0.15s ease',
                    }}
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
                        {folderName === 'figures' && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              imageInputRef.current?.click();
                            }}
                            className="btn-ghost"
                            style={{ padding: 2, color: '#10b981' }}
                            title="Upload image into figures/"
                          >
                            <ImagePlus size={12} color="#10b981" />
                          </button>
                        )}
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
                          style={{
                            fontSize: 10.5,
                            color: 'var(--text-muted)',
                            padding: '4px 6px',
                            fontStyle: 'italic',
                            display: 'flex',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 5,
                          }}
                        >
                          <span>Empty folder &bull;</span>
                          <span
                            onClick={() => {
                              setCreationMode(`folder:${folderName}`);
                              setNewItemName('');
                            }}
                            style={{ color: '#38bdf8', cursor: 'pointer' }}
                          >
                            + Add file
                          </span>
                          {(folderName.toLowerCase().includes('figure') || folderName.toLowerCase().includes('image')) && (
                            <>
                              <span>&bull;</span>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenImageUpload ? onOpenImageUpload() : imageInputRef.current?.click();
                                }}
                                style={{ color: '#10b981', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}
                              >
                                <UploadCloud size={10} /> + Upload image
                              </span>
                            </>
                          )}
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Outline Search & Filters Header */}
          <div style={{ padding: '8px 8px 6px 8px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Search Input */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--bg-surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 6px',
              gap: 5,
            }}>
              <Search size={11} color="var(--text-muted)" />
              <input
                type="text"
                value={outlineSearch}
                onChange={e => setOutlineSearch(e.target.value)}
                placeholder="Filter outline..."
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: 10.5,
                  width: '100%',
                }}
              />
              {outlineSearch && (
                <button
                  type="button"
                  onClick={() => setOutlineSearch('')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}
                >
                  <X size={10} />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflowX: 'auto' }} className="toolbar-scrollbar">
              {[
                { id: 'all', label: 'All', count: allOutlineNodes.length },
                { id: 'sections', label: '§ Sec', count: allOutlineNodes.filter(n => ['section', 'subsection', 'subsubsection'].includes(n.type)).length },
                { id: 'figures', label: 'Fig', count: allOutlineNodes.filter(n => n.type === 'figure').length },
                { id: 'tables', label: 'Tab', count: allOutlineNodes.filter(n => n.type === 'table').length },
                { id: 'math', label: '∑ Eq', count: allOutlineNodes.filter(n => n.type === 'equation').length },
              ].map(f => {
                const isSelected = outlineFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setOutlineFilter(f.id as any)}
                    style={{
                      padding: '2px 5px',
                      fontSize: 9.5,
                      fontWeight: isSelected ? 700 : 500,
                      borderRadius: 4,
                      backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-surface-1)',
                      color: isSelected ? '#38bdf8' : 'var(--text-muted)',
                      border: isSelected ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <span>{f.label}</span>
                    <span style={{ opacity: 0.7, fontSize: 8.5 }}>{f.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Outline Items List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px' }}>
            {filteredOutlineNodes.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '16px 8px', textAlign: 'center' }}>
                {outlineSearch ? 'No matches found.' : 'No structure items detected in LaTeX.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {filteredOutlineNodes.map((node, idx) => {
                  const isActive = activeCursorLine !== undefined &&
                    (node.line === activeCursorLine || (node.line <= activeCursorLine && (idx === filteredOutlineNodes.length - 1 || filteredOutlineNodes[idx + 1].line > activeCursorLine)));

                  const badgeColor =
                    node.type === 'section' ? '#38bdf8' :
                    node.type === 'subsection' ? '#0284c7' :
                    node.type === 'subsubsection' ? '#64748b' :
                    node.type === 'figure' ? '#10b981' :
                    node.type === 'table' ? '#f59e0b' : '#c084fc';

                  const badgeBg =
                    node.type === 'section' ? 'rgba(56, 189, 248, 0.12)' :
                    node.type === 'subsection' ? 'rgba(2, 132, 199, 0.12)' :
                    node.type === 'subsubsection' ? 'rgba(100, 116, 139, 0.12)' :
                    node.type === 'figure' ? 'rgba(16, 185, 129, 0.12)' :
                    node.type === 'table' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(192, 132, 252, 0.12)';

                  const badgeLabel =
                    node.type === 'section' ? 'H1' :
                    node.type === 'subsection' ? 'H2' :
                    node.type === 'subsubsection' ? 'H3' :
                    node.type === 'figure' ? 'FIG' :
                    node.type === 'table' ? 'TAB' : 'EQ';

                  const indent =
                    node.type === 'section' ? 4 :
                    node.type === 'subsection' ? 12 :
                    node.type === 'subsubsection' ? 18 : 10;

                  return (
                    <button
                      key={node.id}
                      onClick={() => onJumpToLine(node.line)}
                      style={{
                        ...outlineItemStyle,
                        paddingLeft: indent,
                        backgroundColor: isActive ? 'rgba(56, 189, 248, 0.10)' : 'transparent',
                        borderLeft: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        width: '100%',
                        textAlign: 'left',
                        transition: 'background 0.12s ease',
                      }}
                      title={`Jump to line ${node.line}: ${node.title}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        <span style={{
                          fontSize: 8.5,
                          fontWeight: 800,
                          padding: '1px 3.5px',
                          borderRadius: 3,
                          backgroundColor: badgeBg,
                          color: badgeColor,
                          letterSpacing: '0.02em',
                          flexShrink: 0,
                        }}>
                          {badgeLabel}
                        </span>
                        <span style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: isActive ? '#38bdf8' : 'var(--text-primary)',
                          fontWeight: isActive || node.type === 'section' ? 600 : 400,
                          fontSize: 11,
                        }}>
                          {node.title}
                        </span>
                      </div>

                      <span style={{
                        color: 'var(--text-muted)',
                        fontSize: 9.5,
                        fontFamily: 'var(--font-mono)',
                        flexShrink: 0,
                      }}>
                        L{node.line}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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
  width: 210,
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
