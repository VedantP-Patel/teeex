/**
 * Teeex — authentication and local profiles.
 *
 * WHAT CHANGED AND WHY
 *
 * This module previously granted privileges from values the user controls:
 *
 *  - `isUserApproved()` read a `teeex_approved_emails_cache` list out of
 *    localStorage and was OR-ed into the server's approval check, so writing one
 *    key in devtools satisfied the approval gate.
 *  - `DEMO_ACCOUNTS` shipped `admin@teeex.io` with the password `admin` and
 *    `isAdmin: true`, plus three accounts with no password at all, surfaced as
 *    one-click "Quick demo login" buttons.
 *  - The stored session carried `isAdmin`/`isApproved` and was "protected" by a
 *    SHA-256 signature whose salt sits in the same bundle, so it was forgeable —
 *    while the code logged "Tampered auth session signature detected" as though
 *    it were a control.
 *
 * Now: privileges are server facts or they do not exist. The stored session
 * holds identity only — never `isAdmin` or `isApproved` — so a tampered blob
 * cannot escalate anything; the worst it can do is change a display name.
 * `is_admin` is resolved from `profiles` per session and kept in memory.
 *
 * There are two modes, and the UI says which one is active:
 *
 *  - **cloud** — Supabase is configured. Real authentication, approval from
 *    `profiles.is_approved`, admin from `profiles.is_admin`. Approval is granted
 *    by an operator in the Supabase dashboard or through the `approve_profile`
 *    RPC, which checks the caller is an admin.
 *  - **local** — no Supabase credentials. There is nothing to authenticate
 *    against, so the app does not pretend: the user names a local workspace and
 *    documents stay in this browser. No password, no approval, no admin.
 */

import type { UserProfile } from '../types/latex';
import { getSupabaseClient, isSupabaseConnected } from './supabaseClient';
import { sha256Sync } from './shareSecurityService';

const AUTH_STORAGE_KEY = 'teeex_auth_user';
const REMEMBER_ME_KEY = 'teeex_remember_me';
const SIGNED_OUT_KEY = 'teeex_signed_out';

/**
 * Integrity checksum, not a security control: it catches a half-written or
 * stale record from an older schema so the app starts clean instead of
 * crashing on a malformed profile. Any value a client can recompute cannot
 * authenticate anything, which is why nothing security-relevant is stored
 * here in the first place.
 */
const SESSION_CHECKSUM_KEY = 'teeex-session-v4';

export type AuthMode = 'cloud' | 'local';

export function getAuthMode(): AuthMode {
  return isSupabaseConnected() ? 'cloud' : 'local';
}

/** Fields that are safe to persist: identity and presentation only. */
interface StoredIdentity {
  id: string;
  email: string;
  fullName: string;
  avatarColor?: string;
  avatarUrl?: string;
  authProvider: 'supabase' | 'local';
}

interface StoredSessionWrapper {
  user: StoredIdentity;
  issuedAt: number;
  sum: string;
}

function checksum(identity: StoredIdentity, issuedAt: number): string {
  return sha256Sync(
    `${SESSION_CHECKSUM_KEY}:${identity.id}:${identity.email}:${identity.authProvider}:${issuedAt}`,
  );
}

function toStoredIdentity(user: UserProfile): StoredIdentity {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarColor: user.avatarColor,
    avatarUrl: user.avatarUrl,
    authProvider: user.authProvider === 'supabase' ? 'supabase' : 'local',
  };
}

/**
 * Admin status for the current session, held in memory only. Resolved from
 * `profiles.is_admin` on sign-in and on session verification; never read from
 * or written to storage.
 */
let sessionIsAdmin = false;

export function isSessionAdmin(): boolean {
  return sessionIsAdmin;
}

function toUserProfile(identity: StoredIdentity): UserProfile {
  return {
    id: identity.id,
    email: identity.email,
    fullName: identity.fullName,
    avatarColor: identity.avatarColor,
    avatarUrl: identity.avatarUrl,
    isAnonymous: false,
    // Local workspaces have no privilege model at all; cloud sessions get their
    // real value from verifyActiveSupabaseSession().
    isAdmin: false,
    isApproved: identity.authProvider === 'local' ? true : false,
    authProvider: identity.authProvider,
  };
}

