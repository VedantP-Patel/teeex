import React, { useState } from 'react';
import {
  ShieldCheck,
  Database,
  CheckCircle2,
  X,
  Cloud,
  LogOut,
  UploadCloud,
  Eye,
  EyeOff,
  Copy,
  Check,
  FileCode,
  ExternalLink,
  Layers,
  Lock,
  KeyRound,
  ShieldAlert
} from 'lucide-react';
import {
  configureSupabase,
  disconnectSupabase,
  isSupabaseConnected,
  testSupabaseConnection
} from '../../services/supabaseClient';
import { syncAllProjectsWithCloud } from '../../services/projectsService';
import type { Project, ProjectRole, UserProfile } from '../../types/latex';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSyncWithCloud: () => void;
  projects?: Project[];
  onProjectsUpdated?: (projects: Project[]) => void;
  currentRole?: ProjectRole;
  currentUser?: UserProfile | null;
}

const SUPABASE_SQL_SCRIPT = `-- ==============================================================================
-- TEEEX STUDIO — SUPABASE DATABASE INITIALIZATION SCRIPT
-- Paste and run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ==============================================================================

create extension if not exists "uuid-ossp";

-- 1. Profiles Table (user accounts & academic roles)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text default '',
  avatar_url text,
  avatar_color text default '#38bdf8',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;
create policy "Allow select on profiles" on public.profiles for select using (true);
create policy "Allow insert on profiles" on public.profiles for insert with check (auth.uid() = id);
create policy "Allow update on profiles" on public.profiles for update using (auth.uid() = id);

-- 2. Projects Table (LaTeX files, documents & permissions)
create table if not exists public.projects (
  id text primary key,
  title text not null,
  owner_id text not null,
  owner_email text not null,
  role text not null default 'owner',
  files jsonb not null default '[]'::jsonb,
  tags text[] default array[]::text[],
  members jsonb default '[]'::jsonb,
  is_archived boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.projects enable row level security;
create policy "Allow select on projects" on public.projects for select using (true);
create policy "Allow insert on projects" on public.projects for insert with check (true);
create policy "Allow update on projects" on public.projects for update using (true);
create policy "Allow delete on projects" on public.projects for delete using (true);

-- 3. Checkpoints Table (Version History Time Machine)
create table if not exists public.checkpoints (
  id text primary key,
  project_id text references public.projects(id) on delete cascade,
  name text not null,
  timestamp text not null,
  author text not null,
  files jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.checkpoints enable row level security;
create policy "Allow all on checkpoints" on public.checkpoints for all using (true);

-- 4. Enable Supabase Realtime for Projects Table
alter publication supabase_realtime add table public.projects;

-- 5. Auto-create profile trigger on sign up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_color)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), '#38bdf8')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();`;

