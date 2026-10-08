import React, { useState, useMemo } from 'react';
import {
  FolderKanban,
  X,
  Search,
  Plus,
  Copy,
  Archive,
  Trash2,
  ExternalLink,
  Sparkles,
  FileText,
  Clock,
  Tag,
  Shield,
  Eye,
  Edit3
} from 'lucide-react';
import type { Project, ProjectRole, UserProfile } from '../../types/latex';
import { STARTER_TEMPLATES } from '../../services/templates';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (title: string, templateId?: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onToggleArchiveProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  currentUser: UserProfile | null;
}

type FilterTab = 'all' | 'owner' | 'shared' | 'archived';

export const ProjectsDashboardModal: React.FC<Props> = ({
  isOpen,
  onClose,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDuplicateProject,
  onToggleArchiveProject,
  onDeleteProject,
  currentUser: _currentUser,
}) => {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(STARTER_TEMPLATES[0].id);

  const filteredProjects = useMemo(() => {
    return (projects || []).filter(p => {
      if (!p) return false;
      // Tab filter
      if (filterTab === 'owner' && p.role !== 'owner') return false;
      if (filterTab === 'shared' && p.role === 'owner') return false;
      if (filterTab === 'archived' && !p.isArchived) return false;
      if (filterTab !== 'archived' && p.isArchived) return false;

      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchTitle = (p.title || '').toLowerCase().includes(q);
      const matchTags = Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(q));
      return matchTitle || matchTags;
    });
  }, [projects, filterTab, searchQuery]);

  if (!isOpen) return null;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onCreateProject(newTitle.trim(), selectedTemplateId);
    setNewTitle('');
    setIsCreating(false);
  };

  const getRoleBadge = (role: ProjectRole) => {
    switch (role) {
      case 'owner':
        return (
          <span className="badge badge-cyan" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Shield size={11} /> Owner
          </span>
        );
      case 'editor':
        return (
          <span className="badge badge-emerald" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Edit3 size={11} /> Editor
          </span>
        );
      case 'viewer':
        return (
          <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Eye size={11} /> Viewer
          </span>
        );
    }
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={iconBadgeStyle}>
              <FolderKanban size={18} color="#38bdf8" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                LaTeX Projects Hub
              </h2>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Manage academic papers, manuscripts &amp; team workspaces
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setIsCreating(true)}
              className="btn-primary"
              style={{ fontSize: 12, padding: '5px 12px' }}
            >
              <Plus size={14} /> New Project
            </button>
            <button onClick={onClose} style={closeBtnStyle} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Toolbar: Tabs & Search */}
        <div style={toolbarStyle}>
          <div style={tabGroupStyle}>
            <button
              onClick={() => setFilterTab('all')}
              style={{ ...tabBtnStyle, ...(filterTab === 'all' ? activeTabBtnStyle : {}) }}
            >
              All ({(projects || []).filter(p => p && !p.isArchived).length})
            </button>
            <button
              onClick={() => setFilterTab('owner')}
              style={{ ...tabBtnStyle, ...(filterTab === 'owner' ? activeTabBtnStyle : {}) }}
            >
              My Papers ({(projects || []).filter(p => p && p.role === 'owner' && !p.isArchived).length})
            </button>
            <button
              onClick={() => setFilterTab('shared')}
              style={{ ...tabBtnStyle, ...(filterTab === 'shared' ? activeTabBtnStyle : {}) }}
            >
              Shared with Me ({(projects || []).filter(p => p && p.role !== 'owner' && !p.isArchived).length})
            </button>
            <button
              onClick={() => setFilterTab('archived')}
              style={{ ...tabBtnStyle, ...(filterTab === 'archived' ? activeTabBtnStyle : {}) }}
            >
              Archived ({(projects || []).filter(p => p && p.isArchived).length})
            </button>
          </div>

          {/* Search Bar */}
          <div style={searchWrapperStyle}>
            <Search size={13} color="var(--text-muted)" style={{ marginLeft: 8 }} />
            <input
              type="text"
              placeholder="Search papers by title or #tag..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={searchInputStyle}
            />
          </div>
        </div>

        {/* Create New Project Inline Drawer */}
        {isCreating && (
          <form onSubmit={handleCreateSubmit} style={createFormStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={14} /> Create New LaTeX Project
              </span>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <input
                type="text"
                autoFocus
                required
                placeholder="Project title (e.g. Non-Abelian Anyons & Braiding Dynamics)"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                style={newTitleInputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                CHOOSE STARTER TEMPLATE
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {STARTER_TEMPLATES.map(tpl => (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    style={{
                      ...templateOptionStyle,
                      border: selectedTemplateId === tpl.id ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                      backgroundColor: selectedTemplateId === tpl.id ? 'rgba(56, 189, 248, 0.1)' : 'var(--bg-surface-0)',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>{tpl.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tpl.badge}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="btn-secondary"
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                style={{ fontSize: 12 }}
              >
                Initialize Project
              </button>
            </div>
          </form>
        )}

        {/* Project Cards List */}
        <div style={cardsContainerStyle}>
          {filteredProjects.length === 0 ? (
            <div style={emptyStateStyle}>
              <FileText size={32} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: 8 }} />
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No matching projects found</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Try adjusting your search query or create a new paper.
              </div>
            </div>
          ) : (
            filteredProjects.map(proj => {
              const isActive = proj.id === activeProjectId;
              return (
                <div
                  key={proj.id}
                  style={{
                    ...cardStyle,
                    borderColor: isActive ? '#38bdf8' : 'var(--border-subtle)',
                    backgroundColor: isActive ? 'rgba(56, 189, 248, 0.03)' : 'var(--bg-surface-0)',
                  }}
                >
                  {/* Top line: Role badge + status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {getRoleBadge(proj.role)}
                      {isActive && (
                        <span className="badge badge-emerald" style={{ fontSize: 10 }}>
                          Currently Active
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {/* Duplicate Button */}
                      <button
                        onClick={() => onDuplicateProject(proj.id)}
                        className="btn-ghost"
                        style={cardActionBtnStyle}
                        title="Duplicate this project"
                      >
                        <Copy size={13} />
                      </button>

                      {/* Archive / Unarchive */}
                      <button
                        onClick={() => onToggleArchiveProject(proj.id)}
                        className="btn-ghost"
                        style={cardActionBtnStyle}
                        title={proj.isArchived ? 'Unarchive' : 'Archive project'}
                      >
                        <Archive size={13} />
                      </button>

                      {/* Delete */}
                      {proj.role === 'owner' && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete project "${proj.title}"?`)) {
                              onDeleteProject(proj.id);
                            }
                          }}
                          className="btn-ghost"
                          style={{ ...cardActionBtnStyle, color: '#f43f5e' }}
                          title="Delete project"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Project Title */}
                  <div
                    onClick={() => { onSelectProject(proj.id); onClose(); }}
                    style={{ cursor: 'pointer', marginBottom: 6 }}
                  >
                    <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {proj.title}
                      <ExternalLink size={12} color="var(--text-muted)" />
                    </h3>
                  </div>

                  {/* Tags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                    {Array.isArray(proj.tags) && proj.tags.map(t => (
                      <span key={t} style={tagStyle}>
                        <Tag size={10} /> {t}
                      </span>
                    ))}
                  </div>

                  {/* Footer Meta: Files, Members, Last Updated */}
                  <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span>{(proj.files || []).length} file{(proj.files || []).length === 1 ? '' : 's'}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} /> {proj.updatedAt || 'Recently'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Member Avatars */}
                      <div style={{ display: 'flex', alignItems: 'center', marginLeft: -4 }}>
                        {proj.members?.slice(0, 3).map((m, idx) => (
                          <div
                            key={m.id}
                            style={{
                              ...memberAvatarStyle,
                              backgroundColor: m.avatarColor,
                              marginLeft: idx > 0 ? -6 : 0,
                            }}
                            title={`${m.name} (${m.role})`}
                          >
                            {m.avatar}
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => { onSelectProject(proj.id); onClose(); }}
                        className="btn-primary"
                        style={{ fontSize: 11, padding: '4px 10px' }}
                      >
                        {isActive ? 'Continue' : 'Open'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Total {projects.length} project{projects.length === 1 ? '' : 's'} in workspace
          </div>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>
            Close Hub
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
  width: '820px',
  maxWidth: '94vw',
  maxHeight: '88vh',
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
  padding: '16px 20px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'var(--bg-surface-0)',
};

const iconBadgeStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'rgba(56, 189, 248, 0.12)',
  border: '1px solid rgba(56, 189, 248, 0.25)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const closeBtnStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  padding: 4,
  borderRadius: 'var(--radius-sm)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 20px',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
  gap: 12,
  flexWrap: 'wrap',
};

const tabGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const tabBtnStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 'var(--radius-xs)',
  border: '1px solid transparent',
  background: 'none',
  fontSize: 11.5,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const activeTabBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface-2)',
  borderColor: 'var(--border-subtle)',
  color: 'var(--text-primary)',
  fontWeight: 600,
};

const searchWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  flex: 1,
  maxWidth: 280,
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  fontSize: 11.5,
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
  outline: 'none',
};

const createFormStyle: React.CSSProperties = {
  padding: 16,
  margin: '12px 20px 0 20px',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid rgba(56, 189, 248, 0.3)',
  borderRadius: 'var(--radius-md)',
};

const newTitleInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  fontSize: 13,
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  outline: 'none',
};

const templateOptionStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const cardsContainerStyle: React.CSSProperties = {
  padding: 20,
  overflowY: 'auto',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
  gap: 14,
  flex: 1,
};

const cardStyle: React.CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-subtle)',
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  transition: 'all 0.15s ease',
};

const cardActionBtnStyle: React.CSSProperties = {
  padding: 4,
  borderRadius: 'var(--radius-xs)',
  color: 'var(--text-secondary)',
};

const tagStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
  backgroundColor: 'var(--bg-surface-1)',
  padding: '2px 6px',
  borderRadius: 4,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
};

const memberAvatarStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: '50%',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 9,
  fontWeight: 700,
  border: '1.5px solid var(--bg-surface-0)',
};

const emptyStateStyle: React.CSSProperties = {
  gridColumn: '1 / -1',
  padding: '40px 20px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
};

const footerStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'var(--bg-surface-0)',
};
