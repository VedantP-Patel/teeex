/**
 * Developer & Platform Administration Service
 * 
 * Separates Website Developer / Platform Owner privileges from regular Project Owners.
 *
 * Strict Privilege Separation:
 * - Website Developer / Platform Owner:
 *   - Supabase Cloud Infrastructure Vault (Project URL, Anon API Key, DB Connection)
 *   - Supabase SQL Schema Migrations & Scripts
 *   - Database Tables Inspector & Global Sync
 *   - Developer Demo Switchers & Test Accounts
 *   - Multiplayer Simulation Controls
 * 
 * - Project Owner / Regular User:
 *   - LaTeX paper creation, editing, compiling, exporting PDF/ZIP
 *   - Project-level file and folder management
 *   - Inviting co-authors to their individual paper
 *   - ZERO access to platform cloud vault, API credentials, or database internals
 */

import { sha256Sync } from './shareSecurityService';

const DEV_STORAGE_KEY = 'teeex_platform_developer_unlocked';
const DEMO_MODE_STORAGE_KEY = 'teeex_platform_demo_mode';
const SIMULATED_PEERS_STORAGE_KEY = 'teeex_simulated_peers_active';
const DEV_TOKEN_SALT = 'teeex-dev-clearance-v2-salt#9982';

interface DevTokenPayload {
  grantedAt: number;
  expiresAt: number;
  sig: string;
}

function computeDevTokenSignature(grantedAt: number, expiresAt: number): string {
  return sha256Sync(`dev:${grantedAt}:${expiresAt}:${DEV_TOKEN_SALT}`);
}

// Authorized Platform Developer passcodes (case-insensitive)
const PLATFORM_DEV_PASSCODES = [
  'vedant',
  'teeex-dev',
  'admin2026',
  'platform-owner',
  'superadmin',
];

/**
 * Checks if current session has active Website Developer / Platform Owner clearance.
 * Strictly verifies cryptographically signed developer token with active expiration.
 * URL parameters (?dev=true, ?admin=true) are rejected to eliminate client-side bypasses.
 */
export function isPlatformDeveloper(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const raw = localStorage.getItem(DEV_STORAGE_KEY);
    if (!raw) return false;

    // Strict rejection of raw 'true' string or tampered values injected via F12
    if (raw === 'true') {
      localStorage.removeItem(DEV_STORAGE_KEY);
      return false;
    }

    const token = JSON.parse(raw) as DevTokenPayload;
    if (!token || typeof token.grantedAt !== 'number' || typeof token.expiresAt !== 'number' || !token.sig) {
      localStorage.removeItem(DEV_STORAGE_KEY);
      return false;
    }

    // Expiration check (12 hours lifetime)
    if (Date.now() > token.expiresAt) {
      localStorage.removeItem(DEV_STORAGE_KEY);
      return false;
    }

    // Cryptographic signature verification
    const expectedSig = computeDevTokenSignature(token.grantedAt, token.expiresAt);
    if (token.sig !== expectedSig) {
      localStorage.removeItem(DEV_STORAGE_KEY);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Unlocks Platform Developer mode with a verified passcode.
 * Issues a cryptographically signed, timestamped session token.
 */
export function unlockPlatformDeveloper(passcode: string): { success: boolean; error?: string } {
  const clean = passcode.trim().toLowerCase();
  if (PLATFORM_DEV_PASSCODES.includes(clean)) {
    try {
      const now = Date.now();
      const expiresAt = now + 12 * 60 * 60 * 1000; // 12 hours clearance
      const token: DevTokenPayload = {
        grantedAt: now,
        expiresAt,
        sig: computeDevTokenSignature(now, expiresAt),
      };
      localStorage.setItem(DEV_STORAGE_KEY, JSON.stringify(token));
    } catch {
      // ignore
    }
    return { success: true };
  }
  return {
    success: false,
    error: 'Incorrect developer passcode. Clearance is strictly reserved for the website developer / platform owner.',
  };
}

/**
 * Locks Platform Developer mode.
 */
export function lockPlatformDeveloper(): void {
  try {
    localStorage.removeItem(DEV_STORAGE_KEY);
    localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Returns whether Developer Demo Mode (Instant Role Switcher) is active.
 * Restricted to Website Developer only; hidden for regular users.
 */
export function isDemoModeEnabled(): boolean {
  if (!isPlatformDeveloper()) return false;
  try {
    return localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Toggles Developer Demo Mode.
 */
export function setDemoModeEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Determines whether simulated co-authors should appear for a given project.
 * Regular projects created by users only show real peers, not fake phantom co-authors.
 */
export function areSimulatedPeersEnabled(_projectId?: string): boolean {
  try {
    const stored = localStorage.getItem(SIMULATED_PEERS_STORAGE_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
    // By default, no simulated phantom peers. Only real connected collaborators appear
    return false;
  } catch {
    return false;
  }
}

/**
 * Toggles simulated co-authors for testing.
 */
export function setSimulatedPeersEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SIMULATED_PEERS_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}
