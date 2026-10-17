import { useState, useEffect, useRef, useCallback } from 'react';
import { DeskPetAudioEngine } from '../services/deskPetAudio';

export type DeskPetActionState =
  | 'idle'
  | 'walk'
  | 'typing-paws'
  | 'compiling-scholar'
  | 'compile-success'
  | 'compile-warning'
  | 'compile-fail'
  | 'knuth-texbook'
  | 'knuth-check'
  | 'yarn-chase'
  | 'laser-chase'
  | 'laser-pounce'
  | 'box-sit'
  | 'fish-feast'
  | 'tail-chase'
  | 'curious-peep'
  | 'peek-a-boo'
  | 'swat-cursor'
  | 'knock-mug'
  | 'nap-yawn'
  | 'belly-flop'
  | 'ear-scratch'
  | 'coffee-sip'
  | 'tail-flick'
  | 'origami-crane'
  | 'sleep'
  | 'waking-stretch'
  | 'lifted-scruff'
  | 'landing'
  | 'loaf'
  | 'yoga-stretch'
  | 'butterfly-bat'
  | 'face-wash'
  | 'fling-air';

export type DeskPetRoamMode = 'dock' | 'free';

export type DeskPetSkin = 'tuxedo' | 'ginger' | 'calico' | 'siamese' | 'cyberpunk';
export const DESK_PET_SKINS: DeskPetSkin[] = ['tuxedo', 'ginger', 'calico', 'siamese', 'cyberpunk'];

export type DeskPetAccessory = 'none' | 'mortarboard' | 'scarf' | 'detective' | 'bowtie';
export const DESK_PET_ACCESSORIES: DeskPetAccessory[] = ['none', 'mortarboard', 'scarf', 'detective', 'bowtie'];

export type DeskPetEntryVariant = 'box' | 'portal' | 'jump';
export type DeskPetExitVariant = 'box' | 'portal' | 'smoke';

export const MATH_DREAM_FORMULAS = [
  'e^{i\\pi} + 1 = 0',
  '\\int_{-\\infty}^\\infty e^{-x^2} dx = \\sqrt{\\pi}',
  '\\oint_{\\partial \\Omega} \\omega = \\int_\\Omega d\\omega',
  '\\nabla \\cdot \\mathbf{B} = 0',
  '\\sum_{n=1}^\\infty \\frac{1}{n^2} = \\frac{\\pi^2}{6}',
  '\\zeta(s) = \\sum_{n=1}^\\infty \\frac{1}{n^s}',
  '\\mathcal{H}\\psi = E\\psi',
  '\\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n = e',
  '\\mathcal{L}\\{\\dot{x}\\} = sX(s) - x(0)',
  '\\TeX \\; \\text{v}\\pi',
];

export interface UseDeskPetOptions {
  compileStatus?: 'idle' | 'compiling' | 'success' | 'error';
  lastCompiledAt?: number | null;
  errorCount?: number;
  warningCount?: number;
  isTypingActive?: boolean;
  inactivitySleepMs?: number; // default: 45,000ms
}

export interface UseDeskPetReturn {
  isEnabled: boolean;
  isExiting: boolean;
  entryVariant: DeskPetEntryVariant;
  exitVariant: DeskPetExitVariant;
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
  accessory: DeskPetAccessory;
  setAccessory: (acc: DeskPetAccessory) => void;
  cycleAccessory: () => void;
  isSoundEnabled: boolean;
  toggleSound: () => void;
  volume: number;
  setVolume: (vol: number) => void;
  perchX: number;
  perchY: number;
  isSnappedToDock: boolean;
  resetPositionToDock: () => void;
  dragTilt: number;
  isDragging: boolean;
  startDrag: (e: React.PointerEvent) => void;
  currentDreamFormula: string;
  triggerYarnChase: () => void;
  triggerPet: () => void;
  wakeUp: () => void;
  toggleSleep: () => void;
  // Stage 15 additions:
  roamMode: DeskPetRoamMode;
  setRoamMode: (mode: DeskPetRoamMode) => void;
  toggleRoamMode: () => void;
  isTransitioning: boolean;
  isLaserActive: boolean;
  laserCoords: { x: number; y: number };
  triggerLaser: () => void;
  triggerBox: () => void;
  triggerFish: () => void;
  triggerKnuthCelebration: () => void;
  triggerPeekABoo: () => void;
  triggerSwatCursor: () => void;
  triggerKnockMug: () => void;
  triggerBellyFlop: () => void;
  triggerEarScratch: () => void;
  triggerNapYawn: () => void;
  triggerRoam: () => void;
}