export function isLocalProfile(user: UserProfile | null): boolean {
  return Boolean(user) && user!.authProvider !== 'supabase';
}

export function getStoredSession(): { user: UserProfile | null; rememberMe: boolean } {
  if (localStorage.getItem(SIGNED_OUT_KEY) === 'true') {
    return { user: null, rememberMe: false };
  }

  const read = (raw: string | null): UserProfile | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredSessionWrapper;
      if (
        !parsed?.user?.id ||
        typeof parsed.issuedAt !== 'number' ||
        typeof parsed.sum !== 'string'
      ) {
        return null;
      }
      if (parsed.sum !== checksum(parsed.user, parsed.issuedAt)) return null;
      return toUserProfile(parsed.user);
    } catch {
      return null;
    }
  };

  const remembered = read(localStorage.getItem(AUTH_STORAGE_KEY));
  if (remembered) return { user: remembered, rememberMe: true };
  if (localStorage.getItem(AUTH_STORAGE_KEY)) localStorage.removeItem(AUTH_STORAGE_KEY);

  const perSession = read(sessionStorage.getItem(AUTH_STORAGE_KEY));
  if (perSession) return { user: perSession, rememberMe: false };
  if (sessionStorage.getItem(AUTH_STORAGE_KEY)) sessionStorage.removeItem(AUTH_STORAGE_KEY);

  return { user: null, rememberMe: false };
}

export function saveSession(user: UserProfile, rememberMe: boolean): void {
  localStorage.removeItem(SIGNED_OUT_KEY);

  const identity = toStoredIdentity(user);
  const issuedAt = Date.now();
  const json = JSON.stringify({
    user: identity,
    issuedAt,
    sum: checksum(identity, issuedAt),
  } satisfies StoredSessionWrapper);

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
  sessionIsAdmin = false;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.setItem(SIGNED_OUT_KEY, 'true');
}

// ---------------------------------------------------------------- local mode --

const LOCAL_PROFILE_KEY = 'teeex_local_profile';

/**
 * Creates or reuses this browser's local workspace profile. Deliberately not
 * authentication: there is no server, so there is nothing to prove. The id is
 * random and stable per browser so project ownership strings stay consistent.
 */
