import { useState, useEffect, useRef, useCallback } from 'react';

export type DeskPetActionState =
  | 'idle'
  | 'walk'
  | 'typing-paws'
  | 'compiling-scholar'
  | 'compile-success'
  | 'compile-fail'
  | 'yarn-chase'
  | 'sleep'
  | 'waking-stretch';

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
  triggerYarnChase: () => void;
  triggerPet: () => void;
  wakeUp: () => void;
}

const STORAGE_KEY = 'teeex_desk_pet_enabled';

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

  // State machine values
  const [state, setState] = useState<DeskPetActionState>('idle');
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [pacingOffset, setPacingOffset] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(false);
  const [petCount, setPetCount] = useState<number>(0);

  // References for active timeouts and state management
  const stateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCompileStatusRef = useRef<string>(compileStatus);
  const prevLastCompiledAtRef = useRef<number | undefined>(lastCompiledAt);
  const isTypingRef = useRef<boolean>(false);

  // Clear helper
  const clearStateTimer = useCallback(() => {
    if (stateTimerRef.current) {
      clearTimeout(stateTimerRef.current);
      stateTimerRef.current = null;
    }
  }, []);

  // 2. Reduced motion media query listener
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(media.matches);

    const handler = (e: MediaQueryListEvent) => {
      setIsReducedMotion(e.matches);
      if (e.matches) {
        setPacingOffset(0);
      }
    };
    media.addEventListener?.('change', handler);
    return () => {
      media.removeEventListener?.('change', handler);
    };
  }, []);

  // 3. Document visibility change listener (Freeze timers on tab backgrounding)
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsPaused(true);
        // Clear all active timers immediately so zero CPU cycles are spent while hidden
        if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
        if (typingSettleTimerRef.current) clearTimeout(typingSettleTimerRef.current);
      } else {
        setIsPaused(false);
        // Reset activity when returning to tab
        resetInactivityTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 4. Inactivity & Wakeup handling
  const resetInactivityTimer = useCallback(() => {
    if (!isEnabled || isPaused) return;

    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    inactivityTimerRef.current = setTimeout(() => {
      setState(current => {
        // Only sleep if currently idle or walk
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

  // 5. Anonymous Keystroke activity listener (strictly records timestamp pulse, NEVER inspects keys/content)
  useEffect(() => {
    if (!isEnabled || isPaused) return;

    const handleAnonymousActivity = () => {
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

  // 6. External isTypingActive pulse synchronization
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

  // 7. Compiler Lifecycle State Transitions
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
      stateTimerRef.current = setTimeout(() => {
        setState('idle');
      }, 4500);
      return;
    }
  }, [compileStatus, lastCompiledAt, isEnabled, isPaused, clearStateTimer, resetInactivityTimer]);

  // 8. Idle Pacing / Walk along dock ledge (only when not reduced motion and fully idle)
  useEffect(() => {
    if (!isEnabled || isPaused || isReducedMotion) {
      if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
      return;
    }

    // Every 24 seconds, perform a gentle pacing walk if remaining idle
    walkIntervalRef.current = setInterval(() => {
      setState(current => {
        if (current === 'idle' && !isTypingRef.current) {
          // Trigger a walk sequence for 3 seconds
          setDirection(prev => (prev === 'right' ? 'left' : 'right'));
          setPacingOffset(prev => (prev === 0 ? 48 : 0));

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
  }, [isEnabled, isPaused, isReducedMotion]);

  // 9. Interactive Actions: Yarn chase & Petting
  const triggerYarnChase = useCallback(() => {
    if (!isEnabled || isPaused) return;
    clearStateTimer();
    resetInactivityTimer();
    setState('yarn-chase');
    stateTimerRef.current = setTimeout(() => {
      setState('idle');
    }, 2800);
  }, [isEnabled, isPaused, clearStateTimer, resetInactivityTimer]);

  const triggerPet = useCallback(() => {
    if (!isEnabled || isPaused) return;
    setPetCount(prev => prev + 1);
    resetInactivityTimer();
    if (state === 'sleep') {
      wakeUp();
    }
  }, [isEnabled, isPaused, state, wakeUp, resetInactivityTimer]);

  // Cleanup on unmount or when disabled
  useEffect(() => {
    if (!isEnabled) {
      clearStateTimer();
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
      if (typingSettleTimerRef.current) clearTimeout(typingSettleTimerRef.current);
      setState('idle');
      setPacingOffset(0);
    } else {
      resetInactivityTimer();
    }
    return () => {
      clearStateTimer();
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
      if (typingSettleTimerRef.current) clearTimeout(typingSettleTimerRef.current);
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
    triggerYarnChase,
    triggerPet,
    wakeUp,
  };
}
