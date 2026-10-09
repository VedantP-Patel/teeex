import type { Project } from '../types/latex';
import { STARTER_TEMPLATES } from './templates';
import { getSupabaseClient } from './supabaseClient';

const PROJECTS_STORAGE_KEY = 'teeex_saved_projects';
const ACTIVE_PROJECT_ID_KEY = 'teeex_active_project_id';

const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-neural-quantum',
    title: 'Neural Quantum State Tomography',
    ownerId: 'usr-admin',
    ownerEmail: 'admin@teeex.io',
    role: 'owner',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: 'Just now',
    files: STARTER_TEMPLATES[0].files, // IEEE Paper
    tags: ['#quantum', '#ieee-trans', '#neural-networks'],
    members: [
      {
        id: 'usr-admin',
        email: 'admin@teeex.io',
        name: 'System Admin',
        avatar: 'SA',
        avatarColor: '#f43f5e',
        role: 'owner',
        joinedAt: '2026-10-01',
      },
      {
        id: 'usr-elena',
        email: 'elena.rostova@teeex.io',
        name: 'Dr. Elena Rostova',
        avatar: 'ER',
        avatarColor: '#38bdf8',
        role: 'editor',
        joinedAt: '2026-10-01',
      },
      {
        id: 'usr-marcus',
        email: 'm.vance@cambridge.ac.uk',
        name: 'Prof. Marcus Vance',
        avatar: 'MV',
        avatarColor: '#10b981',
        role: 'editor',
        joinedAt: '2026-10-02',
      },
      {
        id: 'usr-reviewer',
        email: 'reviewer.alpha@ieee-review.org',
        name: 'IEEE Reviewer Alpha',
        avatar: 'RA',
        avatarColor: '#f59e0b',
        role: 'viewer',
        joinedAt: '2026-10-05',
      },
    ],
    isArchived: false,
  },
  {
    id: 'proj-crdt-distributed',
    title: 'Real-Time CRDT State Synchronization in P2P LaTeX',
    ownerId: 'usr-admin',
    ownerEmail: 'admin@teeex.io',
    role: 'owner',
    createdAt: '2026-09-28T14:30:00Z',
    updatedAt: '2 hours ago',
    files: STARTER_TEMPLATES[1].files, // Academic CV / Report
    tags: ['#systems', '#crdt', '#acm-sigcomm'],
    members: [
      {
        id: 'usr-admin',
        email: 'admin@teeex.io',
        name: 'System Admin',
        avatar: 'SA',
        avatarColor: '#f43f5e',
        role: 'owner',
        joinedAt: '2026-09-28',
      },
      {
        id: 'usr-marcus',
        email: 'm.vance@cambridge.ac.uk',
        name: 'Prof. Marcus Vance',
        avatar: 'MV',
        avatarColor: '#10b981',
        role: 'editor',
        joinedAt: '2026-09-28',
      },
      {
        id: 'usr-elena',
        email: 'elena.rostova@teeex.io',
        name: 'Dr. Elena Rostova',
        avatar: 'ER',
        avatarColor: '#38bdf8',
        role: 'editor',
        joinedAt: '2026-09-29',
      },
    ],
    isArchived: false,
  },
  {
    id: 'proj-quantum-field-notes',
    title: 'Advanced Quantum Field Theory & Gauge Invariance',
    ownerId: 'usr-admin',
    ownerEmail: 'admin@teeex.io',
    role: 'owner',
    createdAt: '2026-09-15T09:15:00Z',
    updatedAt: '3 days ago',
    files: STARTER_TEMPLATES[2].files, // Slide / Presentation deck
    tags: ['#physics', '#cern', '#lecture-notes'],
    members: [
      {
        id: 'usr-admin',
        email: 'admin@teeex.io',
        name: 'System Admin',
        avatar: 'SA',
        avatarColor: '#f43f5e',
        role: 'owner',
        joinedAt: '2026-09-15',
      },
      {
        id: 'usr-cern',
        email: 'archivist@cern.ch',
        name: 'CERN Theory Division',
        avatar: 'CT',
        avatarColor: '#8b5cf6',
        role: 'editor',
        joinedAt: '2026-09-15',
      },
      {
        id: 'usr-elena',
        email: 'elena.rostova@teeex.io',
        name: 'Dr. Elena Rostova',
        avatar: 'ER',
        avatarColor: '#38bdf8',
        role: 'viewer',
        joinedAt: '2026-09-18',
      },
    ],
    isArchived: false,
  },
];

