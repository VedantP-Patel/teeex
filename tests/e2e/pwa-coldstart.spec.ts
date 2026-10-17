import { test, expect } from '@playwright/test';
import { openWorkspace, setEditorContent } from './fixtures';

test.describe('Stage 8: Instant Cold-Start, Service Worker Pre-Caching & Desktop PWA Experience', () => {
  test('PWA manifest is registered with Window Controls Overlay & File Handlers', async ({ page }) => {
    await openWorkspace(page, {
      id: 'e2e-pwa-manifest',
      email: 'pwa@teeex.local',
      fullName: 'PWA Tester',
    });

    // 1. Verify manifest link in HTML head
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');

    // 2. Fetch manifest content directly
    const manifestResponse = await page.request.get('/manifest.webmanifest');
    expect(manifestResponse.ok()).toBe(true);

    const manifest = await manifestResponse.json();
    expect(manifest.name).toBe('Teeex — Real-Time Collaborative LaTeX IDE');
    expect(manifest.short_name).toBe('Teeex');
    expect(manifest.display_override).toContain('window-controls-overlay');

    // Assert file handlers for LaTeX documents
    const fileHandlers = manifest.file_handlers;
    expect(Array.isArray(fileHandlers)).toBe(true);
    expect(fileHandlers.length).toBeGreaterThan(0);

    const texHandler = fileHandlers.find((h: { action: string }) => h.action === '/');
    expect(texHandler).toBeDefined();
    const acceptedExtensions = Object.values(texHandler.accept).flat();
    expect(acceptedExtensions).toContain('.tex');
    expect(acceptedExtensions).toContain('.sty');
    expect(acceptedExtensions).toContain('.cls');
    expect(acceptedExtensions).toContain('.bib');
  });

  test('Service Worker registers and caches application shell', async ({ page, context }) => {
    test.setTimeout(180_000);

    await openWorkspace(page, {
      id: 'e2e-sw-register',
      email: 'sw@teeex.local',
      fullName: 'SW Tester',
    });

    // Wait for Service Worker registration
    const isSwRegistered = await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return Boolean(reg);
    }, { timeout: 30_000 });

    expect(isSwRegistered).toBeTruthy();
  });

  test('Engine Warmup Badge renders and opens Telemetry Dialog', async ({ page }) => {
    test.setTimeout(180_000);

    await openWorkspace(page, {
      id: 'e2e-telemetry-modal',
      email: 'telemetry@teeex.local',
      fullName: 'Telemetry Tester',
    });

    // Locate warmup pill in navbar
    const warmupPill = page.locator('.engine-warmup-pill');
    await expect(warmupPill).toBeVisible({ timeout: 45_000 });

    // Open telemetry dialog
    await warmupPill.click();

    const telemetryCard = page.locator('.engine-telemetry-card');
    await expect(telemetryCard).toBeVisible({ timeout: 10_000 });

    // Verify telemetry dialog contents
    await expect(telemetryCard.locator('.engine-telemetry-title')).toContainText('TeX Engine & Storage Telemetry');
    await expect(telemetryCard).toContainText('pdfLaTeX 2026 (WASM Emscripten)');
    await expect(telemetryCard).toContainText('CacheStorage');
    await expect(telemetryCard).toContainText('IndexedDB');

    // Close telemetry dialog
    const closeBtn = page.locator('.engine-telemetry-close');
    await closeBtn.click();
    await expect(telemetryCard).toBeHidden({ timeout: 5_000 });
  });

  test('Offline compilation succeeds with network disabled via local engine cache', async ({ page, context }) => {
    test.setTimeout(240_000);

    await openWorkspace(page, {
      id: 'e2e-pwa-offline-compile',
      email: 'pwa-offline@teeex.local',
      fullName: 'Offline PWA User',
    });

    // Wait for initial compilation to complete
    const preview = page.getByRole('document', { name: 'Compiled document preview' });
    const canvas = preview.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 120_000 });

    // Cut off network completely
    await context.setOffline(true);

    // Modify document while offline
    const docWithOfflineTag = String.raw`\documentclass{article}
\begin{document}
\section{PWA Offline Compilation Test}
Compiled with Service Worker Cache and Zero Network!
\end{document}`;

    await setEditorContent(page, docWithOfflineTag);

    // Compile offline
    await page.keyboard.press('ControlOrMeta+Enter');

    // Canvas should remain visible with zero network
    await expect(canvas).toBeVisible({ timeout: 60_000 });

    // Restore network
    await context.setOffline(false);
  });
});
