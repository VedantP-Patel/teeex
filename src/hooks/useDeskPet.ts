import { useState, useEffect, useRef, useCallback } from 'react';
import { DeskPetAudioEngine } from '../services/deskPetAudio';

export type DeskPetActionState =
  | 'idle'
  | 'walk'
  | 'typing-paws'
  | 'compiling-scholar'
  | 'compile-success'
  | 'compile-fail'
  | 'yarn-chase'
  | 'sleep'
  | 'waking-stretch'
  | 'lifted-scruff'
  | 'landing';

export type DeskPetSkin = 'tuxedo' | 'ginger' | 'calico' | 'siamese' | 'cyberpunk';

export const DESK_PET_SKINS: DeskPetSkin[] = ['tuxedo', 'ginger', 'calico', 'siamese', 'cyberpunk'];

export const MATH_DREAM_FORMULAS = [
  'e^{i\\pi} + 1 = 0',
  '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}',
  '\\TeX',
  '\\sum_{n=1}^\\infty \\frac{1}{n^2} = \\frac{\\pi^2}{6}',
  '\\mathcal{O}(1)',
  '\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J}',
];

export interface UseDeskPetOptions {
  compileStatus?: 'idle' | 'compiling' | 'success' | 'error';
  lastCompiledAt?: number | null;
  errorCount?: number;
  isTypingActive?: boolean;
  inactivitySleepMs?: number; // default: 45,000ms
}

export interface UseDeskPetReturn {
  isEnabled: boolean;
  setIsEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  state: DeskPetActionState;
  direction: 'left' | 'right';
  pacingOffset: number;
  isSleeping: boolean;
  isReducedMotion: boolean;
  isPaused: boolean;
  petCount: number;
  skin: DeskPetSkin;
  setSkin: (skin: DeskPetSkin) => void;
  cycleSkin: () => void;
  isSoundEnabled: boolean;
  toggleSound: () => void;
  perchX: number;
  dragTilt: number;
  isDragging: boolean;
  startDrag: (e: React.PointerEvent) => void;
  currentDreamFormula: string;
  triggerYarnChase: () => void;
  triggerPet: () => void;
  wakeUp: () => void;
  toggleSleep: () => void;
}

const STORAGE_KEY = 'teeex_desk_pet_enabled';
const SKIN_STORAGE_KEY = 'teeex_desk_pet_skin';
const SOUND_STORAGE_KEY = 'teeex_desk_pet_sound';
const PERCH_STORAGE_KEY = 'teeex_desk_pet_perch_x';

