import { expect, type Locator, type Page } from '@playwright/test';
import { sha256Sync } from '../../src/services/shareSecurityService';

/**
 * Shared end-to-end helpers.
 *
 * WHY THIS FILE EXISTS
 *
 * Every spec used to seed its own session and drive the editor with its own
 * copy of the same code. When the stored-session format was hardened — the blob
 * is now `{ user, issuedAt, sum }` rather than a bare profile, so that a
 * tampered record cannot carry privileges — all four copies broke at once, in
 * four different files, and every spec failed on the sign-in screen. One copy
 * means one place to change.
 *
 * The session format here must match `saveSession()` in
 * src/services/authService.ts. If you change the checksum input there, change
 * `sessionChecksum` here; a mismatch shows up immediately as specs stuck on the
 * sign-in screen.
 */

/** Matches SESSION_CHECKSUM_KEY in src/services/authService.ts. */
const SESSION_CHECKSUM_KEY = 'teeex-session-v4';
const AUTH_STORAGE_KEY = 'teeex_auth_user';
const SIGNED_OUT_KEY = 'teeex_signed_out';

export interface SeededProfile {
  id: string;
  email: string;
  fullName?: string;
  /**
   * 'local' is the default because it is the only mode that needs no server:
   * `getStoredSession()` treats a local profile as approved, and
   * `verifyActiveSupabaseSession()` returns it untouched. A 'supabase' profile
   * is re-checked against the server on startup and would be signed out here,
   * since tests configure no Supabase credentials.
   */
  authProvider?: 'local' | 'supabase';
}

function sessionChecksum(
  identity: { id: string; email: string; authProvider: string },
  issuedAt: number,
): string {
  return sha256Sync(
    `${SESSION_CHECKSUM_KEY}:${identity.id}:${identity.email}:${identity.authProvider}:${issuedAt}`,
  );
}

interface SeededSession {
  user: { id: string; email: string; fullName: string; authProvider: string };
  issuedAt: number;
  sum: string;
}

/** Builds the exact wrapper `saveSession()` writes. */
export function buildSession(profile: SeededProfile): SeededSession {
  const identity = {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName ?? 'Playwright',
    avatarColor: '#38bdf8',
    avatarUrl: '',
    authProvider: profile.authProvider ?? 'local',
  };
  const issuedAt = Date.now();
  return { user: identity, issuedAt, sum: sessionChecksum(identity, issuedAt) };
}

/**
 * Seeds a signed-in session before the app boots.
 *
 * `addInitScript` runs in the page before any app code, so the first render
 * already sees the session and never flashes the sign-in screen.
 */
export async function seedSession(page: Page, profile: SeededProfile): Promise<void> {
  const session = buildSession(profile);
  await page.addInitScript(
    ([key, signedOutKey, payload]) => {
      localStorage.setItem(key, payload);
      localStorage.removeItem(signedOutKey);
    },
    [AUTH_STORAGE_KEY, SIGNED_OUT_KEY, JSON.stringify(session)] as const,
  );
}

/** Seeds a session and loads the app, leaving the editor mounted. */
export async function openWorkspace(page: Page, profile: SeededProfile): Promise<void> {
  await seedSession(page, profile);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Replaces the whole document in the CodeMirror editor.
 *
 * `fill()` does not work on CodeMirror — it is a contenteditable, not an input.
 * This dispatches a synthetic paste, which is the path CodeMirror's own paste
 * handling takes, and falls back to a direct transaction if the synthetic event
 * is not picked up (DataTransfer on a constructed ClipboardEvent is not
 * universally honoured).
 */
export async function setEditorContent(page: Page, source: string): Promise<void> {
  const editor = page.locator('.cm-content').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');

  await editor.evaluate((el, text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    el.dispatchEvent(pasteEvent);

    if (!pasteEvent.defaultPrevented) {
      const anyEl = el as unknown as {
        cmView?: { view?: { state: { doc: { length: number } }; dispatch: (tr: unknown) => void } };
      };
      const rootEl = el.closest('.cm-editor') as unknown as typeof anyEl | null;
      const view = anyEl.cmView?.view ?? rootEl?.cmView?.view;
      view?.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        userEvent: 'input.paste',
      });
    }
  }, source);
}

/** The compiled-document pane, as exposed by its ARIA role. */
export function previewPane(page: Page): Locator {
  return page.getByRole('document', { name: 'Compiled document preview' });
}

/** The first page canvas inside the preview pane. */
export function firstPreviewCanvas(page: Page): Locator {
  return previewPane(page).locator('canvas').first();
}

/** The "typesetting in progress" status pill. */
export function compilingStatus(page: Page): Locator {
  return page.locator('.pdf-status-busy');
}

/**
 * Sets the document and waits until a rendered page appears.
 *
 * The generous timeout is deliberate: the first compile in a fresh browser has
 * to fetch and instantiate the TeX engine, which is tens of megabytes. Later
 * compiles reuse the warm engine and are far quicker.
 */
export async function compileAndWaitForPreview(
  page: Page,
  source: string,
  timeoutMs = 240_000,
): Promise<Locator> {
  await setEditorContent(page, source);
  const canvas = firstPreviewCanvas(page);
  await expect(canvas).toBeVisible({ timeout: timeoutMs });
  return canvas;
}

/** Reads the bytes of the PDF produced by the Download button. */
export async function downloadedPdfBytes(page: Page): Promise<Uint8Array> {
  const button = page.locator('button[title="Download the compiled PDF"]');
  await expect(button).toBeEnabled({ timeout: 30_000 });

  const download = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    button.click(),
  ]).then(([d]) => d);

  const path = await download.path();
  expect(path, 'Playwright should provide a downloaded file path').toBeTruthy();

  const fs = await import('node:fs/promises');
  return new Uint8Array(await fs.readFile(path!));
}

/**
 * Opens the compiled PDF with pdf.js and extracts its per-page text.
 *
 * Text extraction is the check that matters: it proves the artifact contains
 * selectable, positioned text from real typesetting rather than a raster image
 * or a placeholder.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<{
  numPages: number;
  perPage: string[];
  all: string;
}> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;

  const perPage: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const pdfPage = await pdf.getPage(pageNumber);
    const content = await pdfPage.getTextContent();
    perPage.push(
      content.items
        .filter((item) => 'str' in item)
        .map((item) => (item as { str: string }).str)
        .join(''),
    );
  }

  return { numPages: pdf.numPages, perPage, all: perPage.join('\n') };
}
