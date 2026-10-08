import React, { useState } from 'react';
import {
  FileText,
  FileCode,
  Plus,
  Trash2,
  ListTree,
  FileSpreadsheet,
  BarChart2
} from 'lucide-react';
import type { ProjectFile, ParsedDocument } from '../types/latex';

interface Props {
  files: ProjectFile[];
  activeFileId: string;
  onSelectFile: (fileId: string) => void;
  onCreateFile: (name: string, type: 'tex' | 'bib') => void;
  onDeleteFile: (fileId: string) => void;
  documentOutline: ParsedDocument['sections'];
  onJumpToLine: (line: number) => void;
  wordCount: number;
  equationCount: number;
}

export const Sidebar: React.FC<Props> = ({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  documentOutline,
  onJumpToLine,
  wordCount,
  equationCount,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [activeTab, setActiveTab] = useState<'files' | 'outline'>('files');

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    const isBib = newFileName.endsWith('.bib');
    onCreateFile(newFileName.trim(), isBib ? 'bib' : 'tex');
    setNewFileName('');
    setIsCreating(false);
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px 8px 8px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              PROJECT FILES
            </span>
            <button
              onClick={() => setIsCreating(true)}
              className="btn-ghost"
              style={{ padding: 2 }}
              title="Add new file"
            >
              <Plus size={14} />
            </button>
          </div>

          {isCreating && (
            <form onSubmit={handleCreateSubmit} style={{ padding: '4px 6px', marginBottom: 6 }}>
              <input
                type="text"
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                placeholder="filename.tex or .bib"
                style={{ width: '100%', padding: '4px 8px', fontSize: 12 }}
                autoFocus
                onBlur={() => !newFileName && setIsCreating(false)}
              />
            </form>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {files.map(f => {
              const isActive = f.id === activeFileId;
              const isTex = f.name.endsWith('.tex');
              const isBib = f.name.endsWith('.bib');

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    {isTex ? (
                      <FileCode size={14} color={isActive ? '#38bdf8' : 'var(--text-muted)'} />
                    ) : isBib ? (
                      <FileSpreadsheet size={14} color="#f59e0b" />
                    ) : (
                      <FileText size={14} color="var(--text-muted)" />
                    )}
                    <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name}
                    </span>
                  </div>

                  {files.length > 1 && !f.isEntry && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onDeleteFile(f.id);
                      }}
                      className="file-delete-btn"
                      style={{ color: 'var(--text-muted)', padding: 2 }}
                      title="Delete file"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
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

      {/* Statistics Footer */}
      <div style={footerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
          <BarChart2 size={12} color="#38bdf8" />
          <span><b>{wordCount}</b> words</span>
          <span>&bull;</span>
          <span><b>{equationCount}</b> math blocks</span>
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

const fileItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 8px',
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