export function useDeskPet({
  compileStatus = 'idle',
  lastCompiledAt,
  errorCount: _errorCount = 0,
  isTypingActive = false,
  inactivitySleepMs = 45000,
}: UseDeskPetOptions = {}): UseDeskPetReturn {
  // 1. Off-by-default initialization: defaults strictly to false
  const [isEnabled, setIsEnabledState] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(STORAGE_KEY) === 'true';
      }
    } catch {
      // LocalStorage access restricted / SSR fallback
    }
    return false;
  });

  // 2. Coat Skin customization (default: 'tuxedo')
  const [skin, setSkinState] = useState<DeskPetSkin>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(SKIN_STORAGE_KEY);
        if (saved && DESK_PET_SKINS.includes(saved as DeskPetSkin)) {
          return saved as DeskPetSkin;
        }
      }
    } catch {
      // Ignore
    }
    return 'tuxedo';
  });

  const setSkin = useCallback((newSkin: DeskPetSkin) => {
    setSkinState(newSkin);
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, newSkin);
    } catch {
      // Ignore
    }
  }, []);

  const cycleSkin = useCallback(() => {
    setSkinState(prev => {
      const idx = DESK_PET_SKINS.indexOf(prev);
      const next = DESK_PET_SKINS[(idx + 1) % DESK_PET_SKINS.length];
      try {
        localStorage.setItem(SKIN_STORAGE_KEY, next);
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // 3. Sound engine (Strictly MUTED by default)
  const [isSoundEnabled, setIsSoundEnabledState] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(SOUND_STORAGE_KEY) === 'true';
      }
    } catch {
      // Ignore
    }
    return false;
  });

  const audioEngineRef = useRef<DeskPetAudioEngine | null>(null);
  if (!audioEngineRef.current && typeof window !== 'undefined') {
    audioEngineRef.current = new DeskPetAudioEngine(!isSoundEnabled);
  }

  const toggleSound = useCallback(() => {
    setIsSoundEnabledState(prev => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, next ? 'true' : 'false');
      } catch {
        // Ignore
      }
      if (audioEngineRef.current) {
        audioEngineRef.current.setMuted(!next);
      }
      return next;
    });
  }, []);

  // 4. Perch X Position along Dock Ledge (Default: 28px from right)
  const [perchX, setPerchX] = useState<number>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(PERCH_STORAGE_KEY);
        if (saved !== null) {
          const parsed = parseFloat(saved);
          if (!isNaN(parsed) && parsed >= 10 && parsed <= 1200) {
            return parsed;
          }
        }
      }
    } catch {
      // Ignore
    }
    return 28;
  });

  // State machine values
  const [state, setState] = useState<DeskPetActionState>('idle');
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [pacingOffset, setPacingOffset] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(false);
  const [petCount, setPetCount] = useState<number>(0);

  // Dragging & Scruff Lift Physics
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragTilt, setDragTilt] = useState<number>(0);
  const dragStartRef = useRef<{ clientX: number; initialPerchX: number; lastX: number; lastTime: number } | null>(null);

  // Math Dream Formulas
  const [currentDreamFormula, setCurrentDreamFormula] = useState<string>(MATH_DREAM_FORMULAS[0]);

  // References for active timers
  const stateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dreamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCompileStatusRef = useRef<string>(compileStatus);
  const prevLastCompiledAtRef = useRef<number | null | undefined>(lastCompiledAt);
  const isTypingRef = useRef<boolean>(false);

  // Clear helper
  const clearStateTimer = useCallback(() => {
    if (stateTimerRef.current) {
      clearTimeout(stateTimerRef.current);
      stateTimerRef.current = null;
    }
  }, []);

  const setIsEnabled = useCallback((enabled: boolean) => {
    setIsEnabledState(enabled);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const toggleEnabled = useCallback(() => {
    setIsEnabledState(prev => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
        }
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  // Reduced motion media query listener
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(media.matches);

    const handler = (e: MediaQueryListEvent) => {
      setIsReducedMotion(e.matches);
      if (e.matches) {
        setPacingOffset(0);
        setDragTilt(0);
      }
    };
    media.addEventListener?.('change', handler);
    return () => {
      media.removeEventListener?.('change', handler);
    };
  }, []);

  // Document visibility change listener (Freeze timers and audio on tab backgrounding)
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      const hidden = document.hidden;
      if (hidden) {
        setIsPaused(true);
        if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
        if (typingSettleTimerRef.current) clearTimeout(typingSettleTimerRef.current);
        if (dreamIntervalRef.current) clearInterval(dreamIntervalRef.current);
      } else {
        setIsPaused(false);
        resetInactivityTimer();
      }
      if (audioEngineRef.current) {
        audioEngineRef.current.handleVisibilityChange(hidden);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Inactivity & Wakeup handling
  const resetInactivityTimer = useCallback(() => {
    if (!isEnabled || isPaused) return;

    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    inactivityTimerRef.current = setTimeout(() => {
      setState(current => {
        if (current === 'idle' || current === 'walk') {
          return 'sleep';
        }
        return current;
      });
    }, inactivitySleepMs);
  }, [isEnabled, isPaused, inactivitySleepMs]);

  const wakeUp = useCallback(() => {
    resetInactivityTimer();
    setState(current => {
      if (current === 'sleep') {
        clearStateTimer();
        stateTimerRef.current = setTimeout(() => {
          setState('idle');
        }, 1200);
        return 'waking-stretch';
      }
      return current;
    });
  }, [resetInactivityTimer, clearStateTimer]);

  const toggleSleep = useCallback(() => {
    if (!isEnabled || isPaused) return;
    clearStateTimer();
    setState(current => {
      if (current === 'sleep') {
        stateTimerRef.current = setTimeout(() => {
          setState('idle');
        }, 1200);
        return 'waking-stretch';
      } else {
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
          inactivityTimerRef.current = null;
        }
        return 'sleep';
      }
    });
  }, [isEnabled, isPaused, clearStateTimer]);

  // Dream formula cycling during sleep
  useEffect(() => {
    if (state === 'sleep' && !isPaused && isEnabled) {
      dreamIntervalRef.current = setInterval(() => {
        setCurrentDreamFormula(prev => {
          const idx = MATH_DREAM_FORMULAS.indexOf(prev);
          return MATH_DREAM_FORMULAS[(idx + 1) % MATH_DREAM_FORMULAS.length];
        });
      }, 5500);
    } else {
      if (dreamIntervalRef.current) {
        clearInterval(dreamIntervalRef.current);
        dreamIntervalRef.current = null;
      }
    }
    return () => {
      if (dreamIntervalRef.current) clearInterval(dreamIntervalRef.current);
    };
  }, [state, isPaused, isEnabled]);

  // Anonymous Keystroke activity listener (strictly timestamp pulse, zero inspection)
  useEffect(() => {
    if (!isEnabled || isPaused) return;

    const handleAnonymousActivity = (e: Event) => {
      // If the event originated inside the desk pet container, ignore it so pet interaction doesn't count as editor typing
      if (e.target && (e.target as HTMLElement).closest?.('.desk-pet-container')) {
        return;
      }
      if (state === 'sleep') {
        wakeUp();
      } else {
        resetInactivityTimer();
      }
    };

    window.addEventListener('keydown', handleAnonymousActivity, { passive: true });
    window.addEventListener('pointerdown', handleAnonymousActivity, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleAnonymousActivity);
      window.removeEventListener('pointerdown', handleAnonymousActivity);
    };
  }, [isEnabled, isPaused, state, wakeUp, resetInactivityTimer]);

  // External isTypingActive pulse synchronization
  useEffect(() => {
    if (!isEnabled || isPaused) return;

    if (isTypingActive) {
      isTypingRef.current = true;
      clearStateTimer();
      setState(cur => {
        if (cur === 'sleep') {
          return 'waking-stretch';
        }
        if (cur === 'idle' || cur === 'walk') {
          return 'typing-paws';
        }
        return cur;
      });

      if (typingSettleTimerRef.current) {
        clearTimeout(typingSettleTimerRef.current);
      }
      typingSettleTimerRef.current = setTimeout(() => {
        isTypingRef.current = false;
        setState(cur => (cur === 'typing-paws' ? 'idle' : cur));
      }, 450);
    }
  }, [isTypingActive, isEnabled, isPaused, clearStateTimer]);

  // Compiler Lifecycle State Transitions
  useEffect(() => {
    if (!isEnabled || isPaused) return;

    const prevStatus = prevCompileStatusRef.current;
    const prevTimestamp = prevLastCompiledAtRef.current;
    prevCompileStatusRef.current = compileStatus;
    prevLastCompiledAtRef.current = lastCompiledAt;

    // A. Compiling active -> scholar reading manuscript mode
    if (compileStatus === 'compiling') {
      clearStateTimer();
      setState('compiling-scholar');
      resetInactivityTimer();
      return;
    }

    // B. Compilation resolved to Success
    if (compileStatus === 'success' && (prevStatus === 'compiling' || (lastCompiledAt && lastCompiledAt !== prevTimestamp))) {
      clearStateTimer();
      setState('compile-success');
      resetInactivityTimer();
      audioEngineRef.current?.playSuccessChime();
      stateTimerRef.current = setTimeout(() => {
        setState('idle');
      }, 3500);
      return;
    }

    // C. Compilation resolved to Error
    if (compileStatus === 'error' && (prevStatus === 'compiling' || (lastCompiledAt && lastCompiledAt !== prevTimestamp))) {
      clearStateTimer();
      setState('compile-fail');
      resetInactivityTimer();
      audioEngineRef.current?.playAlertBoop();
      stateTimerRef.current = setTimeout(() => {
        setState('idle');
      }, 4500);
      return;
    }
  }, [compileStatus, lastCompiledAt, isEnabled, isPaused, clearStateTimer, resetInactivityTimer]);

  // Idle Pacing / Walk along dock ledge
  useEffect(() => {
    if (!isEnabled || isPaused || isReducedMotion) {
      if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
      return;
    }

    walkIntervalRef.current = setInterval(() => {
      setState(current => {
        if (current === 'idle' && !isTypingRef.current && !isDragging) {
          setDirection(prev => (prev === 'right' ? 'left' : 'right'));
          setPacingOffset(prev => (prev === 0 ? 44 : 0));

          setTimeout(() => {
            setState(cur => (cur === 'walk' ? 'idle' : cur));
          }, 3200);

          return 'walk';
        }
        return current;
      });
    }, 24000);

    return () => {
      if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
    };
  }, [isEnabled, isPaused, isReducedMotion, isDragging]);

  // Interactive Actions: Yarn chase & Petting
  const triggerYarnChase = useCallback(() => {
    if (!isEnabled || isPaused) return;
    clearStateTimer();
    resetInactivityTimer();
    setState('yarn-chase');
    audioEngineRef.current?.playYarnChirp();
    stateTimerRef.current = setTimeout(() => {
      setState('idle');
    }, 2800);
  }, [isEnabled, isPaused, clearStateTimer, resetInactivityTimer]);

  const triggerPet = useCallback(() => {
    if (!isEnabled || isPaused) return;
    setPetCount(prev => prev + 1);
    resetInactivityTimer();
    audioEngineRef.current?.playPurr();
    if (state === 'sleep') {
      wakeUp();
    }
  }, [isEnabled, isPaused, state, wakeUp, resetInactivityTimer]);

  // Pointer Scruff Drag & Drop Mechanics
  const startDrag = useCallback((e: React.PointerEvent) => {
    if (isReducedMotion) return;
    // Prevent dragging from toolbar buttons
    if ((e.target as HTMLElement).closest('button')) return;

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    clearStateTimer();
    setIsDragging(true);
    setState('lifted-scruff');
    dragStartRef.current = {
      clientX: e.clientX,
      initialPerchX: perchX,
      lastX: e.clientX,
      lastTime: Date.now(),
    };

    const handlePointerMove = (moveEv: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = moveEv.clientX - dragStartRef.current.clientX;
      // Invert dx because perchX is measured from the right edge
      const newPerchX = Math.max(16, Math.min(window.innerWidth - 80, dragStartRef.current.initialPerchX - dx));
      setPerchX(newPerchX);

      // Velocity-based dynamic tilt angle
      const now = Date.now();
      const dt = Math.max(1, now - dragStartRef.current.lastTime);
      const vx = (moveEv.clientX - dragStartRef.current.lastX) / dt;
      const tilt = Math.max(-24, Math.min(24, vx * 12));
      setDragTilt(tilt);

      dragStartRef.current.lastX = moveEv.clientX;
      dragStartRef.current.lastTime = now;
    };

    const handlePointerUp = (upEv: PointerEvent) => {
      try {
        (upEv.target as HTMLElement).releasePointerCapture(upEv.pointerId);
      } catch {
        // Ignore
      }

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      setIsDragging(false);
      setDragTilt(0);
      dragStartRef.current = null;

      // Play landing squish settle
      setState('landing');
      stateTimerRef.current = setTimeout(() => {
        setState('idle');
      }, 350);

      // Persist chosen perch location
      setPerchX(cur => {
        try {
          localStorage.setItem(PERCH_STORAGE_KEY, cur.toString());
        } catch {
          // Ignore
        }
        return cur;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [isReducedMotion, perchX, clearStateTimer]);

  // Cleanup on unmount or when disabled
  useEffect(() => {
    if (!isEnabled) {
      clearStateTimer();
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
      if (typingSettleTimerRef.current) clearTimeout(typingSettleTimerRef.current);
      if (dreamIntervalRef.current) clearInterval(dreamIntervalRef.current);
      setState('idle');
      setPacingOffset(0);
      setIsDragging(false);
      setDragTilt(0);
    } else {
      resetInactivityTimer();
    }
    return () => {
      clearStateTimer();
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
      if (typingSettleTimerRef.current) clearTimeout(typingSettleTimerRef.current);
      if (dreamIntervalRef.current) clearInterval(dreamIntervalRef.current);
    };
  }, [isEnabled, clearStateTimer, resetInactivityTimer]);

  return {
    isEnabled,
    setIsEnabled,
    toggleEnabled,
    state,
    direction,
    pacingOffset: isReducedMotion ? 0 : pacingOffset,
    isSleeping: state === 'sleep',
    isReducedMotion,
    isPaused,
    petCount,
    skin,
    setSkin,
    cycleSkin,
    isSoundEnabled,
    toggleSound,
    perchX,
    dragTilt: isReducedMotion ? 0 : dragTilt,
    isDragging,
    startDrag,
    currentDreamFormula,
    triggerYarnChase,
    triggerPet,
    wakeUp,
    toggleSleep,
  };
}
