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
  FolderArchive,
  ChevronDown,
  FolderKanban,
  User,
  LogOut,
  Shield,
  Edit3,
  Eye,
  Plus,
  Lock,
  BookMarked,
  WifiOff,
  ShieldCheck,
  Code
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
  onOpenDoiModal?: () => void;
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
  // Platform Developer & Website Owner props
  isPlatformDev: boolean;
  onOpenDeveloperUnlock: () => void;
  onLockPlatformDev: () => void;
  isDevDemoActive: boolean;
  onToggleDevDemoMode: () => void;
  isEncrypted?: boolean;
  isOffline?: boolean;
}

export const Navbar: React.FC<Props> = ({
  projectTitle,
  onTitleChange,
  compileState,
  onCompile,
  peers,
  selfUser: _selfUser,
  theme,
  onToggleTheme,
  onOpenShare,
  onOpenTableBuilder,
  onOpenSymbols,
  onOpenTemplates,
  onOpenImageUpload,
  onOpenDoiModal,
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
  isPlatformDev,
  onOpenDeveloperUnlock,
  onLockPlatformDev,
  isDevDemoActive,
  onToggleDevDemoMode,
  isEncrypted: _isEncrypted,
  isOffline,
}) => {
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isInsertDropdownOpen, setIsInsertDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const insertDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setIsProjectDropdownOpen(false);
      }
      if (insertDropdownRef.current && !insertDropdownRef.current.contains(e.target as Node)) {
        setIsInsertDropdownOpen(false);
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
      {/* LEFT GROUP: Brand & Unified Project Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={logoMarkStyle}>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#000' }}>Tx</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: 13.5, letterSpacing: '-0.02em', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            TEEEX<span style={{ color: '#38bdf8' }}>.</span>
          </span>
        </div>

        <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />

        {/* Unified Project Pill: Folder Icon + Title Input + Dropdown Trigger */}
        <div ref={projectDropdownRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <div style={projectTitlePillStyle}>
            <FolderKanban size={13} color="#38bdf8" style={{ flexShrink: 0 }} />
            <input
              type="text"
              value={projectTitle}
              readOnly={currentRole === 'viewer'}
              onChange={e => onTitleChange(e.target.value)}
              style={{
                ...cleanTitleInputStyle,
                opacity: currentRole === 'viewer' ? 0.8 : 1,
                cursor: currentRole === 'viewer' ? 'default' : 'text',
              }}
              placeholder="Untitled Document"
              title="Click to rename document"
            />
            <button
              type="button"
              onClick={() => setIsProjectDropdownOpen(prev => !prev)}
              style={chevronDropdownBtnStyle}
              title="Switch workspace project"
            >
              <ChevronDown size={11} color="var(--text-muted)" />
            </button>
          </div>

          {/* Project Switcher Dropdown Menu */}
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

        {/* Compact Role Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 9999, backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', fontSize: 10.5, whiteSpace: 'nowrap' }}>
          {getRoleIcon(currentRole)}
          <span style={{
            fontWeight: 600,
            color: currentRole === 'owner' ? '#38bdf8' : currentRole === 'editor' ? '#10b981' : '#f59e0b',
            textTransform: 'capitalize'
          }}>
            {currentRole === 'owner' ? 'Host' : currentRole}
          </span>
        </div>
      </div>

      {/* MIDDLE GROUP: Compilation & Live Status Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {currentRole !== 'viewer' ? (
          <button
            onClick={onCompile}
            className="btn-primary"
            style={{ padding: '4px 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
            title="Recompile LaTeX Document (Ctrl+Enter)"
          >
            {compileState.status === 'compiling' ? (
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Play size={11} fill="currentColor" />
            )}
            <span>Compile</span>
            <span style={shortcutKbdStyle}>Ctrl+↵</span>
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', fontSize: 11, color: '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap' }}>
            <Eye size={11} /> Read-Only
          </div>
        )}

        {/* Unified Live Status Pill */}
        <div style={statusPillStyle}>
          {compileState.status === 'compiling' ? (
            <>
              <Loader2 size={11} color="#38bdf8" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Compiling...</span>
            </>
          ) : compileState.status === 'error' ? (
            <>
              <XCircle size={12} color="#f43f5e" />
              <span style={{ color: '#f43f5e', fontWeight: 600 }}>{compileState.errorCount} Error{compileState.errorCount > 1 ? 's' : ''}</span>
            </>
          ) : (
            <>
              <div style={liveRadarDotStyle} />
              <span style={{ color: '#10b981', fontWeight: 600 }}>Live</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>({compileState.durationMs}ms)</span>
            </>
          )}

          {compileState.warningCount > 0 && compileState.status !== 'error' && (
            <span style={{ color: '#f59e0b', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 2 }} title={`${compileState.warningCount} warnings`}>
              <AlertTriangle size={10} /> {compileState.warningCount}
            </span>
          )}

          {/* Cloud Sync indicator dot/icon */}
          {isCloudConnected && (
            <span title="Cloud storage synchronized" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 3, color: '#10b981' }}>
              <Cloud size={11} />
            </span>
          )}

          {/* Offline badge */}
          {isOffline && (
            <span title="Working offline (Cached in IndexedDB)" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 3, color: '#f59e0b' }}>
              <WifiOff size={11} />
            </span>
          )}
        </div>
      </div>

      {/* RIGHT GROUP: Consolidated Insert, Templates, Share, Export, Theme, User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* + Insert Dropdown Menu */}
        {currentRole !== 'viewer' && (
          <div ref={insertDropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setIsInsertDropdownOpen(prev => !prev)}
              className="btn-ghost"
              style={toolBtnStyle}
              title="Insert figures, tables, formulas or citations"
            >
              <Plus size={12} color="#38bdf8" />
              <span>Insert</span>
              <ChevronDown size={10} color="var(--text-muted)" />
            </button>

            {isInsertDropdownOpen && (
              <div style={{ ...dropdownMenuStyle, width: 200, left: 0 }}>
                <div style={{ padding: '4px 0' }}>
                  <button
                    onClick={() => { setIsInsertDropdownOpen(false); onOpenImageUpload(); }}
                    style={dropdownItemStyle}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <ImageIcon size={13} color="#38bdf8" />
                      <span>Figure &amp; Image</span>
                    </div>
                    <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>\includegraphics</span>
                  </button>

                  <button
                    onClick={() => { setIsInsertDropdownOpen(false); onOpenTableBuilder(); }}
                    style={dropdownItemStyle}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Table size={13} color="#10b981" />
                      <span>Table Builder</span>
                    </div>
                    <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>\tabular</span>
                  </button>

                  <button
                    onClick={() => { setIsInsertDropdownOpen(false); onOpenSymbols(); }}
                    style={dropdownItemStyle}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Hash size={13} color="#a855f7" />
                      <span>Math &amp; Formulas</span>
                    </div>
                    <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>\equation</span>
                  </button>

                  {onOpenDoiModal && (
                    <button
                      onClick={() => { setIsInsertDropdownOpen(false); onOpenDoiModal(); }}
                      style={dropdownItemStyle}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <BookMarked size={13} color="#f59e0b" />
                        <span>DOI Citation</span>
                      </div>
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>\cite</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Starter Templates */}
        <button onClick={onOpenTemplates} className="btn-ghost" title="Starter Templates" style={toolBtnStyle}>
          <BookOpen size={12} />
          <span>Templates</span>
        </button>

        <div style={{ width: 1, height: 14, backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />

        {/* Share Button / Co-authors */}
        <button
          onClick={onOpenShare}
          style={presenceButtonStyle}
          title="Share project & invite collaborators"
        >
          <Share2 size={12} color="#38bdf8" />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>Share</span>
          {peers.length > 0 && (
            <span className="badge badge-cyan" style={{ fontSize: 9, padding: '0 4px', marginLeft: 2 }}>
              {peers.length + 1}
            </span>
          )}
        </button>

        {/* Export PDF */}
        <button onClick={onExportPdf} className="btn-secondary" title="Export PDF Document" style={compactBtnStyle}>
          <Download size={11} />
          <span>PDF</span>
        </button>

        {/* Export ZIP */}
        <button onClick={onExportZip} className="btn-secondary" title="Download .ZIP Package" style={compactBtnStyle}>
          <FolderArchive size={11} color="#38bdf8" />
          <span>ZIP</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="btn-ghost"
          style={{ padding: 4, borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center' }}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={13} color="#f59e0b" /> : <Moon size={13} color="#38bdf8" />}
        </button>

        <div style={{ width: 1, height: 14, backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />

        {/* User Account / Sign In */}
        <div ref={userDropdownRef} style={{ position: 'relative' }}>
          {currentUser ? (
            <button
              onClick={() => setIsUserDropdownOpen(prev => !prev)}
              style={userProfileBtnStyle}
              title={`Signed in as ${currentUser.fullName}`}
            >
              <div style={{ ...avatarMiniStyle, backgroundColor: currentUser.avatarColor || '#38bdf8' }}>
                {currentUser.fullName ? currentUser.fullName.substring(0, 2).toUpperCase() : 'U'}
              </div>
              <ChevronDown size={10} color="var(--text-muted)" />
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="btn-primary"
              style={{ padding: '3px 8px', fontSize: 11, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <User size={11} /> Sign In
            </button>
          )}

          {isUserDropdownOpen && currentUser && (
            <div style={{ ...dropdownMenuStyle, left: 'auto', right: 0, width: 230 }}>
              {/* User Profile Card */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-0)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {currentUser.fullName}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  {currentUser.email}
                </div>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className={`badge ${getRoleBadgeClass(currentRole)}`} style={{ fontSize: 9 }}>
                    Project {currentRole === 'owner' ? 'Host' : currentRole}
                  </span>
                  <span title="AES-256 E2EE Automatic Protection" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9, color: '#10b981', marginLeft: 4 }}>
                    <ShieldCheck size={11} color="#10b981" /> Auto-Protected
                  </span>
                </div>
              </div>

              {/* Menu items */}
              <div style={{ padding: '4px 0' }}>
                <button
                  onClick={() => { setIsUserDropdownOpen(false); onOpenProjectsHub(); }}
                  style={dropdownItemStyle}
                >
                  <FolderKanban size={12} color="#38bdf8" />
                  <span>Projects Hub</span>
                </button>

                <button
                  onClick={() => { setIsUserDropdownOpen(false); onOpenAuth(); }}
                  style={dropdownItemStyle}
                >
                  <User size={12} color="var(--text-secondary)" />
                  <span>Switch Account</span>
                </button>

                {/* Website Developer section */}
                {isPlatformDev ? (
                  <>
                    <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />
                    <div style={{ padding: '3px 12px', fontSize: 9, fontWeight: 700, color: 'var(--accent-cyan)', letterSpacing: '0.05em' }}>
                      WEBSITE OWNER / DEVELOPER
                    </div>
                    <button
                      onClick={() => { setIsUserDropdownOpen(false); onOpenSupabase(); }}
                      style={dropdownItemStyle}
                    >
                      <Shield size={12} color="#38bdf8" />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span>Cloud Database Vault</span>
                        <span className="badge badge-cyan" style={{ fontSize: 8.5, padding: '1px 4px' }}>Dev</span>
                      </div>
                    </button>
                    <button
                      onClick={() => { onToggleDevDemoMode(); }}
                      style={dropdownItemStyle}
                    >
                      <Code size={12} color={isDevDemoActive ? '#10b981' : 'var(--text-muted)'} />
                      <span>Test Accounts: {isDevDemoActive ? 'Visible' : 'Hidden'}</span>
                    </button>
                    <button
                      onClick={() => { setIsUserDropdownOpen(false); onLockPlatformDev(); }}
                      style={{ ...dropdownItemStyle, color: 'var(--text-muted)' }}
                    >
                      <Lock size={12} />
                      <span>Lock Developer Mode</span>
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />
                    <button
                      onClick={() => { setIsUserDropdownOpen(false); onOpenDeveloperUnlock(); }}
                      style={{ ...dropdownItemStyle, fontSize: 10.5, color: 'var(--text-muted)' }}
                      title="Website Developer Access"
                    >
                      <Lock size={11} />
                      <span>Developer Access</span>
                    </button>
                  </>
                )}

                <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />

                <button
                  onClick={() => { setIsUserDropdownOpen(false); onSignOut(); }}
                  style={{ ...dropdownItemStyle, color: '#f43f5e' }}
                >
                  <LogOut size={12} color="#f43f5e" />
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
  boxShadow: '0 0 10px rgba(56, 189, 248, 0.35)',
};

const projectTitlePillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 6px',
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  transition: 'border-color 0.15s ease',
};

const cleanTitleInputStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text-primary)',
  fontSize: 11.5,
  fontWeight: 600,
  padding: '1px 3px',
  width: 155,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const chevronDropdownBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '1px 2px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

const shortcutKbdStyle: React.CSSProperties = {
  fontSize: 9.5,
  backgroundColor: 'rgba(255, 255, 255, 0.2)',
  padding: '1px 4px',
  borderRadius: 3,
  marginLeft: 3,
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const statusPillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 8px',
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 9999,
  fontSize: 11,
  whiteSpace: 'nowrap',
};

const liveRadarDotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  backgroundColor: '#10b981',
  boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.7)',
  animation: 'liveRadar 2s infinite',
  flexShrink: 0,
};

const presenceButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 7px',
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const userProfileBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 4px',
  backgroundColor: 'transparent',
  border: '1px solid transparent',
  borderRadius: 9999,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
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
  flexShrink: 0,
};

const toolBtnStyle: React.CSSProperties = {
  padding: '3px 7px',
  fontSize: 11,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const compactBtnStyle: React.CSSProperties = {
  padding: '3px 7px',
  fontSize: 11,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const dropdownMenuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  width: 250,
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
  padding: '6px 10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  background: 'none',
  border: 'none',
  color: 'var(--text-primary)',
  fontSize: 11.5,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background-color 0.12s ease',
  whiteSpace: 'nowrap',
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
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  borderRadius: 'var(--radius-xs)',
  whiteSpace: 'nowrap',
};