export const SupabaseModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSyncWithCloud,
  projects = [],
  currentRole = 'owner',
  currentUser,
}) => {
  // Credentials State
  const [url, setUrl] = useState(() => localStorage.getItem('teeex_supabase_url') || import.meta.env.VITE_SUPABASE_URL || '');
  const [anonKey, setAnonKey] = useState(() => localStorage.getItem('teeex_supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '');

  // Admin Security States
  const [adminPasscode, setAdminPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState(false);
  const [elevatedAdmin, setElevatedAdmin] = useState(false);

  // UI States
  const [showAnonKey, setShowAnonKey] = useState(false);
  const [connected, setConnected] = useState(() => isSupabaseConnected());
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncingProjects, setSyncingProjects] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [activeTab, setActiveTab] = useState<'cloud' | 'sql' | 'security'>('cloud');

  if (!isOpen) return null;

  const isAuthorized = currentRole === 'owner' || elevatedAdmin;

  const handleUnlockAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = adminPasscode.trim().toLowerCase();
    if (clean === 'admin' || clean === 'owner' || clean === 'teeex' || clean === '2026' || clean === 'admin123') {
      setElevatedAdmin(true);
      setPasscodeError(false);
      setAdminPasscode('');
    } else {
      setPasscodeError(true);
    }
  };

  // Test Connection
  const handleTestConnection = async () => {
    if (!url.trim() || !anonKey.trim()) {
      setTestResult({ success: false, message: 'Please enter both Project URL and Anon Public Key' });
      return;
    }
    setTestingConnection(true);
    setTestResult(null);
    const res = await testSupabaseConnection(url.trim(), anonKey.trim());
    setTestingConnection(false);
    setTestResult(res);
  };

  // Handle Connect
  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !anonKey.trim()) return;

    const ok = configureSupabase(url.trim(), anonKey.trim());
    if (ok) {
      setConnected(true);
      onSyncWithCloud();
    }
  };

  const handleConnectDemo = () => {
    const demoUrl = 'https://demo-teeex-latex.supabase.co';
    const demoKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo-anon-key-teeex-studio';
    setUrl(demoUrl);
    setAnonKey(demoKey);
    configureSupabase(demoUrl, demoKey);
    setConnected(true);
    onSyncWithCloud();
  };

  const handleDisconnect = () => {
    disconnectSupabase();
    setConnected(false);
    setTestResult(null);
  };

  const handleSyncToCloud = async () => {
    if (!projects || projects.length === 0) {
      setSyncStatusMsg('No projects available to sync');
      return;
    }
    setSyncingProjects(true);
    setSyncStatusMsg(null);
    const res = await syncAllProjectsWithCloud(projects);
    setSyncingProjects(false);
    if (res.success) {
      setSyncStatusMsg(`Successfully synced ${res.syncedCount} projects to Supabase!`);
    } else {
      setSyncStatusMsg(`Sync error: ${res.error}`);
    }
    setTimeout(() => setSyncStatusMsg(null), 4000);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCRIPT);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  // RENDER ADMIN GATE IF NOT AUTHORIZED
  if (!isAuthorized) {
    return (
      <div style={backdropStyle} onClick={onClose}>
        <div style={{ ...modalStyle, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ padding: 6, borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(244, 63, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lock size={16} color="#f43f5e" />
              </div>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Admin Clearance Required
                </h2>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                  Restricted Cloud &amp; Security Vault
                </p>
              </div>
            </div>
            <button onClick={onClose} style={closeBtnStyle}>
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              padding: 12,
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(244, 63, 94, 0.06)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start'
            }}>
              <ShieldAlert size={18} color="#f43f5e" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, color: '#f43f5e', marginBottom: 2 }}>
                  Sensitive Production Credentials
                </div>
                Database connection strings, anon API keys, and SQL migrations are restricted to the Workspace Owner / Administrator.
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>ACTIVE SESSION</span>
              <span className="badge badge-amber" style={{ fontSize: 10 }}>
                {currentUser?.fullName || 'User'} &bull; {currentRole.toUpperCase()}
              </span>
            </div>

            <form onSubmit={handleUnlockAdmin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>ADMIN / OWNER PASSCODE</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    placeholder="Enter admin passcode (e.g. admin)"
                    value={adminPasscode}
                    onChange={e => {
                      setAdminPasscode(e.target.value);
                      if (passcodeError) setPasscodeError(false);
                    }}
                    style={{
                      ...inputStyle,
                      paddingLeft: 34,
                      borderColor: passcodeError ? '#f43f5e' : 'var(--border-subtle)',
                    }}
                    autoFocus
                  />
                  <KeyRound size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                </div>
                {passcodeError && (
                  <div style={{ fontSize: 11, color: '#f43f5e', marginTop: 4 }}>
                    Invalid admin passcode. Try 'admin' or switch to Owner profile.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, fontSize: 12 }}>
                  <ShieldCheck size={14} /> Unlock Admin Vault
                </button>
                <button type="button" onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={18} color="#10b981" />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Supabase Cloud Setup &amp; Vault</h2>
                <span className="badge badge-cyan" style={{ fontSize: 9.5, padding: '1px 6px' }}>
                  👑 Admin Mode
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Restricted to {currentRole === 'owner' ? 'Project Owner' : 'Elevated Administrator'}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Bar */}
        <div style={tabBarStyle}>
          <button
            onClick={() => setActiveTab('cloud')}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'cloud' ? '#38bdf8' : 'var(--text-secondary)',
              borderBottom: activeTab === 'cloud' ? '2px solid #38bdf8' : '2px solid transparent',
              fontWeight: activeTab === 'cloud' ? 600 : 500,
            }}
          >
            <Database size={13} /> Connection &amp; Status
          </button>

          <button
            onClick={() => setActiveTab('sql')}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'sql' ? '#38bdf8' : 'var(--text-secondary)',
              borderBottom: activeTab === 'sql' ? '2px solid #38bdf8' : '2px solid transparent',
              fontWeight: activeTab === 'sql' ? 600 : 500,
            }}
          >
            <FileCode size={13} /> SQL Database Script
          </button>

          <button
            onClick={() => setActiveTab('security')}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'security' ? '#38bdf8' : 'var(--text-secondary)',
              borderBottom: activeTab === 'security' ? '2px solid #38bdf8' : '2px solid transparent',
              fontWeight: activeTab === 'security' ? 600 : 500,
            }}
          >
            <ShieldCheck size={13} /> Vercel Deployment
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', maxHeight: '72vh' }}>
          {/* TAB 1: CLOUD CONNECTION */}
          {activeTab === 'cloud' && (
            <>
              {connected ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={statusBannerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CheckCircle2 size={20} color="#10b981" />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#10b981' }}>Connected to Supabase Cloud</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{url}</div>
                      </div>
                    </div>
                    <span className="badge badge-emerald">Online</span>
                  </div>

                  {/* Credentials Display with Mask Toggle */}
                  <div style={{ backgroundColor: 'var(--bg-surface-0)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={labelStyle}>ANON PUBLIC KEY</span>
                      <button
                        onClick={() => setShowAnonKey(!showAnonKey)}
                        className="btn-ghost"
                        style={{ padding: 2, fontSize: 11 }}
                      >
                        {showAnonKey ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Show</>}
                      </button>
                    </div>
                    <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                      {showAnonKey ? anonKey : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                    </code>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={handleSyncToCloud}
                      disabled={syncingProjects}
                      className="btn-primary"
                      style={{ flex: 1, fontSize: 12 }}
                    >
                      <UploadCloud size={14} />
                      {syncingProjects ? 'Syncing...' : syncStatusMsg || 'Sync Projects to Supabase'}
                    </button>

                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testingConnection}
                      className="btn-secondary"
                      style={{ fontSize: 12 }}
                      title="Verify PostgreSQL status"
                    >
                      <CheckCircle2 size={13} color="#10b981" />
                      {testingConnection ? 'Testing...' : 'Test Health'}
                    </button>

                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="btn-secondary"
                      style={{ color: '#f43f5e', fontSize: 12 }}
                    >
                      <LogOut size={14} /> Disconnect
                    </button>
                  </div>

                  {testResult && (
                    <div style={{
                      padding: 10,
                      borderRadius: 6,
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                      border: `1px solid ${testResult.success ? '#10b981' : '#f43f5e'}`,
                      color: testResult.success ? '#10b981' : '#f43f5e',
                    }}>
                      {testResult.success ? <CheckCircle2 size={16} /> : <X size={16} />}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Enter your Supabase credentials below. You can find them in your Supabase Dashboard under <strong>Project Settings &rarr; API</strong>.
                  </div>

                  <div>
                    <label style={labelStyle}>SUPABASE PROJECT URL</label>
                    <input
                      type="text"
                      placeholder="https://your-project-id.supabase.co"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={labelStyle}>ANON PUBLIC KEY</label>
                      <button
                        type="button"
                        onClick={() => setShowAnonKey(!showAnonKey)}
                        className="btn-ghost"
                        style={{ padding: 2, fontSize: 11 }}
                      >
                        {showAnonKey ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                    <input
                      type={showAnonKey ? "text" : "password"}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      value={anonKey}
                      onChange={e => setAnonKey(e.target.value)}
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button type="submit" className="btn-primary" style={{ flex: 1, fontSize: 12 }}>
                      <Database size={13} /> Save &amp; Connect
                    </button>

                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testingConnection || !url.trim() || !anonKey.trim()}
                      className="btn-secondary"
                      style={{ fontSize: 12 }}
                    >
                      {testingConnection ? 'Testing...' : 'Test Connection'}
                    </button>

                    <button
                      type="button"
                      onClick={handleConnectDemo}
                      className="btn-secondary"
                      style={{ fontSize: 12 }}
                      title="Use client-side sandbox without a real Supabase account"
                    >
                      <Cloud size={13} color="#38bdf8" /> Try Demo Sandbox
                    </button>
                  </div>

                  {testResult && (
                    <div style={{
                      padding: 10,
                      borderRadius: 6,
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                      border: `1px solid ${testResult.success ? '#10b981' : '#f43f5e'}`,
                      color: testResult.success ? '#10b981' : '#f43f5e',
                    }}>
                      {testResult.success ? <CheckCircle2 size={16} /> : <X size={16} />}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </form>
              )}
            </>
          )}

          {/* TAB 2: SQL SCHEMA & TABLES */}
          {activeTab === 'sql' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Run this initialization script in your Supabase SQL Editor to automatically create all required tables (<code>projects</code>, <code>profiles</code>, <code>checkpoints</code>) and enable Realtime sync.
              </div>

              {/* Instructions steps */}
              <div style={stepsBoxStyle}>
                <div style={stepItemStyle}>
                  <span style={stepNumStyle}>1</span>
                  <span>Open your project at <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>supabase.com/dashboard <ExternalLink size={10} style={{ display: 'inline' }} /></a></span>
                </div>
                <div style={stepItemStyle}>
                  <span style={stepNumStyle}>2</span>
                  <span>Navigate to <strong>SQL Editor</strong> on the left sidebar &rarr; click <strong>New Query</strong></span>
                </div>
                <div style={stepItemStyle}>
                  <span style={stepNumStyle}>3</span>
                  <span>Paste the SQL script below and click <strong>Run</strong></span>
                </div>
              </div>

              {/* Code Box with Copy Button */}
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                    DATABASE INITIALIZATION SCRIPT (SQL)
                  </span>
                  <button
                    onClick={handleCopySql}
                    className="btn-primary"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                  >
                    {copiedSql ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Full Script</>}
                  </button>
                </div>

                <pre style={codeBoxStyle}>
                  {SUPABASE_SQL_SCRIPT}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: VERCEL DEPLOYMENT & ENVIRONMENT */}
          {activeTab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                When deploying Teeex Studio on <strong>Vercel</strong>, you do not need to configure credentials in browser modals. Vercel passes them automatically at build time.
              </div>

              <div style={{ backgroundColor: 'var(--bg-surface-0)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: '#38bdf8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={14} /> Vercel Native Supabase Integration
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 10px 0' }}>
                  If you connected Supabase via the Vercel Marketplace, Vercel automatically populates <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code>. Teeex Studio&apos;s Vite build automatically maps these without requiring any manual changes.
                </p>

                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  MANUAL VERCEL ENVIRONMENT VARIABLES:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={envRowStyle}>
                    <code>VITE_SUPABASE_URL</code>
                    <span style={{ color: 'var(--text-muted)' }}>= https://xyz.supabase.co</span>
                  </div>
                  <div style={envRowStyle}>
                    <code>VITE_SUPABASE_ANON_KEY</code>
                    <span style={{ color: 'var(--text-muted)' }}>= eyJhbGci...</span>
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 'var(--radius-sm)', padding: 10, fontSize: 11.5, color: '#10b981', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                <span>Zero serverless cold-start delays: Pure static compilation deployed via Vercel Edge CDN.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-0)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Supabase PostgreSQL &bull; Realtime WebSockets &bull; Auth JWT
          </span>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>
            Done
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
  width: '620px',
  maxWidth: '92vw',
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
  padding: '14px 20px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'var(--bg-surface-0)',
};

const closeBtnStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  padding: 4,
  borderRadius: 'var(--radius-sm)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
};

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  background: 'none',
  border: 'none',
  fontSize: 12,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 12,
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  outline: 'none',
};

const statusBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 14px',
  backgroundColor: 'rgba(16, 185, 129, 0.08)',
  border: '1px solid rgba(16, 185, 129, 0.25)',
  borderRadius: 'var(--radius-sm)',
};

const stepsBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  backgroundColor: 'var(--bg-surface-0)',
  padding: 12,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
};

const stepItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11.5,
  color: 'var(--text-primary)',
};

const stepNumStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: '50%',
  backgroundColor: '#38bdf8',
  color: '#000',
  fontWeight: 700,
  fontSize: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const codeBoxStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 12,
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-secondary)',
  maxHeight: 180,
  overflowY: 'auto',
  margin: 0,
  whiteSpace: 'pre',
  lineHeight: 1.4,
};

const envRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 11.5,
  fontFamily: 'var(--font-mono)',
  backgroundColor: 'var(--bg-surface-1)',
  padding: '4px 8px',
  borderRadius: 4,
};
