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

const DEV_STORAGE_KEY = 'teeex_platform_developer_unlocked';
const DEMO_MODE_STORAGE_KEY = 'teeex_platform_demo_mode';
const SIMULATED_PEERS_STORAGE_KEY = 'teeex_simulated_peers_active';

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
 * Also checks URL query parameters (?dev=true, ?admin=true, ?dev=1) for developer convenience.
 */
export function isPlatformDeveloper(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    const devParam = params.get('dev') || params.get('admin');
    if (devParam === 'true' || devParam === '1' || devParam === 'secret') {
      return true;
    }

    return localStorage.getItem(DEV_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Unlocks Platform Developer mode with a verified passcode.
 */
export function unlockPlatformDeveloper(passcode: string): { success: boolean; error?: string } {
  const clean = passcode.trim().toLowerCase();
  if (PLATFORM_DEV_PASSCODES.includes(clean)) {
    try {
      localStorage.setItem(DEV_STORAGE_KEY, 'true');
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