const STORAGE_KEY = 'teeex_desk_pet_enabled';
const SKIN_STORAGE_KEY = 'teeex_desk_pet_skin';
const SOUND_STORAGE_KEY = 'teeex_desk_pet_sound';
const VOLUME_STORAGE_KEY = 'teeex_desk_pet_volume';
const ACCESSORY_STORAGE_KEY = 'teeex_desk_pet_accessory';
const PERCH_X_STORAGE_KEY = 'teeex_desk_pet_perch_x';
const PERCH_Y_STORAGE_KEY = 'teeex_desk_pet_perch_y';
const SNAPPED_STORAGE_KEY = 'teeex_desk_pet_is_snapped';
const ROAM_MODE_STORAGE_KEY = 'teeex_desk_pet_roam_mode';

export function useDeskPet({
  compileStatus = 'idle',
  lastCompiledAt,
  errorCount: _errorCount = 0,
  warningCount = 0,
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

  const [isExiting, setIsExiting] = useState<boolean>(false);
  const [entryVariant, setEntryVariant] = useState<DeskPetEntryVariant>('box');
  const [exitVariant, setExitVariant] = useState<DeskPetExitVariant>('smoke');

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
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SKIN_STORAGE_KEY, newSkin);
      }
    } catch {
      // Ignore
    }
  }, []);

  const cycleSkin = useCallback(() => {
    setSkinState(prev => {
      const idx = DESK_PET_SKINS.indexOf(prev);
      const next = DESK_PET_SKINS[(idx + 1) % DESK_PET_SKINS.length];
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(SKIN_STORAGE_KEY, next);
        }
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // 3. Academic Accessory Outfits
  const [accessory, setAccessoryState] = useState<DeskPetAccessory>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(ACCESSORY_STORAGE_KEY);
        if (saved && DESK_PET_ACCESSORIES.includes(saved as DeskPetAccessory)) {
          return saved as DeskPetAccessory;
        }
      }
    } catch {
      // Ignore
    }
    return 'none';
  });

  const setAccessory = useCallback((acc: DeskPetAccessory) => {
    setAccessoryState(acc);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(ACCESSORY_STORAGE_KEY, acc);
      }
    } catch {
      // Ignore
    }
  }, []);

  const cycleAccessory = useCallback(() => {
    setAccessoryState(prev => {
      const idx = DESK_PET_ACCESSORIES.indexOf(prev);
      const next = DESK_PET_ACCESSORIES[(idx + 1) % DESK_PET_ACCESSORIES.length];
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(ACCESSORY_STORAGE_KEY, next);
        }
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // 4. Procedural Audio Engine (Muted by default)
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(SOUND_STORAGE_KEY) === 'true';
      }
    } catch {
      // Ignore
    }
    return false;
  });

  const [volume, setVolumeState] = useState<number>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(VOLUME_STORAGE_KEY);
        if (saved) return Math.max(0, Math.min(1, parseFloat(saved)));
      }
    } catch {
      // Ignore
    }
    return 0.6;
  });

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    audioEngineRef.current?.setVolume(clamped);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(VOLUME_STORAGE_KEY, clamped.toString());
      }
    } catch {
      // Ignore
    }
  }, []);

  const audioEngineRef = useRef<DeskPetAudioEngine | null>(null);
  useEffect(() => {
    audioEngineRef.current = new DeskPetAudioEngine(!isSoundEnabled, volume);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSound = useCallback(() => {
    setIsSoundEnabled(prev => {
      const next = !prev;
      audioEngineRef.current?.setMuted(!next);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(SOUND_STORAGE_KEY, next ? 'true' : 'false');
        }
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // 5. 2D Coordinates & Ledge Snapping
  const [perchX, setPerchX] = useState<number>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(PERCH_X_STORAGE_KEY);
        if (saved) {
          const val = parseInt(saved, 10);
          if (!isNaN(val) && val > 0) return val;
        }
      }
    } catch {
      // Ignore
    }
    return 28;
  });

  const [perchY, setPerchY] = useState<number>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(PERCH_Y_STORAGE_KEY);
        if (saved) {
          const val = parseInt(saved, 10);
          if (!isNaN(val) && val >= 0) return val;
        }
      }
    } catch {
      // Ignore
    }
    return 36;
  });

  const [isSnappedToDock, setIsSnappedToDock] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(SNAPPED_STORAGE_KEY);
        if (saved !== null) return saved === 'true';
      }
    } catch {
      // Ignore
    }
    return true;
  });

  const resetPositionToDock = useCallback(() => {
    setPerchX(28);
    setPerchY(36);
    setIsSnappedToDock(true);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(PERCH_X_STORAGE_KEY, '28');
        window.localStorage.setItem(PERCH_Y_STORAGE_KEY, '36');
        window.localStorage.setItem(SNAPPED_STORAGE_KEY, 'true');
      }
    } catch {
      // Ignore
    }
  }, []);

  // 6. Action state, physics & transitions
  const [state, setState] = useState<DeskPetActionState>('idle');
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [pacingOffset, setPacingOffset] = useState<number>(0);
  const [petCount, setPetCount] = useState<number>(0);
  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragTilt, setDragTilt] = useState<number>(0);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [currentDreamFormula, setCurrentDreamFormula] = useState<string>(MATH_DREAM_FORMULAS[0]);

  // Stage 15: Roam Mode ('dock' | 'free')
  const [roamMode, setRoamModeState] = useState<DeskPetRoamMode>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(ROAM_MODE_STORAGE_KEY);
        if (saved === 'free' || saved === 'dock') return saved as DeskPetRoamMode;
      }
    } catch {
      // Ignore
    }
    return 'dock';
  });

  const setRoamMode = useCallback((mode: DeskPetRoamMode) => {
    setRoamModeState(mode);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(ROAM_MODE_STORAGE_KEY, mode);
      }
    } catch {
      // Ignore
    }
  }, []);

  const toggleRoamMode = useCallback(() => {
    setRoamModeState(prev => {
      const next = prev === 'dock' ? 'free' : 'dock';
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(ROAM_MODE_STORAGE_KEY, next);
        }
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // Stage 15: Red Laser Pointer Tracking Mode
  const [isLaserActive, setIsLaserActive] = useState<boolean>(false);
  const [laserCoords, setLaserCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    initialPerchX: number;
    initialPerchY: number;
    lastX: number;
    lastY: number;
    lastTime: number;
    vx: number;
    vy: number;
  } | null>(null);

  // References for active timers
  const stateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loafTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const organicScheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walkStepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  // Smooth State Transition Helper (triggers 180ms ease blending)
  const transitionTo = useCallback((nextState: DeskPetActionState, durationMs?: number, nextCallback?: () => void) => {
    clearStateTimer();

    setIsTransitioning(true);
    transitionTimerRef.current = setTimeout(() => {
      setIsTransitioning(false);
    }, 180);

    setState(nextState);

    if (durationMs) {
      stateTimerRef.current = setTimeout(() => {
        if (nextCallback) {
          nextCallback();
        } else {
          setState('idle');
        }
      }, durationMs);
    }
  }, [clearStateTimer]);

  const setIsEnabled = useCallback((enabled: boolean) => {
    if (enabled) {
      // Pick random entry variant
      const entries: DeskPetEntryVariant[] = ['box', 'portal', 'jump'];
      setEntryVariant(entries[Math.floor(Math.random() * entries.length)]);
      setIsExiting(false);
      setIsEnabledState(true);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(STORAGE_KEY, 'true');
        }
      } catch {
        // Ignore
      }
    } else {
      // Pick random exit variant and animate before unmounting
      const exits: DeskPetExitVariant[] = ['box', 'portal', 'smoke'];
      setExitVariant(exits[Math.floor(Math.random() * exits.length)]);
      setIsExiting(true);
      setIsEnabledState(false);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(STORAGE_KEY, 'false');
        }
      } catch {
        // Ignore
      }
      setTimeout(() => {
        setIsExiting(false);
      }, 550);
    }
  }, []);

  const toggleEnabled = useCallback(() => {
    setIsEnabled(!isEnabled);
  }, [isEnabled, setIsEnabled]);

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

  // Inactivity & Loaf Progression: idle -> loaf (18s) -> sleep (45s)
  const resetInactivityTimer = useCallback(() => {
    if (!isEnabled || isPaused) return;

    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (loafTimerRef.current) clearTimeout(loafTimerRef.current);

    // 18s idle loaf trigger
    loafTimerRef.current = setTimeout(() => {
      clearStateTimer();
      if (organicScheduleTimerRef.current) {
        clearTimeout(organicScheduleTimerRef.current);
        organicScheduleTimerRef.current = null;
      }
      setState(current => {
        const nonInterruptible: DeskPetActionState[] = [
          'compiling-scholar',
          'compile-success',
          'compile-fail',
          'typing-paws',
          'yarn-chase',
          'laser-chase',
          'box-sit',
          'fish-feast',
          'knuth-check',
          'lifted-scruff',
          'sleep',
        ];
        if (!nonInterruptible.includes(current)) {
          return 'loaf';
        }
        return current;
      });
    }, 18000);

    // 45s sleep trigger
    inactivityTimerRef.current = setTimeout(() => {
      clearStateTimer();
      if (organicScheduleTimerRef.current) {
        clearTimeout(organicScheduleTimerRef.current);
        organicScheduleTimerRef.current = null;
      }
      setState(current => {
        const nonInterruptible: DeskPetActionState[] = [
          'compiling-scholar',
          'compile-success',
          'compile-fail',
          'typing-paws',
          'yarn-chase',
          'laser-chase',
          'lifted-scruff',
        ];
        if (!nonInterruptible.includes(current)) {
          return 'sleep';
        }
        return current;
      });
    }, inactivitySleepMs);
  }, [isEnabled, isPaused, inactivitySleepMs, clearStateTimer]);

  // Tab visibility listener (zero CPU/timer consumption when hidden)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const hidden = document.hidden;
      if (hidden) {
        setIsPaused(true);
        clearStateTimer();
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        if (loafTimerRef.current) clearTimeout(loafTimerRef.current);
        if (organicScheduleTimerRef.current) clearTimeout(organicScheduleTimerRef.current);
        if (walkStepTimerRef.current) clearTimeout(walkStepTimerRef.current);
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
  }, [clearStateTimer, resetInactivityTimer]);

  const wakeUp = useCallback(() => {
    resetInactivityTimer();
    setState(current => {
      if (current === 'sleep' || current === 'loaf') {
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
        if (loafTimerRef.current) {
          clearTimeout(loafTimerRef.current);
          loafTimerRef.current = null;
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
      if (state === 'sleep' || state === 'loaf') {
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

  // External isTypingActive pulse synchronization (Bongo Cat Mode)
  useEffect(() => {
    if (!isEnabled || isPaused) return;

    if (isTypingActive) {
      isTypingRef.current = true;
      clearStateTimer();
      audioEngineRef.current?.playKeyClick();
      setState(cur => {
        if (cur === 'sleep' || cur === 'loaf') {
          return 'waking-stretch';
        }
        if (cur === 'idle' || cur === 'walk' || cur === 'yoga-stretch' || cur === 'face-wash' || cur === 'tail-flick') {
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

  // Compiler Lifecycle State Transitions with Diagnostic Empathy
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
      resetInactivityTimer();

      if (warningCount > 0) {
        // Warning build: typesetter tape measure inspection
        setState('compile-warning');
        audioEngineRef.current?.playWarningChime();
        stateTimerRef.current = setTimeout(() => {
          setState('idle');
        }, 3200);
      } else {
        // Clean zero-warning compilation: Q.E.D. celebration
        setState('compile-success');
        audioEngineRef.current?.playSuccessChime();
        stateTimerRef.current = setTimeout(() => {
          setState('idle');
        }, 3500);
      }
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
  }, [compileStatus, lastCompiledAt, warningCount, isEnabled, isPaused, clearStateTimer, resetInactivityTimer]);

  // Autonomous Waypoint Navigation Stroll
  const triggerRoam = useCallback(() => {
    if (!isEnabled || isPaused || isReducedMotion || isTypingRef.current || isDragging) return;

    if (roamMode === 'dock') {
      // Dock Patrol Mode: Choose dynamic offset along status ledge
      const maxLedgeOffset = typeof window !== 'undefined' ? Math.min(window.innerWidth - 140, 360) : 300;
      const targetOffset = Math.round(Math.random() * maxLedgeOffset);
      const isMovingLeft = targetOffset > pacingOffset;
      setDirection(isMovingLeft ? 'left' : 'right');

      const distance = Math.abs(targetOffset - pacingOffset);
      const duration = Math.max(1200, Math.min(3000, distance * 10));

      transitionTo('walk', duration, () => {
        transitionTo('landing', 300, () => {
          setState('idle');
        });
      });
      setPacingOffset(targetOffset);
    } else {
      // Free Roam Desktop Mode: Choose safe 2D coordinates across screen
      const maxW = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const maxH = typeof window !== 'undefined' ? window.innerHeight : 800;

      const targetX = Math.round(Math.max(28, Math.min(maxW - 80, Math.random() * (maxW - 120))));
      const targetY = Math.round(Math.max(36, Math.min(maxH - 100, Math.random() * (maxH - 140))));

      setDirection(targetX > perchX ? 'left' : 'right');
      const dx = targetX - perchX;
      const dy = targetY - perchY;
      const dist = Math.hypot(dx, dy);
      const duration = Math.max(1400, Math.min(3600, dist * 8));

      transitionTo('walk', duration, () => {
        transitionTo('landing', 300, () => {
          setState('idle');
        });
      });

      setPerchX(targetX);
      setPerchY(targetY);
      setIsSnappedToDock(targetY <= 68);
    }
  }, [isEnabled, isPaused, isReducedMotion, isDragging, roamMode, pacingOffset, perchX, perchY, transitionTo]);

  // Stage 15: Dynamic Organic Behavior Scheduler (Every 5–9.5s when idle)
  useEffect(() => {
    if (!isEnabled || isPaused || isReducedMotion) {
      if (organicScheduleTimerRef.current) clearTimeout(organicScheduleTimerRef.current);
      return;
    }

    const scheduleNextBehavior = () => {
      const delay = 5000 + Math.random() * 4500; // 5000ms - 9500ms
      organicScheduleTimerRef.current = setTimeout(() => {
        if (state === 'idle' && !isTypingRef.current && !isDragging && !isLaserActive) {
          const roll = Math.random();

          if (roll < 0.08) {
            // 8% Sleepy Nap Yawn
            audioEngineRef.current?.playYawnSigh();
            transitionTo('nap-yawn', 2400);
          } else if (roll < 0.15) {
            // 7% Playful Belly-Up Flop
            audioEngineRef.current?.playPurr(1200);
            transitionTo('belly-flop', 2600);
          } else if (roll < 0.22) {
            // 7% Rapid Ear Scratch with Hind Paw
            transitionTo('ear-scratch', 2200);
          } else if (roll < 0.30) {
            // 8% Peek-a-Boo Hiding behind ledge
            audioEngineRef.current?.playMeow();
            transitionTo('peek-a-boo', 2600);
          } else if (roll < 0.37) {
            // 7% Playful Cursor Swat
            audioEngineRef.current?.playMeow();
            transitionTo('swat-cursor', 1800);
          } else if (roll < 0.43) {
            // 6% Knock Coffee Mug Antics
            audioEngineRef.current?.playMugClink();
            transitionTo('knock-mug', 2400);
          } else if (roll < 0.51) {
            // 8% Downward Cat Yoga Stretch
            transitionTo('yoga-stretch', 2200);
          } else if (roll < 0.59) {
            // 8% Attentive Face & Paw Wash
            transitionTo('face-wash', 2200);
          } else if (roll < 0.65) {
            // 6% Playful Butterfly Batting
            transitionTo('butterfly-bat', 2400);
          } else if (roll < 0.71) {
            // 6% Tail Chase Spin
            transitionTo('tail-chase', 2000);
          } else if (roll < 0.78) {
            // 7% Donald Knuth's TeXbook Celebration
            audioEngineRef.current?.playSuccessChime();
            transitionTo('knuth-texbook', 3200);
          } else if (roll < 0.86) {
            // 8% Peaceful Loaf Pose
            transitionTo('loaf', 3800);
          } else if (roll < 0.90) {
            // 4% \hbox Box Sit Peek
            audioEngineRef.current?.playBoxThud();
            transitionTo('box-sit', 3000);
          } else {
            // 10% Autonomous Waypoint Stroll
            triggerRoam();
          }
        }
        scheduleNextBehavior();
      }, delay);
    };

    scheduleNextBehavior();

    return () => {
      if (organicScheduleTimerRef.current) clearTimeout(organicScheduleTimerRef.current);
    };
  }, [isEnabled, isPaused, isReducedMotion, state, isDragging, isLaserActive, transitionTo, triggerRoam]);

  // Stage 15: Interactive Toys & Quick Action Triggers
  const triggerYarnChase = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playYarnChirp();
    transitionTo('yarn-chase', 2800);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerLaser = useCallback(() => {
    if (!isEnabled || isPaused) return;
    setIsLaserActive(prev => {
      const next = !prev;
      if (next) {
        audioEngineRef.current?.playLaserChirp();
        transitionTo('laser-chase', 4500, () => {
          setIsLaserActive(false);
          setState('idle');
        });
      } else {
        setState('idle');
      }
      return next;
    });
  }, [isEnabled, isPaused, transitionTo]);

  const triggerBox = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playBoxThud();
    transitionTo('box-sit', 3400);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerFish = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playTreatCrunch();
    transitionTo('fish-feast', 2800);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerKnuthCelebration = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playSuccessChime();
    transitionTo('knuth-check', 3600);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerPeekABoo = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playMeow();
    transitionTo('peek-a-boo', 2600);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerSwatCursor = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playMeow();
    transitionTo('swat-cursor', 1800);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerKnockMug = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playMugClink();
    transitionTo('knock-mug', 2400);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerBellyFlop = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playPurr(1400);
    transitionTo('belly-flop', 2600);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerEarScratch = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    transitionTo('ear-scratch', 2200);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerNapYawn = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playYawnSigh();
    transitionTo('nap-yawn', 2400);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerPet = useCallback(() => {
    if (!isEnabled || isPaused) return;
    setPetCount(prev => prev + 1);
    resetInactivityTimer();
    audioEngineRef.current?.playPurr();
    if (state === 'sleep' || state === 'loaf') {
      wakeUp();
    }
  }, [isEnabled, isPaused, state, wakeUp, resetInactivityTimer]);

  // Pointer move tracking for Laser Pointer Mode
  useEffect(() => {
    if (!isLaserActive || !isEnabled || isPaused) return;

    const handlePointerMove = (e: PointerEvent) => {
      setLaserCoords({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [isLaserActive, isEnabled, isPaused]);

  // 2D Pointer Drag, Ledge Snap & Shimeji-Style Fling Physics
  const startDrag = useCallback((e: React.PointerEvent) => {
    if (isReducedMotion) return;
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
      clientY: e.clientY,
      initialPerchX: perchX,
      initialPerchY: perchY,
      lastX: e.clientX,
      lastY: e.clientY,
      lastTime: Date.now(),
      vx: 0,
      vy: 0,
    };

    const handlePointerMove = (moveEv: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = moveEv.clientX - dragStartRef.current.clientX;
      const dy = moveEv.clientY - dragStartRef.current.clientY;

      // Invert dx because perchX is measured from right edge; invert dy because perchY is from bottom
      const newPerchX = Math.max(16, Math.min(window.innerWidth - 80, dragStartRef.current.initialPerchX - dx));
      const newPerchY = Math.max(16, Math.min(window.innerHeight - 80, dragStartRef.current.initialPerchY + dy));

      setPerchX(newPerchX);
      setPerchY(newPerchY);

      const now = Date.now();
      const dt = Math.max(1, now - dragStartRef.current.lastTime);
      const vx = (moveEv.clientX - dragStartRef.current.lastX) / dt;
      const vy = (moveEv.clientY - dragStartRef.current.lastY) / dt;

      dragStartRef.current.vx = vx;
      dragStartRef.current.vy = vy;
      dragStartRef.current.lastX = moveEv.clientX;
      dragStartRef.current.lastY = moveEv.clientY;
      dragStartRef.current.lastTime = now;

      const tilt = Math.max(-24, Math.min(24, vx * 12));
      setDragTilt(tilt);
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

      const dragInfo = dragStartRef.current;
      dragStartRef.current = null;

      // 1. Shimeji Fling Detection: If released with high velocity, animate fling inertia
      const speed = dragInfo ? Math.sqrt(dragInfo.vx * dragInfo.vx + dragInfo.vy * dragInfo.vy) : 0;
      if (speed > 0.45) {
        setState('fling-air');
        setTimeout(() => {
          setState('landing');
          setTimeout(() => setState('idle'), 350);
        }, 400);
      } else {
        setState('landing');
        stateTimerRef.current = setTimeout(() => {
          setState('idle');
        }, 350);
      }

      // 2. Dock Ledge Magnetic Snap: If within 64px of bottom dock ledge line, snap to dock
      setPerchY(curY => {
        const isNearLedge = curY <= 68;
        setIsSnappedToDock(isNearLedge);
        try {
          localStorage.setItem(SNAPPED_STORAGE_KEY, isNearLedge ? 'true' : 'false');
          localStorage.setItem(PERCH_Y_STORAGE_KEY, isNearLedge ? '36' : curY.toString());
        } catch {
          // Ignore
        }
        return isNearLedge ? 36 : curY;
      });

      setPerchX(curX => {
        try {
          localStorage.setItem(PERCH_X_STORAGE_KEY, curX.toString());
        } catch {
          // Ignore
        }
        return curX;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [isReducedMotion, perchX, perchY, clearStateTimer]);

  // Cleanup on unmount or when disabled
  useEffect(() => {
    if (!isEnabled) {
      clearStateTimer();
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (loafTimerRef.current) clearTimeout(loafTimerRef.current);
      if (organicScheduleTimerRef.current) clearTimeout(organicScheduleTimerRef.current);
      if (walkStepTimerRef.current) clearTimeout(walkStepTimerRef.current);
      if (typingSettleTimerRef.current) clearTimeout(typingSettleTimerRef.current);
      if (dreamIntervalRef.current) clearInterval(dreamIntervalRef.current);
      setState('idle');
      setPacingOffset(0);
      setIsDragging(false);
      setDragTilt(0);
      setIsLaserActive(false);
    } else {
      resetInactivityTimer();
    }
    return () => {
      clearStateTimer();
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (loafTimerRef.current) clearTimeout(loafTimerRef.current);
      if (organicScheduleTimerRef.current) clearTimeout(organicScheduleTimerRef.current);
      if (walkStepTimerRef.current) clearTimeout(walkStepTimerRef.current);
      if (typingSettleTimerRef.current) clearTimeout(typingSettleTimerRef.current);
      if (dreamIntervalRef.current) clearInterval(dreamIntervalRef.current);
    };
  }, [isEnabled, clearStateTimer, resetInactivityTimer]);

  return {
    isEnabled,
    isExiting,
    entryVariant,
    exitVariant,
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
    accessory,
    setAccessory,
    cycleAccessory,
    isSoundEnabled,
    toggleSound,
    volume,
    setVolume,
    perchX,
    perchY,
    isSnappedToDock,
    resetPositionToDock,
    dragTilt: isReducedMotion ? 0 : dragTilt,
    isDragging,
    startDrag,
    currentDreamFormula,
    triggerYarnChase,
    triggerPet,
    wakeUp,
    toggleSleep,
    // Stage 15 additions:
    roamMode,
    setRoamMode,
    toggleRoamMode,
    isTransitioning,
    isLaserActive,
    laserCoords,
    triggerLaser,
    triggerBox,
    triggerFish,
    triggerKnuthCelebration,
    triggerPeekABoo,
    triggerSwatCursor,
    triggerKnockMug,
    triggerBellyFlop,
    triggerEarScratch,
    triggerNapYawn,
    triggerRoam,
  };
}
