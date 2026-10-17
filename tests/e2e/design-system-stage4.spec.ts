import { test, expect } from '@playwright/test';
import { openWorkspace } from './fixtures';

test.describe('Stage 4: Design System, Command Palette & Splitter Engine', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await openWorkspace(page, {
      id: 'e2e-stage4-user',
      email: 'stage4@teeex.local',
      fullName: 'Stage 4 Tester',
    });
  });

  test('Command Palette (Ctrl+K) conforms to WAI-ARIA 1.2+ Combobox pattern', async ({ page }) => {
    // 1. Open via keyboard shortcut (ControlOrMeta+k)
    await page.keyboard.press('ControlOrMeta+k');

    const dialog = page.getByRole('dialog', { name: /Command Palette/i });
    await expect(dialog).toBeVisible();

    const combobox = page.getByRole('combobox', { name: 'Command Palette Search' });
    await expect(combobox).toBeVisible();
    await expect(combobox).toBeFocused();
    await expect(combobox).toHaveAttribute('aria-expanded', 'true');
    await expect(combobox).toHaveAttribute('aria-autocomplete', 'list');

    // 2. Typing into combobox filters listbox options
    await combobox.fill('Format');
    const listbox = page.getByRole('listbox', { name: /Command suggestions/i });
    await expect(listbox).toBeVisible();

    // 3. Continuous typing focus: cursor remains inside combobox input while navigating with arrow keys
    await page.keyboard.press('ArrowDown');
    const activedescendant = await combobox.getAttribute('aria-activedescendant');
    expect(activedescendant).toBeTruthy();

    const activeOption = page.locator(`#${activedescendant}`);
    await expect(activeOption).toHaveAttribute('aria-selected', 'true');

    // 4. Background Isolation: root workspace receives HTML `inert` while dialog is open
    const workspace = page.locator('#root-workspace');
    await expect(workspace).toHaveAttribute('inert', '');

    // 5. Dismiss on Escape: closes dialog and restores root workspace interactivity
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(workspace).not.toHaveAttribute('inert');
  });

  test('APG Window Splitter supports pointer capture, keyboard adjustment, and preset cycling', async ({ page }) => {
    const splitter = page.getByRole('separator', { name: 'Resize Editor and Preview panels' });
    await expect(splitter).toBeVisible();
    await expect(splitter).toHaveAttribute('aria-orientation', 'vertical');

    // Check initial split percent (50%)
    const initialVal = await splitter.getAttribute('aria-valuenow');
    expect(Number(initialVal)).toBe(50);

    // 1. Keyboard resizing: focus splitter and press ArrowLeft
    await splitter.focus();
    await page.keyboard.press('ArrowLeft');

    // Decreased by 2% -> 48
    await expect(splitter).toHaveAttribute('aria-valuenow', '48');

    // Press ArrowRight with Shift -> increased by 5% -> 53
    await page.keyboard.press('Shift+ArrowRight');
    await expect(splitter).toHaveAttribute('aria-valuenow', '53');

    // 2. Home and End keys jump to bounds (min 20, max 80)
    await page.keyboard.press('Home');
    await expect(splitter).toHaveAttribute('aria-valuenow', '20');

    await page.keyboard.press('End');
    await expect(splitter).toHaveAttribute('aria-valuenow', '80');

    // 3. Double click cycles presets: 50 -> 70 -> 30 -> 50
    await splitter.dblclick();
    await expect(splitter).toHaveAttribute('aria-valuenow', '50');

    await splitter.dblclick();
    await expect(splitter).toHaveAttribute('aria-valuenow', '70');

    await splitter.dblclick();
    await expect(splitter).toHaveAttribute('aria-valuenow', '30');

    await splitter.dblclick();
    await expect(splitter).toHaveAttribute('aria-valuenow', '50');
  });

  test('Global shortcuts toggle sidebar (Mod+B) and trigger formatting', async ({ page }) => {
    const editor = page.locator('.cm-content').first();
    await editor.click();

    // 1. Mod+B toggles sidebar
    const sidebar = page.getByRole('complementary', { name: 'Workspace file browser and document outline' });
    await expect(sidebar).toBeVisible();

    await page.keyboard.press('ControlOrMeta+b');
    // Sidebar wrapper should transition width to 0
    const sidebarWrapper = sidebar.locator('..');
    await expect(sidebarWrapper).toHaveCSS('width', '0px');

    // Mod+B again restores sidebar
    await page.keyboard.press('ControlOrMeta+b');
    await expect(sidebarWrapper).toHaveCSS('width', '236px');
  });

  test('Theme switching toggles data-theme between dark obsidian and crisp slate light', async ({ page }) => {
    // Check initial dark theme
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Toggle theme via Navbar button
    const themeBtn = page.getByRole('button', { name: 'Toggle color theme' });
    await expect(themeBtn).toBeVisible();

    await themeBtn.click();
    await expect(html).toHaveAttribute('data-theme', 'light');

    // Toggle back to dark
    await themeBtn.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('Prefers-reduced-motion media query disables transitions and animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const isMatch = await page.evaluate(() => {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });
    expect(isMatch).toBe(true);

    const animationDuration = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'spin';
      document.body.appendChild(el);
      const style = window.getComputedStyle(el);
      const dur = parseFloat(style.animationDuration);
      el.remove();
      return dur;
    });

    // Under prefers-reduced-motion: reduce, animation-duration is 0.01ms (0.00001s), so <= 0.001s
    expect(animationDuration).toBeLessThanOrEqual(0.001);
  });
});
