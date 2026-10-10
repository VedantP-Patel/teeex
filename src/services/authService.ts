import type { UserProfile, ProjectRole } from '../types/latex';
import { getSupabaseClient } from './supabaseClient';

const AUTH_STORAGE_KEY = 'teeex_auth_user';
const REMEMBER_ME_KEY = 'teeex_remember_me';
const LOCAL_REGISTERED_USERS_KEY = 'teeex_local_registered_users';

export function getLocalRegisteredUsers(): UserProfile[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_REGISTERED_USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveLocalRegisteredUser(user: UserProfile): void {
  const users = getLocalRegisteredUsers();
  users.push(user);
  localStorage.setItem(LOCAL_REGISTERED_USERS_KEY, JSON.stringify(users));
}

const APPROVED_EMAILS_KEY = 'teeex_approved_emails_cache';

export function getApprovedEmails(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(APPROVED_EMAILS_KEY) || '[]');
    return new Set(Array.isArray(list) ? list.map((e: string) => String(e).toLowerCase().trim()) : []);
  } catch {
    return new Set();
  }
}

export function markUserAsApproved(email: string): void {
  const normalized = email.toLowerCase().trim();
  const set = getApprovedEmails();
  set.add(normalized);
  try {
    localStorage.setItem(APPROVED_EMAILS_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn('Failed to save approved emails:', e);
  }
  approveLocalUser(normalized);
}

export function markUserAsRejected(email: string): void {
  const normalized = email.toLowerCase().trim();
  const set = getApprovedEmails();
  set.delete(normalized);
  try {
    localStorage.setItem(APPROVED_EMAILS_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn('Failed to save approved emails:', e);
  }
  rejectLocalUser(normalized);
}

export function isUserApproved(email: string): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const set = getApprovedEmails();
  if (set.has(normalized)) return true;
  const localUsers = getLocalRegisteredUsers();
  const found = localUsers.find(u => u.email.toLowerCase() === normalized);
  return found?.isApproved === true;
}

export function approveLocalUser(email: string): void {
  const users = getLocalRegisteredUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (user) {
    user.isApproved = true;
    localStorage.setItem(LOCAL_REGISTERED_USERS_KEY, JSON.stringify(users));
  }
}

export function rejectLocalUser(email: string): void {
  const users = getLocalRegisteredUsers();
  const updatedUsers = users.filter(u => u.email.toLowerCase() !== email.toLowerCase());
  localStorage.setItem(LOCAL_REGISTERED_USERS_KEY, JSON.stringify(updatedUsers));
}

export const DEMO_ACCOUNTS: Array<{
  profile: UserProfile;
  role: ProjectRole;
  label: string;
  password?: string;
}> = [
  {
    profile: {
      id: 'usr-admin',
      email: 'admin@teeex.io',
      fullName: 'System Admin',
      avatarColor: '#f43f5e',
      avatarUrl: '',
      isAnonymous: false,
      isAdmin: true,
      isApproved: true,
    },
    role: 'owner',
    label: 'Main Admin (admin@teeex.io)',
    password: 'admin', // Change this to set your admin password!
  },
  {
    profile: {
      id: 'usr-elena',
      email: 'elena.rostova@teeex.io',
      fullName: 'Dr. Elena Rostova',
      avatarColor: '#38bdf8',
      avatarUrl: '',
      isAnonymous: false,
    },
    role: 'owner',
    label: 'Host / Owner (Dr. Elena Rostova)',
  },
  {
    profile: {
      id: 'usr-marcus',
      email: 'm.vance@cambridge.ac.uk',
      fullName: 'Prof. Marcus Vance',
      avatarColor: '#10b981',
      avatarUrl: '',
      isAnonymous: false,
    },
    role: 'editor',
    label: 'Editor (Prof. Marcus Vance)',
  },
  {
    profile: {
      id: 'usr-reviewer',
      email: 'reviewer.alpha@ieee-review.org',
      fullName: 'IEEE Peer Reviewer #1',
      avatarColor: '#f59e0b',
      avatarUrl: '',
      isAnonymous: false,
    },
    role: 'viewer',
    label: 'Viewer (IEEE Peer Reviewer #1)',
  },
];

export function getStoredSession(): { user: UserProfile | null; rememberMe: boolean } {
  // Check localStorage first
  const localData = localStorage.getItem(AUTH_STORAGE_KEY);
  if (localData) {
    try {
      return { user: JSON.parse(localData), rememberMe: true };
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  // Check sessionStorage
  const sessionData = sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (sessionData) {
    try {
      return { user: JSON.parse(sessionData), rememberMe: false };
    } catch {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  // If user explicitly signed out, preserve signed-out guest state
  if (localStorage.getItem('teeex_signed_out') === 'true') {
    return { user: null, rememberMe: false };
  }

  // Default: Clean Guest session (no automatic demo account login)
  return { user: null, rememberMe: false };
}

export function saveSession(user: UserProfile, rememberMe: boolean): void {
  localStorage.removeItem('teeex_signed_out');
  const json = JSON.stringify(user);
  localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false');

  if (rememberMe) {
    localStorage.setItem(AUTH_STORAGE_KEY, json);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } else {
    sessionStorage.setItem(AUTH_STORAGE_KEY, json);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export function clearSession(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.setItem('teeex_signed_out', 'true');
}

export async function loginWithEmail(
  email: string,
  pass: string,
  rememberMe: boolean
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        // Fetch the profile to check approval status
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_approved, is_admin')
          .eq('id', data.user.id)
          .single();

        const userEmail = data.user.email || email;
        const isApproved = profile?.is_approved === true || isUserApproved(userEmail);
        const isAdmin = profile?.is_admin === true;

        if (!isApproved && !isAdmin) {
          await supabase.auth.signOut();
          return { success: false, error: 'Your account is pending admin approval.' };
        }

        const user: UserProfile = {
          id: data.user.id,
          email: data.user.email || email,
          fullName: data.user.user_metadata?.full_name || email.split('@')[0],
          avatarColor: '#38bdf8',
          isAnonymous: false,
          isAdmin,
          isApproved: true,
        };
        saveSession(user, rememberMe);
        return { success: true, user };
      }
    } catch (err: unknown) {
      console.warn('Supabase auth sign in error, falling back:', err);
    }
  }

  // Local-first fallback authentication
  const matchedDemo = DEMO_ACCOUNTS.find(
    d => d.profile.email.toLowerCase() === email.toLowerCase()
  );

  if (matchedDemo) {
    if (matchedDemo.password && pass !== matchedDemo.password) {
      return { success: false, error: 'Invalid admin credentials.' };
    }
    saveSession(matchedDemo.profile, rememberMe);
    return { success: true, user: matchedDemo.profile };
  }

  const registeredUser = getLocalRegisteredUsers().find(
    u => u.email.toLowerCase() === email.toLowerCase()
  );

  if (registeredUser) {
    if (!registeredUser.isApproved) {
      return { success: false, error: 'Your account is pending admin approval.' };
    }
    saveSession(registeredUser, rememberMe);
    return { success: true, user: registeredUser };
  }

  return { success: false, error: 'Invalid email or password.' };
}

export async function signUpWithEmail(
  email: string,
  pass: string,
  fullName: string,
  _rememberMe: boolean
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data: { 
            full_name: fullName,
            is_approved: false, // Requires manual approval in Supabase dashboard
            is_admin: false,
          },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        // Sign them out immediately since they are not approved
        await supabase.auth.signOut();
        return { success: false, error: 'Your account has been created and is pending admin approval.' };
      }
    } catch (err: unknown) {
      console.warn('Supabase auth sign up error, falling back:', err);
    }
  }

  // Local-first fallback registration
  const existing = getLocalRegisteredUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return { success: false, error: 'User already exists. Please sign in.' };
  }

  const user: UserProfile = {
    id: `usr-${Date.now().toString(36)}`,
    email,
    fullName: fullName || email.split('@')[0],
    avatarColor: '#8b5cf6',
    isAnonymous: false,
    isApproved: false, // Requires admin approval
  };

  saveLocalRegisteredUser(user);
  return { success: false, error: 'Your account has been created and is pending admin approval.' };
}

export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });

      if (error) {
        return { success: false, message: '', error: error.message };
      }

      return {
        success: true,
        message: `Password reset instructions sent to ${email}. Please check your inbox.`,
      };
    } catch (err: unknown) {
      console.warn('Supabase password reset error, falling back:', err);
    }
  }

  // Local mock response
  return {
    success: true,
    message: `Password reset instructions dispatched to ${email}. If an account exists, a secure reset link will arrive shortly.`,
  };
}

export async function signOutUser(): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Supabase signOut error:', e);
    }
  }
  clearSession();
}

// Expose mock admin functions for easy testing via browser console
if (typeof window !== 'undefined') {
  (window as any).approveUser = approveLocalUser;
  (window as any).listPendingUsers = () => getLocalRegisteredUsers().filter(u => !u.isApproved);
}
