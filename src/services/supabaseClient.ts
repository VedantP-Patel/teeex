import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ProjectFile } from '../types/latex';

export interface CloudProject {
  id: string;
  title: string;
  files: ProjectFile[];
  updatedAt: string;
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  const savedUrl = localStorage.getItem('teeex_supabase_url') || envUrl;
  const savedKey = localStorage.getItem('teeex_supabase_anon_key') || envKey;

  if (savedUrl && savedKey && !savedUrl.includes('your-project-id')) {
    try {
      supabaseInstance = createClient(savedUrl, savedKey);
      return supabaseInstance;
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
    }
  }

  return null;
}

export function configureSupabase(url: string, anonKey: string): boolean {
  try {
    supabaseInstance = createClient(url, anonKey);
    localStorage.setItem('teeex_supabase_url', url);
    localStorage.setItem('teeex_supabase_anon_key', anonKey);
    return true;
  } catch (e) {
    console.error('Invalid Supabase configuration:', e);
    return false;
  }
}

export function isSupabaseConnected(): boolean {
  return getSupabaseClient() !== null;
}

export function disconnectSupabase(): void {
  supabaseInstance = null;
  localStorage.removeItem('teeex_supabase_url');
  localStorage.removeItem('teeex_supabase_anon_key');
}

export async function testSupabaseConnection(url?: string, anonKey?: string): Promise<{ success: boolean; message: string }> {
  let client = getSupabaseClient();
  if (url?.includes('demo-teeex-latex') || (client as any)?.supabaseUrl?.includes('demo-teeex-latex')) {
    return { success: true, message: 'Demo Sandbox verified! Local simulated storage active.' };
  }

  if (url && anonKey) {
    try {
      client = createClient(url, anonKey);
    } catch (e: unknown) {
      const err = e as { message?: string };
      return { success: false, message: err?.message || 'Invalid URL or Key format' };
    }
  }

  if (!client) {
    return { success: false, message: 'No Supabase credentials configured' };
  }

  try {
    const { error } = await client.from('projects').select('id').limit(1);
    if (error) {
      // Postgres error 42P01 = table does not exist yet
      if (error.code === '42P01') {
        return {
          success: true,
          message: 'Connected to Supabase! (Note: Please run the SQL schema in Tab 2 to initialize tables)',
        };
      }
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Connection verified! PostgreSQL is online and responsive.' };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { success: false, message: e?.message || 'Network error connecting to Supabase' };
  }
}

