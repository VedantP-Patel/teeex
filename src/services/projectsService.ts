import type { Project, ProjectRole, UserProfile } from '../types/latex';
import { STARTER_TEMPLATES } from './templates';
import { getAuthUid, getSupabaseClient } from './supabaseClient';
import { getStoredSession } from './authService';
import { verifyShareKey } from './shareSecurityService';
import { safePostTask } from '../utils/scheduler';

const PROJECTS_STORAGE_KEY = 'teeex_saved_projects';
const ACTIVE_PROJECT_ID_KEY = 'teeex_active_project_id';

/**
 * Project ids are primary keys in a shared table, so they must not be
 * guessable: `proj-${Date.now().toString(36)}` let anyone pre-insert a row
 * under an id a victim would later generate, whose upsert then fails on the
 * unique constraint. Two projects created in the same millisecond also
 * collided. Ids created before this change remain guessable.
 */
function newProjectId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `proj-${crypto.randomUUID()}`;
  }
  const entropy = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(entropy);
  }
  return `proj-${Array.from(entropy, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function formatRelativeTime(isoOrText?: string): string {
  if (!isoOrText) return 'Recently';
  const trimmed = isoOrText.trim();
  if (trimmed.toLowerCase().includes('just now')) return 'Just now';
  if (trimmed.toLowerCase().includes('ago') || trimmed.toLowerCase().includes('yesterday')) return trimmed;

  const date = new Date(trimmed);
  if (isNaN(date.getTime())) return trimmed;

  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);

  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.max(1, Math.floor(diffSec / 60))}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return 'Yesterday';
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function resolveUserProjectRole(
  project: Project,
  currentUser: UserProfile | null,
  sharedRoomContext?: { roomId: string; key?: string | null }
): ProjectRole {
  if (sharedRoomContext?.key) {
    const verified = verifyShareKey(sharedRoomContext.roomId, sharedRoomContext.key);
    if (verified) return verified;
  }

  if (currentUser?.email) {
    const email = currentUser.email.toLowerCase().trim();
    const uid = currentUser.id;
    if (
      (project.ownerEmail && project.ownerEmail.toLowerCase().trim() === email) ||
      (uid && project.ownerId === uid)
    ) {
      return 'owner';
    }
    const member = project.members?.find(
      m => (m.email && m.email.toLowerCase().trim() === email) || (uid && m.id === uid)
    );
    if (member?.role) return member.role;
    return 'viewer';
  }

  // Guest / unauthenticated mode:
  const isLocal =
    project.ownerId === 'usr-local' ||
    project.ownerEmail === 'you@teeex.local' ||
    project.ownerEmail === 'anonymous@teeex.io';

  if (isLocal) return 'owner';

  const member = project.members?.find(
    m => m.id === 'usr-local' || m.email === 'you@teeex.local' || m.email === 'anonymous@teeex.io'
  );
  if (member?.role) return member.role;

  return project.role === 'owner' ? 'viewer' : (project.role || 'viewer');
}

const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-starter',
    title: 'Untitled Project',
    ownerId: 'usr-local',
    ownerEmail: 'you@teeex.local',
    role: 'owner',
    createdAt: new Date().toISOString(),
    updatedAt: 'Just now',
    files: STARTER_TEMPLATES[0].files, // IEEE paper example
    folders: ['sections', 'figures'],
    tags: ['#research', '#draft'],
    members: [
      {
        id: 'usr-local',
        email: 'you@teeex.local',
        name: 'You',
        avatar: 'ME',
        avatarColor: '#38bdf8',
        role: 'owner',
        joinedAt: new Date().toISOString().slice(0, 10),
      },
    ],
    isArchived: false,
  },
  {
    id: 'proj-neural-quantum',
    title: 'Neural Quantum State Tomography',
    ownerId: 'usr-elena-rostova',
    ownerEmail: 'elena.rostova@mit.edu',
    role: 'editor', // Viewing user is editor
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: '2h ago',
    files: STARTER_TEMPLATES[1] ? STARTER_TEMPLATES[1].files : STARTER_TEMPLATES[0].files,
    folders: ['sections', 'figures'],
    tags: ['#quantum', '#collab', '#attention'],
    members: [
      {
        id: 'usr-elena-rostova',
        email: 'elena.rostova@mit.edu',
        name: 'Dr. Elena Rostova',
        avatar: 'ER',
        avatarColor: '#a855f7',
        role: 'owner',
        joinedAt: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      },
      {
        id: 'usr-local',
        email: 'you@teeex.local',
        name: 'You',
        avatar: 'ME',
        avatarColor: '#38bdf8',
        role: 'editor',
        joinedAt: new Date(Date.now() - 7200000).toISOString().slice(0, 10),
      },
    ],
    isArchived: false,
  },
];

function normalizeProject(p: any): Project {
  return {
    id: p?.id || newProjectId(),
    title: p?.title || 'Untitled Project',
    ownerId: p?.ownerId || 'usr-anonymous',
    ownerEmail: p?.ownerEmail || 'anonymous@teeex.io',
    role: p?.role || 'owner',
    createdAt: p?.createdAt || new Date().toISOString(),
    updatedAt: p?.updatedAt || 'Just now',
    files: Array.isArray(p?.files) && p.files.length > 0 ? p.files : STARTER_TEMPLATES[0].files,
    folders: Array.isArray(p?.folders) ? p.folders : ['sections', 'figures'],
    tags: Array.isArray(p?.tags) ? p.tags : ['#research'],
    members: Array.isArray(p?.members) ? p.members : [],
    isArchived: Boolean(p?.isArchived),
  };
}

export function getAllProjectsRaw(): Project[] {
  let allProjects: Project[] = [];
  const saved = localStorage.getItem(PROJECTS_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter out any corrupted or legacy 'proj-guest' / 'Sign In Required' dummy projects
        const valid = parsed.filter(p => p.id !== 'proj-guest' && p.title !== 'Sign In Required');
        if (valid.length > 0) {
          allProjects = valid.map(normalizeProject);
        }
      }
    } catch {
      localStorage.removeItem(PROJECTS_STORAGE_KEY);
    }
  }

  if (allProjects.length === 0) {
    // Save initial projects
    allProjects = INITIAL_PROJECTS.map(normalizeProject);
    saveProjects(allProjects);
  }

  return allProjects;
}

export function loadProjects(userEmail?: string, userName?: string): Project[] {
  const allProjects = getAllProjectsRaw();
  const sessionUser = getStoredSession().user;
  const targetEmail = (userEmail || sessionUser?.email || '').toLowerCase().trim();
  const targetName = userName || sessionUser?.fullName || (targetEmail ? targetEmail.split('@')[0] : 'Author');

  let baseList: Project[];

  if (targetEmail) {
    const filtered = allProjects.filter(p =>
      (p.ownerEmail || '').toLowerCase() === targetEmail ||
      p.members?.some(m => (m.email || '').toLowerCase() === targetEmail)
    );

    // If user has no projects, create a default one for them
    if (filtered.length === 0) {
      const defaultProj = createProject(
        `${targetName ? targetName + "'s" : 'My'} First Paper`,
        targetEmail,
        targetName
      );
      baseList = [defaultProj];
    } else {
      // Auto-sync existing projects if userName differs from raw email prefix
      if (targetName && targetName.trim()) {
        let anyChanged = false;
        const updatedAll = allProjects.map(p => {
          let pChanged = false;
          const newMembers = (p.members || []).map(m => {
            if (m.email.toLowerCase() === targetEmail && m.name !== targetName) {
              pChanged = true;
              return {
                ...m,
                name: targetName,
                avatar: targetName.substring(0, 2).toUpperCase() || m.avatar,
              };
            }
            return m;
          });
          if (pChanged) {
            anyChanged = true;
            return { ...p, members: newMembers };
          }
          return p;
        });

        if (anyChanged) {
          saveProjects(updatedAll);
          baseList = updatedAll.filter(p =>
            (p.ownerEmail || '').toLowerCase() === targetEmail ||
            p.members?.some(m => (m.email || '').toLowerCase() === targetEmail)
          );
        } else {
          baseList = filtered;
        }
      } else {
        baseList = filtered;
      }
    }
  } else {
    // Guest / unauthenticated state: return all projects so they can explore
    baseList = allProjects;
  }

  const inspectingUser: UserProfile | null = targetEmail
    ? {
        id: sessionUser?.id || `usr-${targetEmail.replace(/[^a-zA-Z0-9]/g, '')}`,
        email: targetEmail,
        fullName: targetName,
      }
    : sessionUser;

  // Resolve dynamic role relative to inspecting user
  return baseList.map(p => ({
    ...p,
    role: resolveUserProjectRole(p, inspectingUser),
  }));
}

export function saveProjects(projects: Project[]): void {
  const sanitized = projects.filter(p => p.id !== 'proj-guest' && p.title !== 'Sign In Required');
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(sanitized));
}

export function getActiveProjectId(projects: Project[]): string {
  const savedId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
  if (savedId && projects.some(p => p.id === savedId && Array.isArray(p.files) && p.files.length > 0)) {
    return savedId;
  }
  return projects[0]?.id || 'proj-neural-quantum';
}

export function setActiveProjectId(id: string): void {
  localStorage.setItem(ACTIVE_PROJECT_ID_KEY, id);
}

export function createProject(
  title: string,
  userEmail: string,
  userName: string,
  templateId?: string
): Project {
  const chosenTemplate = STARTER_TEMPLATES.find(t => t.id === templateId) || STARTER_TEMPLATES[0];
  const newId = newProjectId();

  const newProject: Project = {
    id: newId,
    title: title.trim() || 'Untitled LaTeX Document',
    ownerId: `usr-${userEmail.replace(/[^a-zA-Z0-9]/g, '')}`,
    ownerEmail: userEmail,
    role: 'owner',
    createdAt: new Date().toISOString(),
    updatedAt: 'Just now',
    files: JSON.parse(JSON.stringify(chosenTemplate.files)), // Deep clone
    tags: ['#research'],
    members: [
      {
        id: `usr-${userEmail.replace(/[^a-zA-Z0-9]/g, '')}`,
        email: userEmail,
        name: userName,
        avatar: userName.substring(0, 2).toUpperCase() || 'ME',
        avatarColor: '#38bdf8',
        role: 'owner',
        joinedAt: new Date().toISOString().split('T')[0],
      },
    ],
    isArchived: false,
  };

  const projects = getAllProjectsRaw();
  const updated = [newProject, ...projects];
  saveProjects(updated);
  setActiveProjectId(newId);

  // Background sync if connected
  safePostTask(() => pushProjectToCloud(newProject), { priority: 'background' }).catch(() => { });

  return newProject;
}

export function duplicateProject(projectId: string): Project | null {
  const projects = getAllProjectsRaw();
  const target = projects.find(p => p.id === projectId);
  if (!target) return null;

  const cloneId = newProjectId();
  const cloned: Project = {
    ...JSON.parse(JSON.stringify(target)),
    id: cloneId,
    title: `${target.title} (Copy)`,
    role: 'owner', // Duplicator becomes owner of their copy
    createdAt: new Date().toISOString(),
    updatedAt: 'Just now',
    isArchived: false,
  };

  const updated = [cloned, ...projects];
  saveProjects(updated);

  // Background sync if connected
  safePostTask(() => pushProjectToCloud(cloned), { priority: 'background' }).catch(() => { });

  return cloned;
}

export function toggleArchiveProject(projectId: string): Project[] {
  const projects = getAllProjectsRaw();
  const updated = projects.map(p =>
    p.id === projectId ? { ...p, isArchived: !p.isArchived } : p
  );
  saveProjects(updated);

  const target = updated.find(p => p.id === projectId);
  if (target) {
    safePostTask(() => pushProjectToCloud(target), { priority: 'background' }).catch(() => { });
  }

  return loadProjects();
}

export function deleteProject(projectId: string): Project[] {
  const projects = getAllProjectsRaw();
  const filtered = projects.filter(p => p.id !== projectId);
  saveProjects(filtered);

  // Background delete from Supabase if connected
  const supabase = getSupabaseClient();
  if (supabase) {
    safePostTask(async () => {
      try {
        await supabase.from('projects').delete().eq('id', projectId);
      } catch { }
    }, { priority: 'background' }).catch(() => { });
  }

  return loadProjects();
}

export function updateProject(
  projectId: string,
  patch: Partial<Project>
): Project[] {
  const projects = getAllProjectsRaw();
  const updated = projects.map(p => {
    if (p.id === projectId) {
      return {
        ...p,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
    }
    return p;
  });
  saveProjects(updated);

  const target = updated.find(p => p.id === projectId);
  if (target) {
    safePostTask(() => pushProjectToCloud(target), { priority: 'background' }).catch(() => { });
  }

  return loadProjects();
}

// ==============================================================================
// SUPABASE DATABASE CLOUD SYNC HELPERS
// ==============================================================================

/**
 * `owner_uid` is the only column that carries authorisation: every RLS policy on
 * `projects` is written against `owner_uid = auth.uid()`. `owner_id` is a
 * client-derived string kept for backwards compatibility and trusted for
 * nothing. A row inserted without `owner_uid` is rejected by the insert policy,
 * which is the correct outcome for a signed-out client — it should not be
 * writing to the cloud at all.
 */
export function projectToRow(p: Project, ownerUid?: string | null) {
  return {
    id: p.id,
    title: p.title,
    owner_id: p.ownerId,
    owner_uid: ownerUid ?? null,
    owner_email: p.ownerEmail,
    role: p.role,
    files: p.files,
    folders: p.folders || ['sections', 'figures'],
    tags: p.tags,
    members: p.members,
    is_archived: p.isArchived,
    created_at: p.createdAt,
    updated_at: new Date().toISOString(),
  };
}

export function rowToProject(r: any): Project {
  return {
    id: r.id,
    title: r.title || 'Untitled Project',
    ownerId: r.owner_id || r.ownerId || 'usr-anonymous',
    ownerEmail: r.owner_email || r.ownerEmail || 'anonymous@teeex.io',
    role: r.role || 'owner',
    files: Array.isArray(r.files) && r.files.length > 0 ? r.files : STARTER_TEMPLATES[0].files,
    folders: Array.isArray(r.folders) ? r.folders : ['sections', 'figures'],
    tags: Array.isArray(r.tags) ? r.tags : ['#research'],
    members: Array.isArray(r.members) ? r.members : [],
    isArchived: Boolean(r.is_archived ?? r.isArchived),
    createdAt: r.created_at || r.createdAt || new Date().toISOString(),
    updatedAt: r.updated_at || r.updatedAt || 'Just now',
  };
}

export async function pushProjectToCloud(project: Project): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, error: 'Supabase client not connected' };

  const ownerUid = await getAuthUid();
  if (!ownerUid) return { success: false, error: 'Not signed in' };

  try {
    const row = projectToRow(project, ownerUid);
    let { error } = await supabase.from('projects').upsert(row, { onConflict: 'id' });
    if (error && (error.code === 'PGRST204' || error.message?.includes('folders'))) {
      // Schema compatibility: retry without 'folders' column if missing on remote table
      const { folders, ...rowWithoutFolders } = row;
      const retry = await supabase.from('projects').upsert(rowWithoutFolders, { onConflict: 'id' });
      error = retry.error;
    }
    if (error) {
      console.warn('Supabase project upsert error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.warn('Cloud sync failed with exception:', e);
    return { success: false, error: e?.message || 'Cloud sync failed' };
  }
}

export async function fetchProjectsFromCloud(): Promise<{ success: boolean; projects?: Project[]; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, error: 'Supabase client not connected' };

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('Fetch projects from cloud error:', error.message);
      return { success: false, error: error.message };
    }
    if (!data || data.length === 0) return { success: true, projects: [] };

    return { success: true, projects: data.map(rowToProject) };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { success: false, error: e?.message || 'Cloud fetch failed' };
  }
}

export async function syncAllProjectsWithCloud(localProjects: Project[]): Promise<{ success: boolean; syncedCount: number; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, syncedCount: 0, error: 'Supabase client not connected' };

  const ownerUid = await getAuthUid();
  if (!ownerUid) return { success: false, syncedCount: 0, error: 'Not signed in' };

  try {
    const rows = localProjects.map((p) => projectToRow(p, ownerUid));
    let { error } = await supabase.from('projects').upsert(rows, { onConflict: 'id' });
    if (error && (error.code === 'PGRST204' || error.message?.includes('folders'))) {
      const rowsWithoutFolders = rows.map(({ folders, ...rest }) => rest);
      const retry = await supabase.from('projects').upsert(rowsWithoutFolders, { onConflict: 'id' });
      error = retry.error;
    }
    if (error) return { success: false, syncedCount: 0, error: error.message };
    return { success: true, syncedCount: rows.length };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { success: false, syncedCount: 0, error: e?.message || 'Cloud sync failed' };
  }
}

/**
 * Bi-directional cloud synchronization:
 * Fetches remote projects, reconciles with local projects (resolving conflicts by latest timestamp),
 * pushes any local-only projects to the cloud, and updates localStorage.
 */
export async function syncProjectsWithCloudBiDirectional(
  userEmail?: string,
  userName?: string
): Promise<{ success: boolean; projects: Project[]; syncedCount: number }> {
  const cloudRes = await fetchProjectsFromCloud();
  const localRaw = getAllProjectsRaw();

  if (!cloudRes.success || !cloudRes.projects) {
    return {
      success: false,
      projects: loadProjects(userEmail, userName),
      syncedCount: 0,
    };
  }

  const projectMap = new Map<string, Project>();

  // 1. Populate map with local projects
  for (const p of localRaw) {
    projectMap.set(p.id, p);
  }

  // 2. Reconcile with cloud projects
  let newlyPushed = 0;
  for (const cp of cloudRes.projects) {
    const existing = projectMap.get(cp.id);
    if (!existing) {
      projectMap.set(cp.id, cp);
    } else {
      // Reconcile by comparing updatedAt timestamps (falling back to createdAt if updatedAt is non-ISO)
      const parseTime = (ts?: string, fallback?: string) => {
        const t = ts ? Date.parse(ts) : NaN;
        if (!Number.isNaN(t)) return t;
        const f = fallback ? Date.parse(fallback) : NaN;
        return Number.isNaN(f) ? 0 : f;
      };
      const localTime = parseTime(existing.updatedAt, existing.createdAt);
      const cloudTime = parseTime(cp.updatedAt, cp.createdAt);
      // Keep cloud if newer or equal
      if (cloudTime >= localTime) {
        projectMap.set(cp.id, {
          ...existing,
          ...cp,
          // Preserve local member display name if customized
          members: cp.members && cp.members.length > 0 ? cp.members : existing.members,
        });
      }
    }
  }

  // 3. For any local project that wasn't in cloud, push it to cloud in background
  const cloudIds = new Set(cloudRes.projects.map(p => p.id));
  for (const lp of localRaw) {
    if (!cloudIds.has(lp.id) && lp.id !== 'proj-starter') {
      pushProjectToCloud(lp).catch(() => { });
      newlyPushed++;
    }
  }

  const reconciledAll = Array.from(projectMap.values());
  saveProjects(reconciledAll);

  const finalFiltered = loadProjects(userEmail, userName);
  return {
    success: true,
    projects: finalFiltered,
    syncedCount: cloudRes.projects.length + newlyPushed,
  };
}