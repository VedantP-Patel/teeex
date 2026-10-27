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
  WifiOff,
  ShieldCheck,
  Search,
  Cat,
  DownloadCloud
} from 'lucide-react';
import type { CompileState, CompileMode, Collaborator, Project, ProjectRole, UserProfile } from '../types/latex';
import type { EngineId, EngineStatus } from '../services/latexCompiler';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { EngineWarmupBadge } from './EngineWarmupBadge';
import { resolveUserProjectRole } from '../services/projectsService';

interface Props {
  projectTitle: string;
  onTitleChange: (title: string) => void;
  compileState: CompileState;
  onCompile: () => void;
  compileMode?: CompileMode;
  onToggleCompileMode?: (mode: CompileMode) => void;
  selectedEngine?: EngineId;
  onSelectEngine?: (engine: EngineId) => void;
  onOpenCommandPalette?: () => void;
  peers: Collaborator[];
  selfUser: Collaborator;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenShare: () => void;
  onOpenTableBuilder: () => void;
  onOpenSymbols: () => void;
  onOpenTemplates: () => void;
  onOpenImageUpload: () => void;
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
  isEncrypted?: boolean;
  isOffline?: boolean;
  isDeskPetEnabled?: boolean;
  onToggleDeskPet?: () => void;
  engineStatus?: EngineStatus;
}

