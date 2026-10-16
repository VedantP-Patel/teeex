import { test, expect } from '@playwright/test';
import {
  openWorkspace,
  compileAndWaitForPreview,
  setEditorContent,
} from './fixtures';

const MULTI_PAGE_SOURCE = String.raw`\documentclass[10pt]{article}
\usepackage{hyperref}
\hypersetup{colorlinks=true, linkcolor=blue, urlcolor=blue}
\begin{document}
\section{First Section}\label{sec:first}
Welcome to Page 1.
See Section 2 on Page 2: \ref{sec:second}.
External link: \url{https://arxiv.org}.
Unsafe test: \url{javascript:alert(1)}.
\newpage
\section{Second Section}\label{sec:second}
Welcome to Page 2. Refer to \ref{sec:first}.
\newpage
Page 3 content block.
\newpage
Page 4 content block.
\newpage
Page 5 content block.
\newpage
\section{Final Section}\label{sec:final}
Welcome to Page 6.
\end{document}`;

test.describe('Stage 3: PDF Viewer Virtualization, Link Annotations & 4-State Lifecycle', () => {
  test('virtual windowing mounts only active pages and unmounts distant pages', async ({ page }) => {
    test.setTimeout(240_000);

    await openWorkspace(page, {
      id: 'e2e-stage3-user',
      email: 'stage3@teeex.local',
      fullName: 'Stage 3 Tester',
    });

    await compileAndWaitForPreview(page, MULTI_PAGE_SOURCE);

    const preview = page.getByRole('document', { name: 'Compiled document preview' });
    await expect(preview).toBeVisible();

    // 1. Initial view at top (Page 1)
    // Pages 1 and 2 should be mounted in the window
    const page1 = preview.locator('.pdf-page[data-page="1"]');
    const page2 = preview.locator('.pdf-page[data-page="2"]');
    await expect(page1).toBeVisible({ timeout: 15_000 });
    await expect(page2).toBeVisible({ timeout: 15_000 });

    // Page 6 should NOT be in the DOM (virtualized away)
    const page6 = preview.locator('.pdf-page[data-page="6"]');
    await expect(page6).toHaveCount(0);

    // 2. Link Annotations on Page 1
    // Verify external link annotation is rendered, targeted safely, and protocol verified
    const safeLink = preview.locator('a.pdf-link-annotation[href^="https://arxiv.org"]').first();
    await expect(safeLink).toBeVisible();
    await expect(safeLink).toHaveAttribute('target', '_blank');
    await expect(safeLink).toHaveAttribute('rel', 'noopener noreferrer');

    // Internal jump to cross-reference (Section 2)
    const internalLink = preview.locator('a.pdf-link-annotation.pdf-link-internal').first();
    await expect(internalLink).toBeVisible();
    await expect(internalLink).toHaveAttribute('href', /#dest-/);

    // Unsafe javascript: link must NEVER be a live href in the DOM
    const liveUnsafeLink = preview.locator('a[href^="javascript:"]');
    await expect(liveUnsafeLink).toHaveCount(0);

    const unsafeAnnotations = preview.locator('a.pdf-link-annotation.is-unsafe');
    if (await unsafeAnnotations.count() > 0) {
      await expect(unsafeAnnotations.first()).not.toHaveAttribute('href');
    }

    // 3. Scroll to Page 6
    await preview.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    // Page 6 must now be mounted in the DOM
    await expect(page6).toBeVisible({ timeout: 15_000 });

    // Page 1 should now be unmounted and reclaimed from the DOM
    await expect(page1).toHaveCount(0);
  });

  test('toolbar transitions across explicit states: current -> stale on typing', async ({ page }) => {
    test.setTimeout(240_000);

    await openWorkspace(page, {
      id: 'e2e-stage3-states',
      email: 'states@teeex.local',
      fullName: 'States Tester',
    });

    await compileAndWaitForPreview(page, MULTI_PAGE_SOURCE);

    const pane = page.locator('.pdf-pane');
    await expect(pane).toHaveAttribute('data-preview-state', 'current', { timeout: 15_000 });

    // Toolbar status shows emerald "Up to date"
    const upToDateBadge = page.locator('.pdf-status.pdf-status-current');
    await expect(upToDateBadge).toBeVisible();
    await expect(upToDateBadge).toContainText('Up to date');

    // Make an edit in CodeMirror
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('\n% typing edit for test\n');

    // State immediately transitions to 'stale' during debounce
    await expect(pane).toHaveAttribute('data-preview-state', 'stale', { timeout: 10_000 });
    const staleBadge = page.locator('.pdf-status.pdf-status-stale');
    await expect(staleBadge).toBeVisible();
    await expect(staleBadge).toContainText('Changes pending');
  });
});
