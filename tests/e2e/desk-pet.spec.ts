import { test, expect } from '@playwright/test';
import { openWorkspace } from './fixtures';

test.describe('Stage 6: TeXCat Desk Companion (Desk Pet)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await openWorkspace(page, {
      id: 'e2e-desk-pet-user',
      email: 'deskpet@teeex.local',
      fullName: 'Desk Pet Tester',
    });
  });

  test('is off by default and renders zero DOM elements on fresh load', async ({ page }) => {
    // 1. Verify desk pet container does not exist initially
    const petContainer = page.locator('.desk-pet-container');
    await expect(petContainer).toHaveCount(0);

    // 2. Verify navbar button shows companion as off
    const navbarPetBtn = page.getByRole('button', { name: 'Toggle Desk Companion' });
    await expect(navbarPetBtn).toBeVisible();
    await expect(navbarPetBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('can be toggled on via Command Palette (Ctrl+K) and displays accessible vector mascot', async ({ page }) => {
    // 1. Open Command Palette
    await page.keyboard.press('ControlOrMeta+k');
    const dialog = page.getByRole('dialog', { name: /Command Palette/i });
    await expect(dialog).toBeVisible();

    // 2. Search for companion command
    const searchInput = page.getByRole('combobox', { name: 'Command Palette Search' });
    await searchInput.fill('Desk Companion');

    // 3. Select toggle command
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(dialog).not.toBeVisible();

    // 4. Companion mascot appears above dock ledge
    const petContainer = page.locator('.desk-pet-container');
    await expect(petContainer).toBeVisible();

    const mascot = page.getByRole('img', { name: /TeXCat Desk Companion/i });
    await expect(mascot).toBeVisible();
    await expect(mascot).toHaveAttribute('tabindex', '0');

    // 5. Navbar button reflects active state
    const navbarPetBtn = page.getByRole('button', { name: 'Toggle Desk Companion' });
    await expect(navbarPetBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('supports interactive hover action menu, petting, and yarn chase', async ({ page }) => {
    // 1. Enable companion via Navbar button
    const navbarPetBtn = page.getByRole('button', { name: 'Toggle Desk Companion' });
    await navbarPetBtn.click();

    const mascot = page.getByRole('img', { name: /TeXCat Desk Companion/i });
    await expect(mascot).toBeVisible();

    // 2. Hover mascot to reveal quick action toolbar
    await mascot.hover();
    const toolbar = page.getByRole('toolbar', { name: 'Desk companion quick actions' });
    await expect(toolbar).toBeVisible();

    // 3. Click "Pet" action
    const petBtn = page.getByRole('button', { name: 'Pet companion' });
    await petBtn.click();

    // Floating heart particles appear
    const hearts = page.locator('.pet-heart-particles');
    await expect(hearts).toBeAttached();

    // 4. Click "Yarn" action
    const yarnBtn = page.getByRole('button', { name: 'Toss yarn ball' });
    await yarnBtn.click();

    // Rolling yarn ball appears
    const yarnBall = page.locator('.pet-yarn-ball');
    await expect(yarnBall).toBeAttached();
    await expect(page.locator('.texcat-rig')).toHaveClass(/state-yarn-chase/);
  });

  test('reacts to compiler lifecycle with scholar glasses and celebration leap', async ({ page }) => {
    // Enable companion
    const navbarPetBtn = page.getByRole('button', { name: 'Toggle Desk Companion' });
    await navbarPetBtn.click();

    const mascot = page.getByRole('img', { name: /TeXCat Desk Companion/i });
    await expect(mascot).toBeVisible();

    // Trigger compile via Navbar Compile button
    const compileBtn = page.getByRole('button', { name: /Compile/i }).first();
    await compileBtn.click();

    // Companion transitions to celebratory leap with Q.E.D. reaction bubble on compile success
    const celebrationBubble = page.locator('.pet-reaction-bubble.reaction-success');
    await expect(celebrationBubble).toBeVisible({ timeout: 35_000 });
    await expect(celebrationBubble).toContainText('Q.E.D.');

    const sparkles = page.locator('.pet-sparkle-particles');
    await expect(sparkles).toBeAttached();
  });

  test('respects prefers-reduced-motion media query', async ({ page }) => {
    // Enable reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // Enable companion
    const navbarPetBtn = page.getByRole('button', { name: 'Toggle Desk Companion' });
    await navbarPetBtn.click();

    const mascot = page.getByRole('img', { name: /TeXCat Desk Companion/i });
    await expect(mascot).toBeVisible();

    // Wrapper translation is none in reduced motion
    const transform = await mascot.evaluate(el => window.getComputedStyle(el).transform);
    expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
  });
});
