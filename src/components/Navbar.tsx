import React from 'react';
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
  Sparkles,
  Image as ImageIcon,
  Shield,
  Cloud
} from 'lucide-react';
import type { CompileState, Collaborator } from '../types/latex';

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
  onOpenCopilot: () => void;
  onOpenImageUpload: () => void;
  onOpenSupabase: () => void;
  isCloudConnected: boolean;
  onExportPdf: () => void;
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
  onOpenCopilot,
  onOpenImageUpload,
  onOpenSupabase,
  isCloudConnected,
  onExportPdf,
}) => {
  return (
    <header style={navStyle}>
      {/* Brand & Project Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={logoMarkStyle}>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#000' }}>Tx</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            TEEEX<span style={{ color: '#38bdf8' }}>.</span>
          </span>
        </div>

        <div style={{ width: 1, height: 18, backgroundColor: 'var(--border-subtle)' }} />

        {/* Project Name Editable Input */}
        <input
          type="text"
          value={projectTitle}
          onChange={e => onTitleChange(e.target.value)}
          style={titleInputStyle}
          placeholder="Untitled LaTeX Document"
        />
      </div>

      {/* Middle: Live Compilation Status & Speed Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

      {/* Right Side: Tools, Collaboration, Theme */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* AI Copilot Button */}
        <button
          onClick={onOpenCopilot}
          className="btn-ghost"
          style={{ ...toolBtnStyle, color: '#c084fc', backgroundColor: 'rgba(192, 132, 252, 0.1)' }}
          title="AI LaTeX Copilot (Math, TikZ & Doctor)"
        >
          <Sparkles size={13} />
          <span>AI Copilot</span>
        </button>

        {/* Admin Security & Cloud Vault Button */}
        <button
          onClick={onOpenSupabase}
          className="btn-ghost"
          style={{ ...toolBtnStyle, color: isCloudConnected ? '#10b981' : 'var(--text-secondary)' }}
          title={isCloudConnected ? "Admin Vault (Cloud Connected)" : "Admin Security & Cloud Vault"}
        >
          {isCloudConnected ? <Cloud size={13} /> : <Shield size={13} color="#f59e0b" />}
          <span>{isCloudConnected ? 'Cloud Active' : 'Admin'}</span>
        </button>

        <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />

        {/* Upload Figure Button */}
        <button onClick={onOpenImageUpload} className="btn-ghost" title="Upload Figure & Insert \includegraphics" style={toolBtnStyle}>
          <ImageIcon size={13} />
          <span>Figure</span>
        </button>

        {/* Table Builder */}
        <button onClick={onOpenTableBuilder} className="btn-ghost" title="Visual Table Builder" style={toolBtnStyle}>
          <Table size={13} />
          <span>Table</span>
        </button>

        {/* Math Symbols */}
        <button onClick={onOpenSymbols} className="btn-ghost" title="LaTeX Symbol Palette" style={toolBtnStyle}>
          <Hash size={13} />
          <span>Symbols</span>
        </button>

        {/* Starter Templates */}
        <button onClick={onOpenTemplates} className="btn-ghost" title="Starter Templates" style={toolBtnStyle}>
          <BookOpen size={13} />
          <span>Templates</span>
        </button>

        {/* Collaborative Presence Pill */}
        <button
          onClick={onOpenShare}
          style={presenceButtonStyle}
          title="Manage real-time collaboration room"
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
        <button onClick={onExportPdf} className="btn-secondary" title="Export Ready PDF Document" style={{ padding: '4px 10px', fontSize: 11.5 }}>
          <Download size={12} />
          <span>Export</span>
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
  padding: '0 14px',
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

const titleInputStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid transparent',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 'var(--radius-xs)',
  width: 240,
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
  padding: '3px 10px',
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

const avatarMiniStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: '50%',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: 8.5,
  border: '1.5px solid var(--bg-surface-0)',
};

const toolBtnStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 11.5,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};
