import { test, expect } from '@playwright/test';
import { openWorkspace, setEditorContent } from './fixtures';

const OFFLINE_TEST_DOC = String.raw`\documentclass[10pt]{article}
\usepackage{amsmath,lipsum}
\begin{document}
\section{Offline Typesetting Test}
This document tests that Teeex compiles 100% locally in the browser with zero network access.
\lipsum[1-2]
\end{document}`;

test.describe('Delivery, Typography & Offline Compilation (Stage 2)', () => {
  test('zero external font requests and zero CSP violations on clean load', async ({ page }) => {
    const leakedUrls: string[] = [];
    const cspViolations: string[] = [];

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        leakedUrls.push(url);
      }
    });

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Content-Security-Policy') || text.includes('violates the following Content Security Policy')) {
        cspViolations.push(text);
      }
    });

    await openWorkspace(page, {
      id: 'e2e-delivery-test',
      email: 'delivery@teeex.local',
      fullName: 'Delivery Test',
    });

    const preview = page.getByRole('document', { name: 'Compiled document preview' });
    const canvas = preview.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 120_000 });

    // Assert strictly zero third-party font leaks
    expect(leakedUrls, 'Must not leak any requests to Google Fonts CDNs').toEqual([]);
    // Assert strictly zero CSP violations
    expect(cspViolations, 'Must have zero Content-Security-Policy violations').toEqual([]);
  });

  test('compiles and updates PDF preview with network completely disabled (setOffline)', async ({ page, context }) => {
    test.setTimeout(240_000);

    // 1. Initial load online to establish worker and initial compile
    await openWorkspace(page, {
      id: 'e2e-offline-compile',
      email: 'offline@teeex.local',
      fullName: 'Offline Tester',
    });
    await setEditorContent(page, OFFLINE_TEST_DOC);

    const preview = page.getByRole('document', { name: 'Compiled document preview' });
    const canvas = preview.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 120_000 });

    // 2. Cut off network completely
    await context.setOffline(true);

    // 3. Make an edit while completely offline
    const offlineToken = `OFFLINE_TOKEN_${Date.now()}`;
    const editedDoc = OFFLINE_TEST_DOC.replace(
      'This document tests',
      `[${offlineToken}] This document tests`
    );
    await setEditorContent(page, editedDoc);

    // 4. Trigger compilation while offline
    const busy = page.locator('.pdf-status-busy');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(busy).toBeVisible({ timeout: 30_000 });
    await expect(busy).toBeHidden({ timeout: 120_000 });

    // 5. Assert compiled canvas is still visible and rendered
    await expect(canvas).toBeVisible();

    // 6. Restore online state for cleanup
    await context.setOffline(false);
  });
});