export function startLocalWorkspace(
  displayName: string,
  rememberMe = true,
): { success: true; user: UserProfile } {
  let id: string;
  try {
    id = localStorage.getItem(LOCAL_PROFILE_KEY) || '';
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `local-${crypto.randomUUID()}`
          : `local-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(LOCAL_PROFILE_KEY, id);
    }
  } catch {
    id = `local-${Date.now().toString(36)}`;
  }

  const name = displayName.trim() || 'Local workspace';
  const user: UserProfile = {
    id,
    // Not an address anyone can reach; it exists because Project rows key the
    // owner and member list on an email-shaped string.
    email: `${id}@local.invalid`,
    fullName: name,
    avatarColor: '#38bdf8',
    isAnonymous: false,
    isAdmin: false,
    isApproved: true,
    authProvider: 'local',
  };

  sessionIsAdmin = false;
  saveSession(user, rememberMe);
  return { success: true, user };
}

// ---------------------------------------------------------------- cloud mode --

async function resolveCloudProfile(
  userId: string,
  email: string,
  metadataName: string | undefined,
): Promise<{ user: UserProfile; isApproved: boolean; isAdmin: boolean } | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_approved, is_admin, full_name, avatar_color')
    .eq('id', userId)
    .maybeSingle();

  // Approval and admin come from the server row and nowhere else. A missing row
  // means not approved — fail closed.
  const isApproved = profile?.is_approved === true;
  const isAdmin = profile?.is_admin === true;

  return {
    user: {
      id: userId,
      email,
      fullName: profile?.full_name || metadataName || email.split('@')[0],
      avatarColor: profile?.avatar_color || '#38bdf8',
      isAnonymous: false,
      isAdmin,
      isApproved,
      authProvider: 'supabase',
    },
    isApproved,
    isAdmin,
  };
}

export async function loginWithEmail(
  email: string,
  pass: string,
  rememberMe: boolean,
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      success: false,
      error:
        'This deployment has no cloud account service configured. Use the local workspace instead — documents stay in this browser.',
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return { success: false, error: error.message };
    if (!data.user) return { success: false, error: 'Sign-in failed.' };

    const resolved = await resolveCloudProfile(
      data.user.id,
      data.user.email || email,
      data.user.user_metadata?.full_name,
    );

    // An admin still has to be approved; there is no longer a path where
    // is_admin alone opens the door.
    if (!resolved || !resolved.isApproved) {
      await supabase.auth.signOut();
      return { success: false, error: 'Your account is pending administrator approval.' };
    }

    sessionIsAdmin = resolved.isAdmin;
    saveSession(resolved.user, rememberMe);
    return { success: true, user: resolved.user };
  } catch (cause) {
    // Never fall back to a local privilege grant on a cloud error: a network
    // blip must not become an authentication bypass.
    return {
      success: false,
      error: cause instanceof Error ? cause.message : 'Could not reach the account service.',
    };
  }
}

export async function signUpWithEmail(
  email: string,
  pass: string,
  fullName: string,
  _rememberMe: boolean,
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      success: false,
      error:
        'This deployment has no cloud account service configured. Use the local workspace instead — documents stay in this browser.',
    };
  }

  try {
    // Only full_name is sent. is_approved/is_admin used to be passed here and
    // read by the handle_new_user trigger, which meant a direct call to the auth
    // endpoint could request an approved administrator account at signup. The
    // trigger now hardcodes both to false and ignores client metadata.
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: { data: { full_name: fullName } },
    });

    if (error) return { success: false, error: error.message };

    if (data.user) await supabase.auth.signOut();
    return {
      success: false,
      error: 'Your account has been created and is pending administrator approval.',
    };
  } catch (cause) {
    return {
      success: false,
      error: cause instanceof Error ? cause.message : 'Could not reach the account service.',
    };
  }
}

export async function requestPasswordReset(
  email: string,
): Promise<{ success: boolean; message: string; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      success: false,
      message: '',
      error: 'This deployment has no cloud account service configured.',
    };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) return { success: false, message: '', error: error.message };
    return {
      success: true,
      // Deliberately does not confirm whether the address is registered.
      message: `If an account exists for ${email}, reset instructions are on their way.`,
    };
  } catch (cause) {
    return {
      success: false,
      message: '',
      error: cause instanceof Error ? cause.message : 'Could not reach the account service.',
    };
  }
}

export async function signOutUser(): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (cause) {
      console.warn('Supabase sign-out failed; clearing the local session anyway.', cause);
    }
  }
  clearSession();
}

/**
 * Re-resolves the signed-in user against the server on startup.
 *
 * A local workspace profile is returned as-is — there is no server to check it
 * against. A cloud session is re-read from `profiles` every time, so revoking
 * approval or admin takes effect on the user's next load rather than whenever
 * their cached blob happens to expire.
 */
export async function verifyActiveSupabaseSession(): Promise<UserProfile | null> {
  const stored = getStoredSession();

  if (stored.user && isLocalProfile(stored.user)) {
    sessionIsAdmin = false;
    return stored.user;
  }

  const supabase = getSupabaseClient();
  if (!supabase) return stored.user;

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.user) {
      if (stored.user?.authProvider === 'supabase') {
        clearSession();
        return null;
      }
      return stored.user;
    }

    const resolved = await resolveCloudProfile(
      session.user.id,
      session.user.email || '',
      session.user.user_metadata?.full_name,
    );

    if (!resolved || !resolved.isApproved) {
      await supabase.auth.signOut();
      clearSession();
      return null;
    }

    sessionIsAdmin = resolved.isAdmin;
    saveSession(resolved.user, localStorage.getItem(REMEMBER_ME_KEY) !== 'false');
    return resolved.user;
  } catch (cause) {
    // Offline: keep the stored identity so the editor stays usable, but do not
    // grant admin on an unverified session.
    console.warn('Could not verify the cloud session; continuing with stored identity.', cause);
    sessionIsAdmin = false;
    return stored.user;
  }
}