export const Navbar: React.FC<Props> = ({
  projectTitle,
  onTitleChange,
  compileState,
  onCompile,
  compileMode = 'fast',
  onToggleCompileMode,
  selectedEngine = 'pdflatex',
  onSelectEngine,
  onOpenCommandPalette,
  peers,
  selfUser: _selfUser,
  theme,
  onToggleTheme,
  isDeskPetEnabled = false,
  onToggleDeskPet,
  onOpenShare,
  onOpenTableBuilder,
  onOpenSymbols,
  onOpenTemplates,
  onOpenImageUpload,
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
  isEncrypted: _isEncrypted,
  isOffline,
  engineStatus,
}) => {
  const { isInstallable, isInstalled, installApp } = usePwaInstall();
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const toolsDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setIsProjectDropdownOpen(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setIsExportDropdownOpen(false);
      }
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(e.target as Node)) {
        setIsToolsDropdownOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatCompileDuration = (ms?: number | null): string => {
    if (ms === undefined || ms === null) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

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
    <header style={navStyle} className="app-navbar">
      {/* CLUSTER 1 (LEFT): Brand & Unified Project Scope */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
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
                      {(() => {
                        const itemRole = resolveUserProjectRole(proj, currentUser);
                        return (
                          <span className={`badge ${getRoleBadgeClass(itemRole)}`} style={{ fontSize: 9.5, padding: '1px 5px', flexShrink: 0 }}>
                            {itemRole}
                          </span>
                        );
                      })()}
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

      {/* CLUSTER 2 (CENTER): Compilation, Mode & Unified Health */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {currentRole !== 'viewer' ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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

            {/* Compile Mode Switcher Capsule (⚡ Fast vs 💎 Final) */}
            {onToggleCompileMode && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'var(--bg-tertiary, rgba(255, 255, 255, 0.05))',
                  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
                  borderRadius: 6,
                  padding: 2,
                  gap: 2,
                }}
                role="group"
                aria-label="LaTeX compilation mode"
              >
                <button
                  type="button"
                  onClick={() => onToggleCompileMode('fast')}
                  style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 10,
                    fontWeight: compileMode === 'fast' ? 600 : 400,
                    background: compileMode === 'fast' ? 'var(--primary-color, #2563eb)' : 'transparent',
                    color: compileMode === 'fast' ? '#ffffff' : 'var(--text-muted, #94a3b8)',
                    transition: 'all 0.15s ease',
                  }}
                  title="Fast Mode: Instant pass-1 streaming, cached auxiliary artifacts"
                >
                  ⚡ <span className="nav-mode-label">Fast</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleCompileMode('publication')}
                  style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 10,
                    fontWeight: compileMode === 'publication' ? 600 : 400,
                    background: compileMode === 'publication' ? 'var(--primary-color, #2563eb)' : 'transparent',
                    color: compileMode === 'publication' ? '#ffffff' : 'var(--text-muted, #94a3b8)',
                    transition: 'all 0.15s ease',
                  }}
                  title="Publication Mode: Full multi-pass convergence, bibtex run"
                >
                  💎 <span className="nav-mode-label">Final</span>
                </button>
              </div>
            )}

            {/* TeX Engine Selector Capsule */}
            {onSelectEngine && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'var(--bg-tertiary, rgba(255, 255, 255, 0.05))',
                  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
                  borderRadius: 6,
                  padding: '2px 4px',
                }}
              >
                <select
                  value={selectedEngine}
                  onChange={(e) => onSelectEngine(e.target.value as EngineId)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary, #cbd5e1)',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none',
                    fontFamily: 'var(--font-mono, monospace)',
                    padding: '1px 2px',
                  }}
                  title="TeX Compilation Engine"
                  aria-label="Select TeX compilation engine"
                >
                  <option value="pdflatex" style={{ background: 'var(--bg-surface-0, #0d1017)', color: '#f1f5f9' }}>pdfLaTeX</option>
                  <option value="xelatex" style={{ background: 'var(--bg-surface-0, #0d1017)', color: '#f1f5f9' }}>XeLaTeX</option>
                  <option value="lualatex" style={{ background: 'var(--bg-surface-0, #0d1017)', color: '#f1f5f9' }}>LuaLaTeX</option>
                </select>
              </div>
            )}
          </div>
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
          ) : compileState.isDebouncing ? (
            <>
              <span className="pulse-dot" />
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>Queued</span>
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
              {(compileState.pdfDurationMs || compileState.durationMs) ? (
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '-0.02em',
                  }}
                  title={
                    compileState.pdfDurationMs
                      ? `Live draft: ${compileState.durationMs}ms | Engine pass: ${compileState.pdfDurationMs}ms`
                      : `Live compilation & render: ${compileState.durationMs}ms`
                  }
                >
                  ({formatCompileDuration(compileState.pdfDurationMs || compileState.durationMs)})
                </span>
              ) : null}
            </>
          )}

          {compileState.warningCount > 0 && compileState.status !== 'error' && (
            <span style={{ color: '#f59e0b', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 2 }} title={`${compileState.warningCount} warnings`}>
              <AlertTriangle size={10} /> {compileState.warningCount}
            </span>
          )}

          {/* Cloud Sync indicator */}
          {isCloudConnected && (
            <span title="Cloud synchronized" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 2, color: '#10b981' }}>
              <Cloud size={11} />
            </span>
          )}

          {/* Offline indicator */}
          {isOffline && (
            <span title="Working offline" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 2, color: '#f59e0b' }}>
              <WifiOff size={11} />
            </span>
          )}
        </div>

        {/* TeX Live WebAssembly Engine Warmup Capsule */}
        {engineStatus && (
          <EngineWarmupBadge status={engineStatus} isOffline={isOffline} compact={true} />
        )}

        {/* Command Palette Trigger Pill (Cmd+K / Ctrl+K) */}
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="btn-ghost"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 7px',
              borderRadius: 5,
              fontSize: 11,
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-surface-1)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="Open Universal Command Palette (Ctrl+K / ⌘K)"
          >
            <Search size={11} color="var(--text-muted)" />
            <span className="nav-cmd-label" style={{ fontSize: 10.5, fontWeight: 500 }}>Commands</span>
            <kbd
              style={{
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                padding: '1px 3px',
                borderRadius: 3,
                backgroundColor: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                lineHeight: 1,
              }}
            >
              ⌘K
            </kbd>
          </button>
        )}
      </div>

      {/* CLUSTER 3 (RIGHT): Collaboration, Consolidated Export, Tools & Account */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* Share Button / Co-authors */}
        <button
          onClick={onOpenShare}
          style={presenceButtonStyle}
          title="Share project & invite collaborators"
        >
          <Share2 size={12} color="#38bdf8" />
          <span className="nav-btn-label" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>Share</span>
          {peers.length > 0 && (
            <span className="badge badge-cyan" style={{ fontSize: 9, padding: '0 4px', marginLeft: 2 }}>
              {peers.length + 1}
            </span>
          )}
        </button>

        {/* Consolidated Export Dropdown (PDF & ZIP) */}
        <div ref={exportDropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setIsExportDropdownOpen(prev => !prev)}
            className="btn-secondary"
            style={{ ...compactBtnStyle, padding: '4px 8px', gap: 4 }}
            title="Export manuscript or source bundle"
          >
            <Download size={11} />
            <span className="nav-btn-label">Export</span>
            <ChevronDown size={10} color="var(--text-muted)" />
          </button>

          {isExportDropdownOpen && (
            <div style={{ ...dropdownMenuStyle, width: 200, right: 0 }}>
              <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                EXPORT MANUSCRIPT
              </div>
              <div style={{ padding: '4px 0' }}>
                <button
                  onClick={() => { setIsExportDropdownOpen(false); onExportPdf(); }}
                  style={dropdownItemStyle}
                  title="Download compiled PDF document"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Download size={13} color="#38bdf8" />
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 600 }}>PDF Document</div>
                      <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Compiled vector output (.pdf)</div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => { setIsExportDropdownOpen(false); onExportZip(); }}
                  style={dropdownItemStyle}
                  title="Download LaTeX source package as ZIP"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FolderArchive size={13} color="#10b981" />
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 600 }}>LaTeX Source (.zip)</div>
                      <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Complete project bundle</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Consolidated Tools & Insert Dropdown */}
        <div ref={toolsDropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setIsToolsDropdownOpen(prev => !prev)}
            className="btn-ghost"
            style={{ ...toolBtnStyle, padding: '4px 8px', gap: 4 }}
            title="Insert figures, tables, formulas, or browse templates"
          >
            <Plus size={12} color="#38bdf8" />
            <span className="nav-btn-label">Tools</span>
            <ChevronDown size={10} color="var(--text-muted)" />
          </button>

          {isToolsDropdownOpen && (
            <div style={{ ...dropdownMenuStyle, width: 220, right: 0 }}>
              <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                INSERT &amp; TEMPLATES
              </div>
              <div style={{ padding: '4px 0' }}>
                {currentRole !== 'viewer' && (
                  <>
                    <button
                      onClick={() => { setIsToolsDropdownOpen(false); onOpenImageUpload(); }}
                      style={dropdownItemStyle}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ImageIcon size={13} color="#38bdf8" />
                        <span>Figure &amp; Image</span>
                      </div>
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>\includegraphics</span>
                    </button>

                    <button
                      onClick={() => { setIsToolsDropdownOpen(false); onOpenTableBuilder(); }}
                      style={dropdownItemStyle}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Table size={13} color="#10b981" />
                        <span>Table Builder</span>
                      </div>
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>\tabular</span>
                    </button>

                    <button
                      onClick={() => { setIsToolsDropdownOpen(false); onOpenSymbols(); }}
                      style={dropdownItemStyle}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Hash size={13} color="#a855f7" />
                        <span>Math &amp; Formulas</span>
                      </div>
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>\equation</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => { setIsToolsDropdownOpen(false); onOpenTemplates(); }}
                  style={dropdownItemStyle}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BookOpen size={13} color="#f59e0b" />
                    <span>Starter Templates</span>
                  </div>
                  <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>IEEE, Nature...</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PWA App Install Action */}
        {isInstallable && !isInstalled && (
          <button
            type="button"
            onClick={installApp}
            className="pwa-install-btn"
            title="Install Teeex Desktop App (PWA)"
            aria-label="Install Teeex Desktop App"
          >
            <DownloadCloud size={12} />
            <span className="nav-btn-label">Install</span>
          </button>
        )}

        <div style={{ width: 1, height: 14, backgroundColor: 'var(--border-subtle)', margin: '0 1px' }} />

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          aria-label="Toggle color theme"
          className="btn-ghost"
          style={{ padding: 4, borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center' }}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={13} color="#f59e0b" /> : <Moon size={13} color="#38bdf8" />}
        </button>

        {/* Desk Companion (TeXCat) Toggle */}
        <button
          type="button"
          onClick={onToggleDeskPet}
          aria-label="Toggle Desk Companion"
          aria-pressed={isDeskPetEnabled}
          className="btn-ghost"
          style={{
            padding: 4,
            borderRadius: 'var(--radius-sm)',
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: isDeskPetEnabled ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
          }}
          title={`Desk Companion: ${isDeskPetEnabled ? 'Active (Click to disable)' : 'Off (Click to enable)'}`}
        >
          <Cat size={13} color={isDeskPetEnabled ? '#38bdf8' : 'var(--text-muted)'} />
        </button>

        <div style={{ width: 1, height: 14, backgroundColor: 'var(--border-subtle)', margin: '0 1px' }} />

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