function normalizeProject(p: any): Project {
  return {
    id: p?.id || `proj-${Math.random().toString(36).slice(2, 7)}`,
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

export function loadProjects(userEmail?: string): Project[] {
  let allProjects: Project[] = [];
  const saved = localStorage.getItem(PROJECTS_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        allProjects = parsed.map(normalizeProject);
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

  if (userEmail) {
    const targetEmail = userEmail.toLowerCase();
    const filtered = allProjects.filter(p => 
      p.ownerEmail.toLowerCase() === targetEmail || 
      p.members?.some(m => m.email.toLowerCase() === targetEmail)
    );
    
    // If user has no projects, create a default one for them
    if (filtered.length === 0) {
      const defaultProj = createProject('My First Project', userEmail, userEmail.split('@')[0]);
      return [defaultProj];
    }
    
    return filtered;
  }

  return allProjects;
}

export function saveProjects(projects: Project[]): void {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
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
  const newId = `proj-${Date.now().toString(36)}`;

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

  const projects = loadProjects();
  const updated = [newProject, ...projects];
  saveProjects(updated);
  setActiveProjectId(newId);

  // Background sync if connected
  pushProjectToCloud(newProject).catch(() => {});

  return newProject;
}

export function duplicateProject(projectId: string): Project | null {
  const projects = loadProjects();
  const target = projects.find(p => p.id === projectId);
  if (!target) return null;

  const cloneId = `proj-${Date.now().toString(36)}`;
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
  pushProjectToCloud(cloned).catch(() => {});

  return cloned;
}

export function toggleArchiveProject(projectId: string): Project[] {
  const projects = loadProjects();
  const updated = projects.map(p =>
    p.id === projectId ? { ...p, isArchived: !p.isArchived } : p
  );
  saveProjects(updated);

  const target = updated.find(p => p.id === projectId);
  if (target) pushProjectToCloud(target).catch(() => {});

  return updated;
}

export function deleteProject(projectId: string): Project[] {
  const projects = loadProjects();
  const filtered = projects.filter(p => p.id !== projectId);
  saveProjects(filtered);

  // Background delete from Supabase if connected
  const supabase = getSupabaseClient();
  if (supabase) {
    (async () => {
      try {
        await supabase.from('projects').delete().eq('id', projectId);
      } catch {}
    })();
  }

  return filtered;
}

export function updateProject(
  projectId: string,
  patch: Partial<Project>
): Project[] {
  const projects = loadProjects();
  const updated = projects.map(p => {
    if (p.id === projectId) {
      return {
        ...p,
        ...patch,
        updatedAt: 'Just now',
      };
    }
    return p;
  });
  saveProjects(updated);

  const target = updated.find(p => p.id === projectId);
  if (target) pushProjectToCloud(target).catch(() => {});

  return updated;
}

// ==============================================================================
// SUPABASE DATABASE CLOUD SYNC HELPERS
// ==============================================================================

export function projectToRow(p: Project) {
  return {
    id: p.id,
    title: p.title,
    owner_id: p.ownerId,
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

  try {
    const row = projectToRow(project);
    const { error } = await supabase.from('projects').upsert(row, { onConflict: 'id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
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

    if (error) return { success: false, error: error.message };
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

  if ((supabase as any)?.supabaseUrl?.includes('demo-teeex-latex')) {
    return { success: true, syncedCount: localProjects.length };
  }

  try {
    const rows = localProjects.map(projectToRow);
    const { error } = await supabase.from('projects').upsert(rows, { onConflict: 'id' });
    if (error) return { success: false, syncedCount: 0, error: error.message };
    return { success: true, syncedCount: rows.length };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { success: false, syncedCount: 0, error: e?.message || 'Cloud sync failed' };
  }
}

