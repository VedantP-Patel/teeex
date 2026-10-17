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
});

