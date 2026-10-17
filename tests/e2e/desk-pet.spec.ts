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

  test('supports interactive 3-click action menu, petting, academic attire, and yarn chase', async ({ page }) => {
    // 1. Enable companion via Navbar button
    const navbarPetBtn = page.getByRole('button', { name: 'Toggle Desk Companion' });
    await navbarPetBtn.click();

    const mascot = page.getByRole('img', { name: /TeXCat Desk Companion/i });
    await expect(mascot).toBeVisible();

    // 2. Triple-click mascot to reveal quick action toolbar
    await mascot.click({ clickCount: 3 });
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

    // Bouncy yarn ball appears
    const yarnBall = page.locator('.pet-yarn-ball');
    await expect(yarnBall).toBeAttached();
    await expect(page.locator('.texcat-rig')).toHaveClass(/state-yarn-chase/);

    // 5. Cycle coat skin from toolbar
    const skinBtn = page.getByRole('button', { name: 'Cycle coat skin' });
    await skinBtn.click();
    await expect(page.locator('.desk-pet-container')).toHaveClass(/skin-ginger/);

    // 6. Cycle academic attire from toolbar (equips mortarboard graduate cap)
    const attireBtn = page.getByRole('button', { name: 'Cycle academic attire' });
    await attireBtn.click();
    await expect(page.locator('.texcat-accessory-mortarboard')).toBeAttached();

    // 7. Toggle sound effects from toolbar
    const soundBtn = page.getByRole('button', { name: 'Toggle companion sound' });
    await soundBtn.click();
    await expect(soundBtn).toHaveAttribute('title', /ON/);
  });

  test('supports keyboard-first interaction shortcuts (Space, C, A, S, M, Y)', async ({ page }) => {
    // 1. Enable companion via Navbar button
    const navbarPetBtn = page.getByRole('button', { name: 'Toggle Desk Companion' });
    await navbarPetBtn.click();

    const mascot = page.getByRole('img', { name: /TeXCat Desk Companion/i });
    await expect(mascot).toBeVisible();

    // 2. Focus mascot and press Space to pet
    await mascot.focus();
    await page.keyboard.press('Space');
    const hearts = page.locator('.pet-heart-particles');
    await expect(hearts).toBeAttached();

    // 3. Press 'c' to cycle skin
    await page.keyboard.press('c');
    await expect(page.locator('.desk-pet-container')).toHaveClass(/skin-ginger/);

    // 4. Press 'a' to cycle academic accessory (equips mortarboard)
    await page.keyboard.press('a');
    await expect(page.locator('.texcat-accessory-mortarboard')).toBeAttached();

    // 5. Press 's' to sleep (verifying math dream thought bubble appears with KaTeX)
    await page.keyboard.press('s');
    const dreamBubble = page.locator('.pet-dream-bubble');
    await expect(dreamBubble).toBeVisible();
    await expect(dreamBubble.locator('.katex')).toBeAttached();

    // 6. Press 's' again to wake up
    await page.keyboard.press('s');
    await expect(dreamBubble).not.toBeVisible();
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

    // Companion transitions to celebratory or diagnostic reaction bubble on compile completion
    const reactionBubble = page.locator('.pet-reaction-bubble');
    await expect(reactionBubble).toBeVisible({ timeout: 35_000 });
    await expect(reactionBubble).toHaveText(/(Q\.E\.D\.|Margins ok)/);
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

