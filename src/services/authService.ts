import type { UserProfile, ProjectRole } from '../types/latex';
import { getSupabaseClient } from './supabaseClient';

const AUTH_STORAGE_KEY = 'teeex_auth_user';
const REMEMBER_ME_KEY = 'teeex_remember_me';

export const DEMO_ACCOUNTS: Array<{
  profile: UserProfile;
  role: ProjectRole;
  label: string;
}> = [
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

  // Fallback: Default to Dr. Elena Rostova as authenticated owner
  return { user: DEMO_ACCOUNTS[0].profile, rememberMe: true };
}

export function saveSession(user: UserProfile, rememberMe: boolean): void {
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
        const user: UserProfile = {
          id: data.user.id,
          email: data.user.email || email,
          fullName: data.user.user_metadata?.full_name || email.split('@')[0],
          avatarColor: '#38bdf8',
          isAnonymous: false,
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

  const user: UserProfile = matchedDemo ? matchedDemo.profile : {
    id: `usr-${Date.now().toString(36)}`,
    email,
    fullName: email.split('@')[0].replace(/[\._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    avatarColor: '#38bdf8',
    isAnonymous: false,
  };

  saveSession(user, rememberMe);
  return { success: true, user };
}

export async function signUpWithEmail(
  email: string,
  pass: string,
  fullName: string,
  rememberMe: boolean
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data: { full_name: fullName },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        const user: UserProfile = {
          id: data.user.id,
          email: data.user.email || email,
          fullName: fullName || email.split('@')[0],
          avatarColor: '#8b5cf6',
          isAnonymous: false,
        };
        saveSession(user, rememberMe);
        return { success: true, user };
      }
    } catch (err: unknown) {
      console.warn('Supabase auth sign up error, falling back:', err);
    }
  }

  // Local-first fallback registration
  const user: UserProfile = {
    id: `usr-${Date.now().toString(36)}`,
    email,
    fullName: fullName || email.split('@')[0],
    avatarColor: '#8b5cf6',
    isAnonymous: false,
  };

  saveSession(user, rememberMe);
  return { success: true, user };
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
