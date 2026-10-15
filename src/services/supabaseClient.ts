import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ProjectFile } from '../types/latex';

export interface CloudProject {
  id: string;
  title: string;
  files: ProjectFile[];
  updatedAt: string;
}

/**
 * Credentials come from build-time environment only.
 *
 * There used to be a hardcoded project URL and anon key here as a fallback "so
 * the live site is always connected", and a localStorage override that let any
 * visitor repoint the client at an arbitrary project through a UI gated by a
 * passcode list shipped in the same bundle. An anon key is publishable, so
 * shipping one is not itself the defect — but it is only safe behind correct
 * row-level security, and the schema granted `using (true)` on every table. A
 * baked-in default also means a misconfigured deployment silently writes user
 * documents into someone else's database instead of failing loudly.
 *
 * Both are gone. No credentials, no cloud: the app runs local-first and says so.
 */
function readEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

let supabaseInstance: SupabaseClient | null = null;
let resolved = false;

export function getSupabaseClient(): SupabaseClient | null {
  if (resolved) return supabaseInstance;
  resolved = true;

  const url = readEnv('VITE_SUPABASE_URL');
  const anonKey = readEnv('VITE_SUPABASE_ANON_KEY');

  // A placeholder copied out of .env.example is a misconfiguration, not a
  // credential; treat it as absent rather than letting createClient fail later.
  if (!url || !anonKey || url.includes('your-project-id') || anonKey.includes('your-anon-public-key')) {
    return null;
  }

  try {
    supabaseInstance = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } catch (cause) {
    console.warn('Supabase client could not be created; running local-only.', cause);
    supabaseInstance = null;
  }

  return supabaseInstance;
}

export function isSupabaseConnected(): boolean {
  return getSupabaseClient() !== null;
}

/** The authenticated user's id, or null when signed out or running local-only. */
export async function getAuthUid(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}
