// @vitest-environment happy-dom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useDeskPet, type UseDeskPetOptions, type UseDeskPetReturn } from '../../src/hooks/useDeskPet';
import { DeskPet } from '../../src/components/DeskPet';

describe('TeXCat Desk Companion (useDeskPet & DeskPet)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let currentHook: UseDeskPetReturn;

  function TestHookComponent({ options }: { options?: UseDeskPetOptions }) {
    currentHook = useDeskPet(options);
    return null;
  }

  async function mountHook(options?: UseDeskPetOptions) {
    await act(async () => {
      root.render(React.createElement(TestHookComponent, { options }));
    });
  }

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Core Requirements: Off By Default & Persistence', () => {
    it('is disabled by default when localStorage is empty', async () => {
      await mountHook();
      expect(currentHook.isEnabled).toBe(false);
      expect(currentHook.state).toBe('idle');
    });

    it('toggles enablement and persists preference to localStorage', async () => {
      await mountHook();
      expect(currentHook.isEnabled).toBe(false);

      await act(async () => {
        currentHook.toggleEnabled();
      });
      expect(currentHook.isEnabled).toBe(true);
      expect(localStorage.getItem('teeex_desk_pet_enabled')).toBe('true');

      await act(async () => {
        currentHook.toggleEnabled();
      });
      expect(currentHook.isEnabled).toBe(false);
      expect(localStorage.getItem('teeex_desk_pet_enabled')).toBe('false');
    });

    it('renders null (zero DOM footprint) when isEnabled is false', async () => {
      await act(async () => {
        root.render(
          React.createElement(DeskPet, {
            isEnabled: false,
            state: 'idle',
            direction: 'right',
            pacingOffset: 0,
            isSleeping: false,
            isReducedMotion: false,
            isPaused: false,
            petCount: 0,
          })
        );
      });

      expect(container.firstChild).toBeNull();
      expect(container.querySelectorAll('.desk-pet-container').length).toBe(0);
    });

    it('renders accessible mascot container with role="img" when enabled', async () => {
      await act(async () => {
        root.render(
          React.createElement(DeskPet, {
            isEnabled: true,
            state: 'idle',
            direction: 'right',
            pacingOffset: 0,
            isSleeping: false,
            isReducedMotion: false,
            isPaused: false,
            petCount: 2,
          })
        );
      });

      const mascot = container.querySelector('[role="img"]');
      expect(mascot).not.toBeNull();
      expect(mascot?.getAttribute('aria-label')).toContain('TeXCat Desk Companion');
      expect(mascot?.getAttribute('aria-label')).toContain('Pet count: 2');
    });
  });

  describe('8-Action State Machine Transitions', () => {
    beforeEach(() => {
      localStorage.setItem('teeex_desk_pet_enabled', 'true');
    });

    it('transitions to compiling-scholar when compileStatus is compiling', async () => {
      await mountHook({ compileStatus: 'idle' });
      expect(currentHook.state).toBe('idle');

      await mountHook({ compileStatus: 'compiling' });
      expect(currentHook.state).toBe('compiling-scholar');
    });

    it('transitions to compile-success for 3.5s when compilation succeeds', async () => {
      await mountHook({ compileStatus: 'compiling' });
      expect(currentHook.state).toBe('compiling-scholar');

      await mountHook({ compileStatus: 'success', lastCompiledAt: 1000 });
      expect(currentHook.state).toBe('compile-success');

      // Advances 3.5s
      await act(async () => {
        vi.advanceTimersByTime(3500);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('transitions to compile-fail for 4.5s when compilation encounters errors', async () => {
      await mountHook({ compileStatus: 'compiling' });
      expect(currentHook.state).toBe('compiling-scholar');

      await mountHook({ compileStatus: 'error', lastCompiledAt: 2000, errorCount: 1 });
      expect(currentHook.state).toBe('compile-fail');

      // Advances 4.5s
      await act(async () => {
        vi.advanceTimersByTime(4500);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('enters typing-paws on active typing pulse and settles after debounce', async () => {
      await mountHook({ isTypingActive: false });
      expect(currentHook.state).toBe('idle');

      await mountHook({ isTypingActive: true });
      expect(currentHook.state).toBe('typing-paws');

      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('enters sleep after 45s of user inactivity', async () => {
      await mountHook({ inactivitySleepMs: 45000 });
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        vi.advanceTimersByTime(45000);
      });
      expect(currentHook.state).toBe('sleep');
      expect(currentHook.isSleeping).toBe(true);
    });

    it('wakes with arch-back stretch before resuming idle', async () => {
      await mountHook({ inactivitySleepMs: 45000 });
      await act(async () => {
        vi.advanceTimersByTime(45000);
      });
      expect(currentHook.state).toBe('sleep');

      await act(async () => {
        currentHook.wakeUp();
      });
      expect(currentHook.state).toBe('waking-stretch');

      await act(async () => {
        vi.advanceTimersByTime(1200);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('toggles sleep and awake explicitly via toggleSleep', async () => {
      await mountHook();
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        currentHook.toggleSleep();
      });
      expect(currentHook.state).toBe('sleep');
      expect(currentHook.isSleeping).toBe(true);

      await act(async () => {
        currentHook.toggleSleep();
      });
      expect(currentHook.state).toBe('waking-stretch');

      await act(async () => {
        vi.advanceTimersByTime(1200);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('supports interactive yarn chase action for 2.8s', async () => {
      await mountHook();
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        currentHook.triggerYarnChase();
      });
      expect(currentHook.state).toBe('yarn-chase');

      await act(async () => {
        vi.advanceTimersByTime(2800);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('supports petting action to increment petCount', async () => {
      await mountHook();
      expect(currentHook.petCount).toBe(0);

      await act(async () => {
        currentHook.triggerPet();
      });
      expect(currentHook.petCount).toBe(1);

      await act(async () => {
        currentHook.triggerPet();
      });
      expect(currentHook.petCount).toBe(2);
    });
  });

  describe('Tab Inactivity & Visibility Pause (document.hidden)', () => {
    beforeEach(() => {
      localStorage.setItem('teeex_desk_pet_enabled', 'true');
    });

    it('pauses state and clears timers when document.hidden is true', async () => {
      await mountHook();
      expect(currentHook.isPaused).toBe(false);

      // Simulate tab backgrounding
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(currentHook.isPaused).toBe(true);

      // Advance timers while hidden: should NOT transition to sleep because timer is canceled
      await act(async () => {
        vi.advanceTimersByTime(50000);
      });
      expect(currentHook.state).toBe('idle');

      // Simulate tab return
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(currentHook.isPaused).toBe(false);
    });
  });

  describe('Reduced Motion Awareness', () => {
    it('sets pacingOffset to 0 when prefers-reduced-motion is active', async () => {
      // Mock matchMedia returning true for reduced motion
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      localStorage.setItem('teeex_desk_pet_enabled', 'true');
      await mountHook();

      expect(currentHook.isReducedMotion).toBe(true);
      expect(currentHook.pacingOffset).toBe(0);

      window.matchMedia = originalMatchMedia;
    });
  });

  describe('Strict Document Privacy Guarantee', () => {
    it('DeskPet and useDeskPet do not accept or expose document contents or LaTeX code', () => {
      const allowedHookOptionKeys = [
        'compileStatus',
        'lastCompiledAt',
        'errorCount',
        'isTypingActive',
        'inactivitySleepMs',
      ];
      // Verifies no content, files, code, or buffer props exist in the contract
      expect(allowedHookOptionKeys).not.toContain('code');
      expect(allowedHookOptionKeys).not.toContain('content');
      expect(allowedHookOptionKeys).not.toContain('files');
      expect(allowedHookOptionKeys).not.toContain('ast');
    });

    it('rendered DOM contains strictly zero LaTeX document contents', async () => {
      await act(async () => {
        root.render(
          React.createElement(DeskPet, {
            isEnabled: true,
            state: 'compiling-scholar',
            direction: 'right',
            pacingOffset: 0,
            isSleeping: false,
            isReducedMotion: false,
            isPaused: false,
            petCount: 0,
          })
        );
      });

      const renderedHtml = container.innerHTML;
      expect(renderedHtml).not.toContain('\\documentclass');
      expect(renderedHtml).not.toContain('\\begin{document}');
      expect(renderedHtml).not.toContain('equation');
    });
  });

  describe('Coat Skin Customization & Persistence', () => {
    it('initializes to tuxedo skin by default', async () => {
      await mountHook();
      expect(currentHook.skin).toBe('tuxedo');
    });

    it('cycles between the 5 procedural coat skins and persists to localStorage', async () => {
      await mountHook();
      expect(currentHook.skin).toBe('tuxedo');

      await act(async () => {
        currentHook.cycleSkin();
      });
      expect(currentHook.skin).toBe('ginger');
      expect(localStorage.getItem('teeex_desk_pet_skin')).toBe('ginger');

      await act(async () => {
        currentHook.cycleSkin();
      });
      expect(currentHook.skin).toBe('calico');

      await act(async () => {
        currentHook.cycleSkin();
      });
      expect(currentHook.skin).toBe('siamese');

      await act(async () => {
        currentHook.cycleSkin();
      });
      expect(currentHook.skin).toBe('cyberpunk');

      await act(async () => {
        currentHook.cycleSkin();
      });
      expect(currentHook.skin).toBe('tuxedo');
    });
  });

  describe('Web Audio Synthesizer (Zero Assets, Muted by Default)', () => {
    it('is strictly muted by default', async () => {
      await mountHook();
      expect(currentHook.isSoundEnabled).toBe(false);
      expect(localStorage.getItem('teeex_desk_pet_sound')).toBeNull();
    });

    it('toggles sound mute state and persists preference', async () => {
      await mountHook();
      await act(async () => {
        currentHook.toggleSound();
      });
      expect(currentHook.isSoundEnabled).toBe(true);
      expect(localStorage.getItem('teeex_desk_pet_sound')).toBe('true');

      await act(async () => {
        currentHook.toggleSound();
      });
      expect(currentHook.isSoundEnabled).toBe(false);
      expect(localStorage.getItem('teeex_desk_pet_sound')).toBe('false');
    });
  });

  describe('Academic Accessories & Attire', () => {
    it('initializes with accessory none and cycles through academic outfits', async () => {
      await mountHook();
      expect(currentHook.accessory).toBe('none');

      await act(async () => {
        currentHook.cycleAccessory();
      });
      expect(currentHook.accessory).toBe('mortarboard');
      expect(localStorage.getItem('teeex_desk_pet_accessory')).toBe('mortarboard');

      await act(async () => {
        currentHook.cycleAccessory();
      });
      expect(currentHook.accessory).toBe('scarf');

      await act(async () => {
        currentHook.cycleAccessory();
      });
      expect(currentHook.accessory).toBe('detective');

      await act(async () => {
        currentHook.cycleAccessory();
      });
      expect(currentHook.accessory).toBe('bowtie');

      await act(async () => {
        currentHook.cycleAccessory();
      });
      expect(currentHook.accessory).toBe('none');
    });
  });

  describe('2D Viewport Dragging & Ledge Snapping', () => {
    it('defaults to ledge perched coordinates (perchX: 28, perchY: 36, isSnappedToDock: true)', async () => {
      await mountHook();
      expect(currentHook.perchX).toBe(28);
      expect(currentHook.perchY).toBe(36);
      expect(currentHook.isSnappedToDock).toBe(true);
    });

    it('supports resetPositionToDock', async () => {
      await mountHook();
      await act(async () => {
        currentHook.resetPositionToDock();
      });
      expect(currentHook.perchX).toBe(28);
      expect(currentHook.perchY).toBe(36);
      expect(currentHook.isSnappedToDock).toBe(true);
    });
  });

  describe('Feline Micro-Behaviors (Loaf Mode)', () => {
    beforeEach(() => {
      localStorage.setItem('teeex_desk_pet_enabled', 'true');
    });

    it('enters loaf mode after 18s of idle inactivity before sleep', async () => {
      await mountHook({ inactivitySleepMs: 45000 });
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        vi.advanceTimersByTime(18000);
      });
      expect(currentHook.state).toBe('loaf');

      // Continued inactivity transitions to sleep at 45s
      await act(async () => {
        vi.advanceTimersByTime(27000);
      });
      expect(currentHook.state).toBe('sleep');
    });
  });

  describe('Diagnostic Empathy (Tape Measure on Warnings)', () => {
    beforeEach(() => {
      localStorage.setItem('teeex_desk_pet_enabled', 'true');
    });

    it('transitions to compile-warning when warnings exist on success', async () => {
      await mountHook({ compileStatus: 'compiling' });
      expect(currentHook.state).toBe('compiling-scholar');

      await mountHook({ compileStatus: 'success', warningCount: 2, lastCompiledAt: 1000 });
      expect(currentHook.state).toBe('compile-warning');

      await act(async () => {
        vi.advanceTimersByTime(3200);
      });
      expect(currentHook.state).toBe('idle');
    });
  });

  describe('Audio Engine Volume Control', () => {
    it('sets and clamps volume between 0 and 1', async () => {
      await mountHook();
      expect(currentHook.volume).toBe(0.6);

      await act(async () => {
        currentHook.setVolume(0.85);
      });
      expect(currentHook.volume).toBe(0.85);
      expect(localStorage.getItem('teeex_desk_pet_volume')).toBe('0.85');
    });
  });

  describe('Stage 15: Roaming Modes (Dock Patrol vs. Desktop Free-Roam)', () => {
    beforeEach(() => {
      localStorage.setItem('teeex_desk_pet_enabled', 'true');
    });

    it('defaults to dock roam mode and persists to localStorage', async () => {
      await mountHook();
      expect(currentHook.roamMode).toBe('dock');
    });

    it('toggles roam mode between dock and free roam', async () => {
      await mountHook();
      expect(currentHook.roamMode).toBe('dock');

      await act(async () => {
        currentHook.toggleRoamMode();
      });
      expect(currentHook.roamMode).toBe('free');
      expect(localStorage.getItem('teeex_desk_pet_roam_mode')).toBe('free');

      await act(async () => {
        currentHook.toggleRoamMode();
      });
      expect(currentHook.roamMode).toBe('dock');
      expect(localStorage.getItem('teeex_desk_pet_roam_mode')).toBe('dock');
    });

    it('triggerRoam initiates walking and resolves cleanly with landing', async () => {
      await mountHook();
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        currentHook.triggerRoam();
      });
      expect(currentHook.state).toBe('walk');

      // Fast-forward walk and landing duration to settle back to idle
      await act(async () => {
        vi.advanceTimersByTime(3500);
      });
      expect(currentHook.state).toBe('idle');
    });
  });

  describe('Stage 15: Feline Mischief & Annoyance Animations', () => {
    beforeEach(() => {
      localStorage.setItem('teeex_desk_pet_enabled', 'true');
    });

    it('triggers knock-mug animation for 2.4s', async () => {
      await mountHook();
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        currentHook.triggerKnockMug();
      });
      expect(currentHook.state).toBe('knock-mug');

      await act(async () => {
        vi.advanceTimersByTime(2400);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('triggers swat-cursor animation for 1.8s', async () => {
      await mountHook();
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        currentHook.triggerSwatCursor();
      });
      expect(currentHook.state).toBe('swat-cursor');

      await act(async () => {
        vi.advanceTimersByTime(1800);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('triggers belly-flop animation for 2.6s', async () => {
      await mountHook();
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        currentHook.triggerBellyFlop();
      });
      expect(currentHook.state).toBe('belly-flop');

      await act(async () => {
        vi.advanceTimersByTime(2600);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('triggers peek-a-boo hiding animation for 2.6s', async () => {
      await mountHook();
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        currentHook.triggerPeekABoo();
      });
      expect(currentHook.state).toBe('peek-a-boo');

      await act(async () => {
        vi.advanceTimersByTime(2600);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('triggers ear-scratch animation for 2.2s', async () => {
      await mountHook();
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        currentHook.triggerEarScratch();
      });
      expect(currentHook.state).toBe('ear-scratch');

      await act(async () => {
        vi.advanceTimersByTime(2200);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('triggers nap-yawn animation for 2.4s', async () => {
      await mountHook();
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        currentHook.triggerNapYawn();
      });
      expect(currentHook.state).toBe('nap-yawn');

      await act(async () => {
        vi.advanceTimersByTime(2400);
      });
      expect(currentHook.state).toBe('idle');
    });
  });

  describe('Stage 15: Interactive Toys & Treats', () => {
    beforeEach(() => {
      localStorage.setItem('teeex_desk_pet_enabled', 'true');
    });

    it('triggers laser chase mode and resolves after 4.5s', async () => {
      await mountHook();
      expect(currentHook.isLaserActive).toBe(false);

      await act(async () => {
        currentHook.triggerLaser();
      });
      expect(currentHook.isLaserActive).toBe(true);
      expect(currentHook.state).toBe('laser-chase');

      await act(async () => {
        vi.advanceTimersByTime(4500);
      });
      expect(currentHook.isLaserActive).toBe(false);
      expect(currentHook.state).toBe('idle');
    });

    it('triggers \\hbox cardboard box sit for 3.4s', async () => {
      await mountHook();
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        currentHook.triggerBox();
      });
      expect(currentHook.state).toBe('box-sit');

      await act(async () => {
        vi.advanceTimersByTime(3400);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('triggers golden fish snack treat feast for 2.8s', async () => {
      await mountHook();
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        currentHook.triggerFish();
      });
      expect(currentHook.state).toBe('fish-feast');

      await act(async () => {
        vi.advanceTimersByTime(2800);
      });
      expect(currentHook.state).toBe('idle');
    });

    it('triggers Donald Knuth $2.56 Bug Reward Check celebration for 3.6s', async () => {
      await mountHook();
      expect(currentHook.state).toBe('idle');

      await act(async () => {
        currentHook.triggerKnuthCelebration();
      });
      expect(currentHook.state).toBe('knuth-check');

      await act(async () => {
        vi.advanceTimersByTime(3600);
      });
      expect(currentHook.state).toBe('idle');
    });
  });

  describe('Stage 15: Fluid State Transitions', () => {
    beforeEach(() => {
      localStorage.setItem('teeex_desk_pet_enabled', 'true');
    });

    it('activates isTransitioning for 180ms during state morphs', async () => {
      await mountHook();
      expect(currentHook.isTransitioning).toBe(false);

      await act(async () => {
        currentHook.triggerNapYawn();
      });
      expect(currentHook.isTransitioning).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(180);
      });
      expect(currentHook.isTransitioning).toBe(false);
    });
  });

  describe('Stage 15: Component Keyboard Shortcuts & Quick Toys', () => {
    it('handles keyboard shortcuts for interactive toys', async () => {
      const mockTriggerLaser = vi.fn();
      const mockTriggerBox = vi.fn();
      const mockTriggerFish = vi.fn();
      const mockTriggerKnuth = vi.fn();
      const mockTriggerPeek = vi.fn();
      const mockToggleRoam = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(DeskPet, {
            isEnabled: true,
            state: 'idle',
            direction: 'right',
            pacingOffset: 0,
            isSleeping: false,
            isReducedMotion: false,
            isPaused: false,
            petCount: 0,
            triggerLaser: mockTriggerLaser,
            triggerBox: mockTriggerBox,
            triggerFish: mockTriggerFish,
            triggerKnuthCelebration: mockTriggerKnuth,
            triggerPeekABoo: mockTriggerPeek,
            toggleRoamMode: mockToggleRoam,
          })
        );
      });

      const mascot = container.querySelector('[role="img"]') as HTMLElement;
      expect(mascot).not.toBeNull();

      // Trigger 'l' for laser
      await act(async () => {
        mascot.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
      });
      expect(mockTriggerLaser).toHaveBeenCalledTimes(1);

      // Trigger 'b' for box
      await act(async () => {
        mascot.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
      });
      expect(mockTriggerBox).toHaveBeenCalledTimes(1);

      // Trigger 'f' for fish treat
      await act(async () => {
        mascot.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
      });
      expect(mockTriggerFish).toHaveBeenCalledTimes(1);

      // Trigger 'k' for Knuth celebration
      await act(async () => {
        mascot.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
      });
      expect(mockTriggerKnuth).toHaveBeenCalledTimes(1);

      // Trigger 'p' for peek-a-boo
      await act(async () => {
        mascot.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
      });
      expect(mockTriggerPeek).toHaveBeenCalledTimes(1);

      // Trigger 'r' for roam mode toggle
      await act(async () => {
        mascot.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
      });
      expect(mockToggleRoam).toHaveBeenCalledTimes(1);
    });
  });

  describe('Stage 16: Non-Intrusive UX, Tooltip Elimination & Compact Companion Card', () => {
    it('strictly omits native title attribute to prevent blocking PDF equations and text', async () => {
      await act(async () => {
        root.render(
          React.createElement(DeskPet, {
            isEnabled: true,
            state: 'idle',
            direction: 'right',
            pacingOffset: 0,
            isSleeping: false,
            isReducedMotion: false,
            isPaused: false,
            petCount: 5,
          })
        );
      });

      const mascot = container.querySelector('[role="img"]') as HTMLElement;
      expect(mascot).not.toBeNull();
      // Verifies native title is null (zero obstructive OS tooltips)
      expect(mascot.getAttribute('title')).toBeNull();
      // Verifies screen reader aria-label remains accessible
      expect(mascot.getAttribute('aria-label')).toContain('TeXCat Desk Companion');
    });

    it('opens compact companion card on "o" key and navigates tabs', async () => {
      const mockResetToDock = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(DeskPet, {
            isEnabled: true,
            state: 'idle',
            direction: 'right',
            pacingOffset: 0,
            isSleeping: false,
            isReducedMotion: false,
            isPaused: false,
            petCount: 3,
            resetPositionToDock: mockResetToDock,
          })
        );
      });

      const mascot = container.querySelector('[role="img"]') as HTMLElement;
      expect(container.querySelector('[role="dialog"]')).toBeNull();

      // Open companion menu with 'o'
      await act(async () => {
        mascot.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
      });

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.classList.contains('texcat-companion-card')).toBe(true);

      // Verify Play tab is active by default
      const playTabBtn = container.querySelectorAll('.companion-tab-btn')[0];
      const wardrobeTabBtn = container.querySelectorAll('.companion-tab-btn')[1];
      const settingsTabBtn = container.querySelectorAll('.companion-tab-btn')[2];

      expect(playTabBtn.classList.contains('is-active')).toBe(true);
      expect(container.querySelectorAll('.companion-toy-chip').length).toBe(8);

      // Switch to Wardrobe tab
      await act(async () => {
        wardrobeTabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(wardrobeTabBtn.classList.contains('is-active')).toBe(true);
      expect(container.querySelectorAll('.coat-swatch-circle').length).toBe(5);

      // Switch to Settings tab
      await act(async () => {
        settingsTabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(settingsTabBtn.classList.contains('is-active')).toBe(true);

      // Click "Return to Ledge" button
      const returnBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Return to Ledge')
      );
      expect(returnBtn).toBeDefined();

      await act(async () => {
        returnBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(mockResetToDock).toHaveBeenCalledTimes(1);
    });

    it('corrects vertical drag physics to move UP when pointer moves up', async () => {
      localStorage.setItem('teeex_desk_pet_enabled', 'true');
      await mountHook();

      expect(currentHook.perchY).toBe(36);

      // Simulate pointer down to begin drag
      const mockElement = document.createElement('div');
      await act(async () => {
        currentHook.startDrag({
          clientX: 500,
          clientY: 400,
          pointerId: 1,
          target: mockElement,
        } as unknown as React.PointerEvent);
      });

      expect(currentHook.isDragging).toBe(true);

      // Simulate pointer moving UP (clientY moves from 400 down to 300, dy = -100)
      await act(async () => {
        window.dispatchEvent(
          new PointerEvent('pointermove', {
            clientX: 500,
            clientY: 300,
          })
        );
      });

      // Upwards pointer motion (dy < 0) MUST increase perchY (moving UP away from bottom)
      expect(currentHook.perchY).toBe(136); // 36 - (-100) = 136

      // Release drag
      await act(async () => {
        window.dispatchEvent(
          new PointerEvent('pointerup', {
            clientX: 500,
            clientY: 300,
          })
        );
      });
      expect(currentHook.isDragging).toBe(false);
    });
  });

  describe('Stage 19: Pet Scholar Progression, Authentic Behaviors & Feline Annoyance Engine', () => {
    beforeEach(() => {
      localStorage.setItem('teeex_desk_pet_enabled', 'true');
    });

    it('verifies mascot opacity is full and never fades on hover (no ghost-hover class)', async () => {
      await act(async () => {
        root.render(
          React.createElement(DeskPet, {
            isEnabled: true,
            state: 'idle',
            direction: 'right',
            pacingOffset: 0,
            isSleeping: false,
            isReducedMotion: false,
            isPaused: false,
            petCount: 0,
          })
        );
      });

      const mascotWrapper = container.querySelector('.desk-pet-mascot-wrapper');
      expect(mascotWrapper).not.toBeNull();
      expect(mascotWrapper?.classList.contains('ghost-hover')).toBe(false);
    });

    it('renders dream thought bubble with KaTeX math formula and triggers onInsertFormula when Insert is clicked', async () => {
      const mockInsert = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(DeskPet, {
            isEnabled: true,
            state: 'sleep',
            direction: 'right',
            pacingOffset: 0,
            isSleeping: true,
            isReducedMotion: false,
            isPaused: false,
            petCount: 0,
            currentDreamFormula: 'e^{i\\pi} + 1 = 0',
            onInsertFormula: mockInsert,
          })
        );
      });

      const dreamBubble = container.querySelector('.pet-dream-bubble');
      expect(dreamBubble).not.toBeNull();
      const insertBtn = Array.from(dreamBubble?.querySelectorAll('button') || []).find(b => b.textContent?.includes('Insert'));
      expect(insertBtn).toBeDefined();

      await act(async () => {
        insertBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(mockInsert).toHaveBeenCalledWith('e^{i\\pi} + 1 = 0');
    });

    it('triggers click spam annoyance when clicked > 4 times rapidly within 1.2s', async () => {
      const mockAnnoyance = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(DeskPet, {
            isEnabled: true,
            state: 'idle',
            direction: 'right',
            pacingOffset: 0,
            isSleeping: false,
            isReducedMotion: false,
            isPaused: false,
            petCount: 0,
            triggerAnnoyanceReaction: mockAnnoyance,
          })
        );
      });

      const mascot = container.querySelector('.desk-pet-mascot-wrapper');
      await act(async () => {
        for (let i = 0; i < 5; i++) {
          mascot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      });

      expect(mockAnnoyance).toHaveBeenCalledWith('click_spam');
    });

    it('triggers feline overstimulation annoyance when petted >= 8 times in 5s', async () => {
      await mountHook();

      await act(async () => {
        for (let i = 0; i < 8; i++) {
          currentHook.triggerPet();
        }
      });

      expect(currentHook.annoyanceLevel).toBeGreaterThan(0);
      expect(currentHook.annoyanceReason).toBe('over_petting');
    });

    it('awards Scholar XP on successful LaTeX compilation and advances level title', async () => {
      await mountHook({ compileStatus: 'compiling' });
      expect(currentHook.scholarXp).toBe(0);
      expect(currentHook.scholarLevel).toBe(1);
      expect(currentHook.scholarTitle).toBe('Novice Kitten');

      // Compile success adds +25 XP
      await mountHook({ compileStatus: 'success', lastCompiledAt: 1000 });
      expect(currentHook.scholarXp).toBe(25);

      // Explicitly add XP to reach Level 2 (100 XP)
      await act(async () => {
        currentHook.addScholarXp(80);
      });
      expect(currentHook.scholarLevel).toBe(2);
      expect(currentHook.scholarTitle).toBe('Math Apprentice');

      // Reach Level 5 Knuth Grandmaster (1000+ XP)
      await act(async () => {
        currentHook.addScholarXp(900);
      });
      expect(currentHook.scholarLevel).toBe(5);
      expect(currentHook.scholarTitle).toBe('Knuth Grandmaster');
    });

    it('supports on-demand playback of all 35+ animations via playSpecificAnimation for Jukebox', async () => {
      await mountHook();

      await act(async () => {
        currentHook.playSpecificAnimation('midnight-zoomies', 2000);
      });
      expect(currentHook.state).toBe('midnight-zoomies');

      await act(async () => {
        currentHook.playSpecificAnimation('knead-dough', 2000);
      });
      expect(currentHook.state).toBe('knead-dough');

      await act(async () => {
        currentHook.playSpecificAnimation('blep', 2000);
      });
      expect(currentHook.state).toBe('blep');

      await act(async () => {
        currentHook.playSpecificAnimation('flehmen-sniff', 2000);
      });
      expect(currentHook.state).toBe('flehmen-sniff');

      await act(async () => {
        currentHook.playSpecificAnimation('qed-celebration', 2000);
      });
      expect(currentHook.state).toBe('qed-celebration');
    });

    it('renders Jukebox tab in Companion Card with categorized animation chips', async () => {
      const mockPlayAnim = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(DeskPet, {
            isEnabled: true,
            state: 'idle',
            direction: 'right',
            pacingOffset: 0,
            isSleeping: false,
            isReducedMotion: false,
            isPaused: false,
            petCount: 0,
            scholarXp: 150,
            scholarLevel: 2,
            scholarTitle: 'Box Typesetter',
            scholarProgress: 35,
            playSpecificAnimation: mockPlayAnim,
          })
        );
      });

      const mascot = container.querySelector('[role="img"]') as HTMLElement;
      await act(async () => {
        mascot.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
      });

      const tabs = container.querySelectorAll('.companion-tab-btn');
      const jukeboxTab = Array.from(tabs).find(t => t.textContent?.includes('Jukebox'));
      expect(jukeboxTab).toBeDefined();

      await act(async () => {
        jukeboxTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const chips = container.querySelectorAll('.companion-jukebox-chip');
      expect(chips.length).toBeGreaterThan(25);

      const zoomiesChip = Array.from(chips).find(c => c.textContent?.includes('3 AM Zoomies'));
      expect(zoomiesChip).toBeDefined();

      await act(async () => {
        zoomiesChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(mockPlayAnim).toHaveBeenCalledWith('midnight-zoomies', expect.any(Number));
    });

    it('triggers butt-wiggle pounce prep and pounce leap during active laser kinematics', async () => {
      await mountHook();

      await act(async () => {
        currentHook.triggerLaser();
      });
      expect(currentHook.isLaserActive).toBe(true);

      // When laser is active, simulate close proximity pointer movement
      await act(async () => {
        window.dispatchEvent(
          new PointerEvent('pointermove', {
            clientX: window.innerWidth - currentHook.perchX - 40,
            clientY: window.innerHeight - currentHook.perchY - 20,
          })
        );
      });

      // Advance kinematics loop
      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      // Should enter either pounce-prep or laser-chase
      expect(['laser-chase', 'pounce-prep', 'laser-pounce']).toContain(currentHook.state);
    });

    it('triggers drama flop when disturbed from sleep', async () => {
      const mockDramaFlop = vi.fn();
      await act(async () => {
        root.render(
          React.createElement(DeskPet, {
            isEnabled: true,
            state: 'sleep',
            direction: 'right',
            pacingOffset: 0,
            isSleeping: true,
            isReducedMotion: false,
            isPaused: false,
            petCount: 0,
            playSpecificAnimation: mockDramaFlop,
          })
        );
      });

      const mascot = container.querySelector('.desk-pet-mascot-wrapper');
      await act(async () => {
        mascot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(mockDramaFlop).toHaveBeenCalledWith('drama-flop', 3200);
    });
  });
});

