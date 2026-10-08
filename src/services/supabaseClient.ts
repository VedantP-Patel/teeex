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

  if (savedUrl && savedKey) {
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
