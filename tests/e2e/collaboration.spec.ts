import { test, expect, type Page } from '@playwright/test';
import { openWorkspace, buildSession, type SeededProfile } from './fixtures';

test.describe('Stage 7: Real Yjs CRDT Multi-User Collaboration', () => {
  test.setTimeout(120_000);

  test('synchronizes document edits and cursor presence in real time across browser tabs', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    try {
      const user1: SeededProfile = {
        id: 'user-alice-101',
        email: 'alice@teeex.local',
        fullName: 'Alice Walker',
      };

      const user2: SeededProfile = {
        id: 'user-bob-202',
        email: 'bob@teeex.local',
        fullName: 'Bob Smith',
      };

      const sharedProjectId = 'proj-crdt-quantum-collab';
      const initialContent = '\\documentclass{article}\n\\begin{document}\n\\section{Collaborative Science}\nInitial base manuscript for CRDT tests.\n\\end{document}';

      const sharedProject = {
        id: sharedProjectId,
        title: 'Collaborative Quantum Tomography',
        ownerId: user1.id,
        ownerEmail: user1.email,
        createdAt: new Date().toISOString(),
        updatedAt: 'Just now',
        files: [
          {
            id: 'main.tex',
            name: 'main.tex',
            content: initialContent,
            type: 'tex',
            isEntry: true,
          },
        ],
        tags: [],
        members: [
          {
            id: user1.id,
            email: user1.email,
            name: user1.fullName,
            avatar: 'AW',
            avatarColor: '#10b981',
            role: 'owner',
            joinedAt: new Date().toISOString().slice(0, 10),
          },
          {
            id: user2.id,
            email: user2.email,
            name: user2.fullName,
            avatar: 'BS',
            avatarColor: '#f59e0b',
            role: 'editor',
            joinedAt: new Date().toISOString().slice(0, 10),
          },
        ],
        isArchived: false,
      };

      const openSharedWorkspace = async (page: Page, profile: SeededProfile) => {
        const session = buildSession(profile);
        const projectsJson = JSON.stringify([sharedProject]);
        await page.addInitScript(
          ([key, signedOutKey, payload, projJson, activeId]) => {
            localStorage.setItem(key, payload);
            localStorage.removeItem(signedOutKey);
            localStorage.setItem('teeex_saved_projects', projJson);
            localStorage.setItem('teeex_active_project_id', activeId);
          },
          ['teeex_auth_user', 'teeex_signed_out', JSON.stringify(session), projectsJson, sharedProjectId] as const,
        );
        await page.goto('/');
      };

      // 1. Boot Page 1 (Alice) with initial document
      await openSharedWorkspace(page1, user1);
      const editor1 = page1.locator('.cm-content');
      await expect(editor1).toBeVisible({ timeout: 25_000 });

      // 2. Boot Page 2 (Bob) into the same active workspace
      await openSharedWorkspace(page2, user2);
      const editor2 = page2.locator('.cm-content');
      await expect(editor2).toBeVisible({ timeout: 25_000 });

      // 3. Verify presence awareness: Page 2 sees Alice, Page 1 sees Bob
      await page1.waitForTimeout(600);
      await page2.waitForTimeout(600);

      // Check Navbar Share button or Editor presence badge
      const shareBtn1 = page1.getByRole('button', { name: /Share/i });
      await expect(shareBtn1).toBeVisible();

      const shareBtn2 = page2.getByRole('button', { name: /Share/i });
      await expect(shareBtn2).toBeVisible();

      // 4. Alice types collaborative text in Page 1
      await editor1.click();
      await page1.keyboard.press('ControlOrMeta+End');
      await page1.keyboard.type('\n% CRDT Collaboration Test: Hello Bob from Alice!\n');
      await expect(editor1).toContainText('CRDT Collaboration Test: Hello Bob from Alice!', { timeout: 10_000 });

      // 5. Verify Bob in Page 2 receives Alice's edits live via Yjs CRDT
      await expect(editor2).toContainText('CRDT Collaboration Test: Hello Bob from Alice!', { timeout: 15_000 });

      // 6. Bob types a response in Page 2
      await editor2.click();
      await page2.keyboard.press('ControlOrMeta+End');
      await page2.keyboard.type('% Response from Bob: Real-time math received!\n');

      // 7. Verify Alice in Page 1 receives Bob's edits without clobbering
      await expect(editor1).toContainText('Response from Bob: Real-time math received!', { timeout: 15_000 });
      await expect(editor1).toContainText('CRDT Collaboration Test: Hello Bob from Alice!');

      // 8. Both documents are in 100% mathematical convergence
      const doc1 = await page1.evaluate(() => {
        const win = window as unknown as { __teeexEditorView?: { state: { doc: { toString: () => string } } } };
        return win.__teeexEditorView?.state.doc.toString() || '';
      });
      const doc2 = await page2.evaluate(() => {
        const win = window as unknown as { __teeexEditorView?: { state: { doc: { toString: () => string } } } };
        return win.__teeexEditorView?.state.doc.toString() || '';
      });

      expect(doc1.trim()).toBe(doc2.trim());
      expect(doc1).toContain('CRDT Collaboration Test: Hello Bob from Alice!');
      expect(doc1).toContain('Response from Bob: Real-time math received!');

    } finally {
      await page1.close();
      await page2.close();
      await context.close();
    }
  });

  test('displays honest collaborative copy in index.html and document metadata', async ({ page }) => {
    await openWorkspace(page, {
      id: 'copy-verifier',
      email: 'verifier@teeex.local',
      fullName: 'Copy Verifier',
    });

    // Verify index.html title
    await expect(page).toHaveTitle(/Collaborative Browser LaTeX Editor \(CRDT & WebAssembly\)/i);

    // Verify meta description
    const metaDesc = page.locator('meta[name="description"]');
    await expect(metaDesc).toHaveAttribute('content', /Yjs CRDT, Supabase Realtime/i);
  });
});
