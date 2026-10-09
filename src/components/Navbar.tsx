import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Table,
  Hash,
  BookOpen,
  Download,
  Sun,
  Moon,
  AlertTriangle,
  XCircle,
  Loader2,
  Share2,
  Image as ImageIcon,
  Cloud,
  ShieldCheck,
  FolderArchive,
  ChevronDown,
  FolderKanban,
  User,
  LogOut,
  Shield,
  Edit3,
  Eye,
  Plus
} from 'lucide-react';
import type { CompileState, Collaborator, Project, ProjectRole, UserProfile } from '../types/latex';

interface Props {
  projectTitle: string;
  onTitleChange: (title: string) => void;
  compileState: CompileState;
  onCompile: () => void;
  peers: Collaborator[];
  selfUser: Collaborator;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenShare: () => void;
  onOpenTableBuilder: () => void;
  onOpenSymbols: () => void;
  onOpenTemplates: () => void;
  onOpenImageUpload: () => void;
  onOpenSupabase: () => void;
  isCloudConnected: boolean;
  onExportPdf: () => void;
  onExportZip: () => void;
  // Multi-Project props
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  onOpenProjectsHub: () => void;
  // Auth props
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
  currentRole: ProjectRole;
}

export const Navbar: React.FC<Props> = ({
  projectTitle,
  onTitleChange,
  compileState,
  onCompile,
  peers,
  selfUser,
  theme,
  onToggleTheme,
  onOpenShare,
  onOpenTableBuilder,
  onOpenSymbols,
  onOpenTemplates,
  onOpenImageUpload,
  onOpenSupabase,
  isCloudConnected,
  onExportPdf,
  onExportZip,
  projects,
  activeProjectId,
  onSelectProject,
  onOpenProjectsHub,
  currentUser,
  onOpenAuth,
  onSignOut,
  currentRole,
}) => {
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setIsProjectDropdownOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleIcon = (role: ProjectRole) => {
    switch (role) {
      case 'owner': return <Shield size={11} color="#38bdf8" />;
      case 'editor': return <Edit3 size={11} color="#10b981" />;
      case 'viewer': return <Eye size={11} color="#f59e0b" />;
    }
  };

  const getRoleBadgeClass = (role: ProjectRole) => {
    switch (role) {
      case 'owner': return 'badge-cyan';
      case 'editor': return 'badge-emerald';
      case 'viewer': return '';
    }
  };

  return (
    <header style={navStyle}>
      {/* Brand & Project Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={logoMarkStyle}>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#000' }}>Tx</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            TEEEX<span style={{ color: '#38bdf8' }}>.</span>
          </span>
        </div>

        <div style={{ width: 1, height: 18, backgroundColor: 'var(--border-subtle)' }} />

        {/* Project Switcher Dropdown */}
        <div ref={projectDropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setIsProjectDropdownOpen(prev => !prev)}
            style={projectSwitcherBtnStyle}
            title="Switch project workspace"
          >
            <FolderKanban size={13} color="#38bdf8" />
            <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
              {projectTitle}
            </span>
            <ChevronDown size={12} color="var(--text-muted)" />
          </button>

          {isProjectDropdownOpen && (
            <div style={dropdownMenuStyle}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                  WORKSPACE PROJECTS ({projects.length})
                </span>
                <button
                  onClick={() => { setIsProjectDropdownOpen(false); onOpenProjectsHub(); }}
                  style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 10.5, cursor: 'pointer', padding: 0, fontWeight: 600 }}
                >
                  <Plus size={10} style={{ display: 'inline', marginRight: 2 }} /> New
                </button>
              </div>

              <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
                {projects.map(proj => {
                  const isActive = proj.id === activeProjectId;
                  return (
                    <button
                      key={proj.id}
                      onClick={() => {
                        onSelectProject(proj.id);
                        setIsProjectDropdownOpen(false);
                      }}
                      style={{
                        ...dropdownItemStyle,
                        backgroundColor: isActive ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: isActive ? '#38bdf8' : 'transparent', flexShrink: 0 }} />
                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 12 }}>
                          {proj.title}
                        </span>
                      </div>
                      <span className={`badge ${getRoleBadgeClass(proj.role)}`} style={{ fontSize: 9.5, padding: '1px 5px', flexShrink: 0 }}>
                        {proj.role}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-0)' }}>
                <button
                  onClick={() => { setIsProjectDropdownOpen(false); onOpenProjectsHub(); }}
                  style={dropdownFooterBtnStyle}
                >
                  <FolderKanban size={12} color="#38bdf8" />
                  <span>Open Multi-Project Hub...</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Project Name Editable Input */}
        <input
          type="text"
          value={projectTitle}
          readOnly={currentRole === 'viewer'}
          onChange={e => onTitleChange(e.target.value)}
          style={{
            ...titleInputStyle,
            opacity: currentRole === 'viewer' ? 0.8 : 1,
            cursor: currentRole === 'viewer' ? 'default' : 'text',
          }}
          placeholder="Untitled LaTeX Document"
        />

        {/* Active Role Badge in Navbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', fontSize: 11 }}>
          {getRoleIcon(currentRole)}
          <span style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: currentRole === 'owner' ? '#38bdf8' : currentRole === 'editor' ? '#10b981' : '#f59e0b',
            textTransform: 'capitalize'
          }}>
            {currentRole === 'owner' ? 'Host' : currentRole}
          </span>
        </div>
      </div>

      {/* Middle: Live Compilation Status & Speed Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {currentRole !== 'viewer' ? (
          <button
            onClick={onCompile}
            className="btn-primary"
            style={{ padding: '5px 12px', fontSize: 12 }}
            title="Recompile LaTeX Document (Ctrl+Enter)"
          >
            {compileState.status === 'compiling' ? (
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Play size={13} fill="currentColor" />
            )}
            Compile
            <span style={shortcutKbdStyle}>Ctrl+↵</span>
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
            <Eye size={12} /> Read-Only Mode
          </div>
        )}

        {/* Status Pill */}
        <div style={statusPillStyle}>
          {compileState.status === 'compiling' && (
            <>
              <Loader2 size={12} color="#38bdf8" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Compiling...</span>
            </>
          )}

          {compileState.status === 'success' && (
            <>
              <div style={liveRadarDotStyle} />
              <span style={{ color: '#10b981', fontWeight: 600 }}>Live Synced</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>({compileState.durationMs}ms)</span>
            </>
          )}

          {compileState.status === 'error' && (
            <>
              <XCircle size={13} color="#f43f5e" />
              <span style={{ color: '#f43f5e', fontWeight: 600 }}>
                {compileState.errorCount} {compileState.errorCount === 1 ? 'Error' : 'Errors'}
              </span>
            </>
          )}

          {compileState.warningCount > 0 && compileState.status !== 'error' && (
            <span style={{ color: '#f59e0b', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
              <AlertTriangle size={11} /> {compileState.warningCount}
            </span>
          )}
        </div>
      </div>

      {/* Right Side: Tools, Collaboration, User Account */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {/* Cloud Status */}
        <button
          onClick={onOpenSupabase}
          className="btn-ghost"
          style={{
            ...toolBtnStyle,
            color: isCloudConnected ? '#10b981' : 'var(--text-secondary)',
            backgroundColor: isCloudConnected ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
          }}
          title={isCloudConnected ? "Supabase Cloud Integrated" : "Cloud & Security Vault"}
        >
          {isCloudConnected ? <Cloud size={13} /> : <ShieldCheck size={13} />}
          <span>{isCloudConnected ? 'Cloud Synced' : 'Cloud Setup'}</span>
        </button>

        <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />

        {/* Math & TikZ Library */}
        <button onClick={onOpenSymbols} className="btn-ghost" title="LaTeX Symbols & Formulas Library" style={toolBtnStyle}>
          <Hash size={13} color="#38bdf8" />
          <span>Formulas</span>
        </button>

        {/* Upload Figure Button */}
        {currentRole !== 'viewer' && (
          <button onClick={onOpenImageUpload} className="btn-ghost" title="Upload Figure & Insert \includegraphics" style={toolBtnStyle}>
            <ImageIcon size={13} />
            <span>Figure</span>
          </button>
        )}

        {/* Table Builder */}
        {currentRole !== 'viewer' && (
          <button onClick={onOpenTableBuilder} className="btn-ghost" title="Visual Table Builder" style={toolBtnStyle}>
            <Table size={13} />
            <span>Table</span>
          </button>
        )}

        {/* Starter Templates */}
        <button onClick={onOpenTemplates} className="btn-ghost" title="Starter Templates" style={toolBtnStyle}>
          <BookOpen size={13} />
          <span>Templates</span>
        </button>

        {/* Collaborative Presence Pill */}
        <button
          onClick={onOpenShare}
          style={presenceButtonStyle}
          title="Manage real-time collaboration room & permissions"
        >
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: -4 }}>
            <div style={{ ...avatarMiniStyle, backgroundColor: selfUser.color, zIndex: 10 }}>
              {selfUser.avatar}
            </div>
            {peers.slice(0, 2).map((p, idx) => (
              <div
                key={p.id}
                style={{
                  ...avatarMiniStyle,
                  backgroundColor: p.color,
                  marginLeft: -8,
                  zIndex: 9 - idx,
                }}
              >
                {p.avatar}
              </div>
            ))}
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
            {peers.length + 1}
          </span>
          <Share2 size={12} color="var(--text-secondary)" />
        </button>

        {/* Export PDF */}
        <button onClick={onExportPdf} className="btn-secondary" title="Export Ready PDF Document" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          <Download size={12} />
          <span>PDF</span>
        </button>

        {/* Export ZIP Package */}
        <button onClick={onExportZip} className="btn-secondary" title="Download Complete .ZIP Project for arXiv / Overleaf" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          <FolderArchive size={12} color="#38bdf8" />
          <span>ZIP</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="btn-ghost"
          style={{ padding: 5, borderRadius: 'var(--radius-sm)' }}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={14} color="#f59e0b" /> : <Moon size={14} color="#38bdf8" />}
        </button>

        <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />

        {/* User Account / Auth Dropdown */}
        <div ref={userDropdownRef} style={{ position: 'relative' }}>
          {currentUser ? (
            <button
              onClick={() => setIsUserDropdownOpen(prev => !prev)}
              style={userProfileBtnStyle}
              title={`Signed in as ${currentUser.fullName}`}
            >
              <div style={{ ...avatarMiniStyle, backgroundColor: currentUser.avatarColor || '#38bdf8' }}>
                {currentUser.fullName ? currentUser.fullName.substring(0, 2).toUpperCase() : 'ME'}
              </div>
              <ChevronDown size={11} color="var(--text-muted)" />
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="btn-primary"
              style={{ padding: '4px 10px', fontSize: 11 }}
            >
              <User size={12} /> Sign In
            </button>
          )}

          {isUserDropdownOpen && currentUser && (
            <div style={{ ...dropdownMenuStyle, left: 'auto', right: 0, width: 240 }}>
              {/* User Profile Card */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-0)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {currentUser.fullName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  {currentUser.email}
                </div>
                <div style={{ marginTop: 6, display: 'inline-block' }}>
                  <span className={`badge ${getRoleBadgeClass(currentRole)}`} style={{ fontSize: 9.5 }}>
                    Project {currentRole === 'owner' ? 'Host' : currentRole}
                  </span>
                </div>
              </div>

              {/* Menu items */}
              <div style={{ padding: '4px 0' }}>
                <button
                  onClick={() => { setIsUserDropdownOpen(false); onOpenProjectsHub(); }}
                  style={dropdownItemStyle}
                >
                  <FolderKanban size={13} color="#38bdf8" />
                  <span>Projects Hub</span>
                </button>

                <button
                  onClick={() => { setIsUserDropdownOpen(false); onOpenAuth(); }}
                  style={dropdownItemStyle}
                >
                  <User size={13} color="var(--text-secondary)" />
                  <span>Switch Account / Sign In</span>
                </button>

                <button
                  onClick={() => { setIsUserDropdownOpen(false); onOpenSupabase(); }}
                  style={dropdownItemStyle}
                >
                  <Cloud size={13} color="var(--text-secondary)" />
                  <span>Supabase &amp; Cloud Vault</span>
                </button>

                <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />

                <button
                  onClick={() => { setIsUserDropdownOpen(false); onSignOut(); }}
                  style={{ ...dropdownItemStyle, color: '#f43f5e' }}
                >
                  <LogOut size={13} color="#f43f5e" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

const navStyle: React.CSSProperties = {
  height: 48,
  backgroundColor: 'var(--bg-surface-0)',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  zIndex: 40,
  userSelect: 'none',
  flexShrink: 0,
};

const logoMarkStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 5,
  background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 0 12px rgba(56, 189, 248, 0.4)',
};

const projectSwitcherBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: 12,
  cursor: 'pointer',
  transition: 'border-color 0.15s ease',
};

const titleInputStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid transparent',
  color: 'var(--text-primary)',
  fontSize: 12.5,
  fontWeight: 600,
  padding: '3px 6px',
  borderRadius: 'var(--radius-xs)',
  width: 170,
  textOverflow: 'ellipsis',
};

const shortcutKbdStyle: React.CSSProperties = {
  fontSize: 10,
  backgroundColor: 'rgba(255, 255, 255, 0.2)',
  padding: '1px 4px',
  borderRadius: 3,
  marginLeft: 4,
  fontWeight: 500,
};

const statusPillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 9px',
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 9999,
  fontSize: 11,
};

const liveRadarDotStyle: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  backgroundColor: '#10b981',
  boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.7)',
  animation: 'liveRadar 2s infinite',
};

const presenceButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 8px',
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 9999,
  cursor: 'pointer',
};

const userProfileBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '2px 4px',
  backgroundColor: 'transparent',
  border: '1px solid transparent',
  borderRadius: 9999,
  cursor: 'pointer',
};

const avatarMiniStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: '50%',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: 9,
  border: '1.5px solid var(--bg-surface-0)',
};

const toolBtnStyle: React.CSSProperties = {
  padding: '4px 7px',
  fontSize: 11,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const dropdownMenuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  width: 260,
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-medium)',
  borderRadius: 'var(--radius-md)',
  boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5)',
  zIndex: 100,
  overflow: 'hidden',
  animation: 'modalContent 0.15s ease forwards',
};

const dropdownItemStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  background: 'none',
  border: 'none',
  color: 'var(--text-primary)',
  fontSize: 12,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background-color 0.12s ease',
};

const dropdownFooterBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: 'none',
  border: 'none',
  color: '#38bdf8',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
  borderRadius: 'var(--radius-xs)',
};
