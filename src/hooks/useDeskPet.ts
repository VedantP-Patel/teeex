import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  | 'fling-air'
  // Stage 19: Feline Annoyance Engine States
  | 'airplane-ears'
  | 'annoyed-hiss'
  | 'swat-aggressive'
  | 'tail-thump'
  | 'cold-shoulder'
  | 'facepalm-paw'
  | 'paper-shred'
  | 'glare-judge'
  | 'dizzy-wobble'
  | 'keyboard-sprawl'
  | 'hairball-cough'
  | 'drama-flop'
  // Stage 19: Authentic Feline & Scholar Behaviors
  | 'pounce-prep'
  | 'flehmen-sniff'
  | 'knead-dough'
  | 'midnight-zoomies'
  | 'slow-blink'
  | 'cheek-bunt'
  | 'cello-leg'
  | 'blep'
  | 'math-zoomies'
  | 'loaf-wiggle'
  | 'focus-scholar'
  | 'qed-celebration';

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

export function getScholarLevel(xp: number): { level: number; title: string; nextXp: number; progress: number } {
  if (xp < 100) return { level: 1, title: 'Novice Kitten', nextXp: 100, progress: Math.max(0, Math.min(1, xp / 100)) };
  if (xp < 300) return { level: 2, title: 'Math Apprentice', nextXp: 300, progress: Math.max(0, Math.min(1, (xp - 100) / 200)) };
  if (xp < 600) return { level: 3, title: 'TeX Journeyman', nextXp: 600, progress: Math.max(0, Math.min(1, (xp - 300) / 300)) };
  if (xp < 1000) return { level: 4, title: 'Macro Wizard', nextXp: 1000, progress: Math.max(0, Math.min(1, (xp - 600) / 400)) };
  return { level: 5, title: 'Knuth Grandmaster', nextXp: 2000, progress: Math.max(0, Math.min(1, (xp - 1000) / 1000)) };
}

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
  // Stage 19 additions:
  annoyanceLevel: number;
  annoyanceReason: string | null;
  scholarXp: number;
  scholarLevel: number;
  scholarTitle: string;
  scholarProgress: number;
  addScholarXp: (amount: number) => void;
  playSpecificAnimation: (anim: DeskPetActionState, durationMs?: number) => void;
  triggerAnnoyanceReaction: (reason?: string) => void;
  triggerPouncePrep: () => void;
  triggerKneadDough: () => void;
  triggerMidnightZoomies: () => void;
  triggerSlowBlink: () => void;
  triggerCheekBunt: () => void;
  triggerCelloLeg: () => void;
  triggerBlep: () => void;
  triggerFlehmenSniff: () => void;
  triggerMathZoomies: () => void;
  triggerLoafWiggle: () => void;
  triggerFocusScholar: () => void;
  triggerQedCelebration: () => void;
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
const SCHOLAR_XP_STORAGE_KEY = 'teeex_desk_pet_scholar_xp';

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
    setPacingOffset(0);
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

  // Stage 19: Feline Annoyance Engine
  const [annoyanceLevel, setAnnoyanceLevel] = useState<number>(0);
  const [annoyanceReason, setAnnoyanceReason] = useState<string | null>(null);

  // Stage 19: LaTeX Scholar Progression XP
  const [scholarXp, setScholarXp] = useState<number>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(SCHOLAR_XP_STORAGE_KEY);
        if (saved) {
          const val = parseInt(saved, 10);
          if (!isNaN(val) && val >= 0) return val;
        }
      }
    } catch {
      // Ignore
    }
    return 0;
  });

  const addScholarXp = useCallback((amount: number) => {
    setScholarXp(prev => {
      const next = prev + amount;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(SCHOLAR_XP_STORAGE_KEY, next.toString());
        }
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const scholarInfo = useMemo(() => getScholarLevel(scholarXp), [scholarXp]);

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
  const dragStartTimeRef = useRef<number | null>(null);

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
  const stateRef = useRef<DeskPetActionState>(state);
  const petTimestampsRef = useRef<number[]>([]);
  const consecutiveErrorsRef = useRef<number>(0);

  // Synchronize stateRef with current state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Annoyance passive decay: cool down by 10 every 2.5s if left alone
  useEffect(() => {
    if (!isEnabled || isPaused || annoyanceLevel <= 0) return;
    const decayTimer = setInterval(() => {
      setAnnoyanceLevel(prev => Math.max(0, prev - 10));
    }, 2500);
    return () => clearInterval(decayTimer);
  }, [isEnabled, isPaused, annoyanceLevel]);

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
      consecutiveErrorsRef.current = 0;

      if (warningCount > 0) {
        // Warning build: typesetter tape measure inspection
        setState('compile-warning');
        audioEngineRef.current?.playWarningChime();
        addScholarXp(10);
        stateTimerRef.current = setTimeout(() => {
          setState('idle');
        }, 3200);
      } else {
        // Clean zero-warning compilation: Q.E.D. celebration
        setState('compile-success');
        audioEngineRef.current?.playSuccessChime();
        addScholarXp(25);
        stateTimerRef.current = setTimeout(() => {
          setState('idle');
        }, 3500);
      }
      return;
    }

    // C. Compilation resolved to Error
    if (compileStatus === 'error' && (prevStatus === 'compiling' || (lastCompiledAt && lastCompiledAt !== prevTimestamp))) {
      clearStateTimer();
      resetInactivityTimer();
      consecutiveErrorsRef.current = (consecutiveErrorsRef.current || 0) + 1;

      if (consecutiveErrorsRef.current >= 2) {
        // Feline frustration at consecutive LaTeX errors
        setAnnoyanceReason('compile_frustration');
        setAnnoyanceLevel(prev => Math.min(100, prev + 35));
        setState('facepalm-paw');
        audioEngineRef.current?.playAlertBoop();
        stateTimerRef.current = setTimeout(() => {
          setState('idle');
        }, 3200);
      } else {
        setState('compile-fail');
        audioEngineRef.current?.playAlertBoop();
        stateTimerRef.current = setTimeout(() => {
          setState('idle');
        }, 4500);
      }
      return;
    }
  }, [compileStatus, lastCompiledAt, warningCount, isEnabled, isPaused, clearStateTimer, resetInactivityTimer, addScholarXp]);

  // Autonomous Waypoint Navigation Stroll
  const triggerRoam = useCallback(() => {
    if (!isEnabled || isPaused || isReducedMotion || isTypingRef.current || isDragging) return;

    if (roamMode === 'dock') {
      // Dock Patrol Mode: Choose dynamic offset along status ledge, safely clamped away from sidebar & diagnostics
      const maxLedgeOffset = typeof window !== 'undefined' ? Math.min(window.innerWidth - 220, 360) : 300;
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
      // Safe Perch Roam Mode: Choose among structural architectural perches
      // STRICTLY AVOIDS the central Monaco code editor lines and central PDF text!
      const maxW = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const maxH = typeof window !== 'undefined' ? window.innerHeight : 800;

      // 4 Designated Safe Perches:
      // Perch 1: Bottom Status Dock Ledge (safe right margin)
      // Perch 2: Top Navbar Margin Ledge (safe top margin)
      // Perch 3: Vertical Split Pane Divider Line (between editor and PDF)
      // Perch 4: PDF Top-Right Whitespace Margin
      const perchOptions = [
        { x: Math.round(Math.random() * 240 + 28), y: 36, snapped: true }, // Dock Right
        { x: Math.round(maxW * 0.35), y: 36, snapped: true }, // Dock Center-Left
        { x: Math.round(Math.random() * 200 + 40), y: Math.max(36, maxH - 80), snapped: false }, // Navbar Right
        { x: Math.round(maxW * 0.45), y: Math.max(36, maxH - 80), snapped: false }, // Navbar Center
        { x: Math.round(maxW * 0.5), y: Math.round(maxH * 0.7), snapped: false }, // Split-Pane Top
        { x: Math.round(maxW * 0.5), y: Math.round(maxH * 0.25), snapped: false }, // Split-Pane Bottom
      ];

      const chosen = perchOptions[Math.floor(Math.random() * perchOptions.length)];
      const targetX = chosen.x;
      const targetY = chosen.y;

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
      setIsSnappedToDock(chosen.snapped);
    }
  }, [isEnabled, isPaused, isReducedMotion, isDragging, roamMode, pacingOffset, perchX, perchY, transitionTo]);

  // Stage 19: Dynamic Organic Behavior Scheduler (Every 2.0s–4.2s when idle)
  // Decoupled from `state` dependencies so state transitions never abort or starve the scheduler!
  useEffect(() => {
    if (!isEnabled || isPaused || isReducedMotion) {
      if (organicScheduleTimerRef.current) clearTimeout(organicScheduleTimerRef.current);
      return;
    }

    const scheduleNextBehavior = () => {
      const delay = 2000 + Math.random() * 2200; // 2000ms - 4200ms
      organicScheduleTimerRef.current = setTimeout(() => {
        if (stateRef.current === 'idle' && !isTypingRef.current && !isDragging && !isLaserActive) {
          const roll = Math.random();

          if (roll < 0.05) {
            audioEngineRef.current?.playYawnSigh();
            transitionTo('nap-yawn', 2400);
          } else if (roll < 0.10) {
            audioEngineRef.current?.playPurr(1200);
            transitionTo('belly-flop', 2600);
          } else if (roll < 0.15) {
            transitionTo('ear-scratch', 2200);
          } else if (roll < 0.20) {
            audioEngineRef.current?.playPurr(1400);
            transitionTo('knead-dough', 2800);
          } else if (roll < 0.25) {
            transitionTo('pounce-prep', 2000);
          } else if (roll < 0.30) {
            audioEngineRef.current?.playPurr(1600);
            transitionTo('slow-blink', 2800);
          } else if (roll < 0.35) {
            audioEngineRef.current?.playPurr(1400);
            transitionTo('cheek-bunt', 2200);
          } else if (roll < 0.40) {
            audioEngineRef.current?.playSlurp();
            transitionTo('blep', 2600);
          } else if (roll < 0.45) {
            audioEngineRef.current?.playSlurp();
            transitionTo('cello-leg', 2800);
          } else if (roll < 0.50) {
            transitionTo('flehmen-sniff', 2400);
          } else if (roll < 0.55) {
            audioEngineRef.current?.playMugClink();
            transitionTo('knock-mug', 2400);
          } else if (roll < 0.60) {
            transitionTo('yoga-stretch', 2200);
          } else if (roll < 0.65) {
            transitionTo('face-wash', 2200);
          } else if (roll < 0.70) {
            transitionTo('butterfly-bat', 2400);
          } else if (roll < 0.75) {
            transitionTo('tail-chase', 2000);
          } else if (roll < 0.80) {
            audioEngineRef.current?.playSuccessChime();
            transitionTo('knuth-texbook', 3000);
          } else if (roll < 0.85) {
            transitionTo('loaf', 3600);
          } else if (roll < 0.90) {
            audioEngineRef.current?.playBoxThud();
            transitionTo('box-sit', 3000);
          } else if (roll < 0.94) {
            audioEngineRef.current?.playZoomieWhoosh();
            transitionTo('midnight-zoomies', 2400);
          } else {
            // Autonomous Waypoint Stroll
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
  }, [isEnabled, isPaused, isReducedMotion, isDragging, isLaserActive, transitionTo, triggerRoam]);

  // Stage 19: Feline Annoyance Engine Reaction Trigger
  const triggerAnnoyanceReaction = useCallback((reason?: string) => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    const currentReason = reason || 'general';
    setAnnoyanceReason(currentReason);
    setAnnoyanceLevel(prev => Math.min(100, prev + 35));

    const annoyedStates: { state: DeskPetActionState; duration: number; sound?: () => void }[] = [
      { state: 'airplane-ears', duration: 2200, sound: () => audioEngineRef.current?.playAlertBoop() },
      { state: 'annoyed-hiss', duration: 1800, sound: () => audioEngineRef.current?.playHiss() },
      { state: 'swat-aggressive', duration: 1400, sound: () => audioEngineRef.current?.playAlertBoop() },
      { state: 'tail-thump', duration: 2400, sound: () => audioEngineRef.current?.playTailThump() },
      { state: 'cold-shoulder', duration: 3200 },
      { state: 'facepalm-paw', duration: 2600, sound: () => audioEngineRef.current?.playAlertBoop() },
      { state: 'paper-shred', duration: 2000, sound: () => audioEngineRef.current?.playTreatCrunch() },
      { state: 'glare-judge', duration: 3000 },
      { state: 'dizzy-wobble', duration: 2600 },
      { state: 'keyboard-sprawl', duration: 3500 },
      { state: 'hairball-cough', duration: 2400, sound: () => audioEngineRef.current?.playAlertBoop() },
      { state: 'drama-flop', duration: 2800, sound: () => audioEngineRef.current?.playPurr(800) },
    ];

    const pick = annoyedStates[Math.floor(Math.random() * annoyedStates.length)];
    pick.sound?.();
    transitionTo(pick.state, pick.duration);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  // Stage 19: Authentic Behaviors & Quick Action Triggers
  const triggerPouncePrep = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    transitionTo('pounce-prep', 2000);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerKneadDough = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playPurr(2000);
    transitionTo('knead-dough', 3000);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerMidnightZoomies = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playZoomieWhoosh();
    transitionTo('midnight-zoomies', 2800);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerSlowBlink = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playPurr(1500);
    transitionTo('slow-blink', 3000);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerCheekBunt = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playPurr(1400);
    transitionTo('cheek-bunt', 2400);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerCelloLeg = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playSlurp();
    transitionTo('cello-leg', 3200);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerBlep = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playSlurp();
    transitionTo('blep', 3000);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerFlehmenSniff = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playAlertBoop();
    transitionTo('flehmen-sniff', 2800);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerMathZoomies = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playZoomieWhoosh();
    transitionTo('math-zoomies', 2800);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerLoafWiggle = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playPurr(1200);
    transitionTo('loaf-wiggle', 2400);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerFocusScholar = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playSingingBowl();
    transitionTo('focus-scholar', 4000);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerQedCelebration = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    audioEngineRef.current?.playSuccessChime();
    addScholarXp(25);
    transitionTo('qed-celebration', 3200);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo, addScholarXp]);

  const playSpecificAnimation = useCallback((anim: DeskPetActionState, durationMs = 2800) => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer();
    if (anim === 'annoyed-hiss') audioEngineRef.current?.playHiss();
    else if (anim === 'tail-thump') audioEngineRef.current?.playTailThump();
    else if (anim === 'midnight-zoomies' || anim === 'math-zoomies') audioEngineRef.current?.playZoomieWhoosh();
    else if (anim === 'laser-pounce') audioEngineRef.current?.playPounceLeap();
    else if (anim === 'blep' || anim === 'cello-leg') audioEngineRef.current?.playSlurp();
    else if (anim === 'focus-scholar') audioEngineRef.current?.playSingingBowl();
    else if (anim === 'knead-dough' || anim === 'slow-blink' || anim === 'cheek-bunt' || anim === 'loaf-wiggle') audioEngineRef.current?.playPurr(1500);
    else if (anim === 'knuth-texbook' || anim === 'knuth-check' || anim === 'compile-success' || anim === 'qed-celebration') audioEngineRef.current?.playSuccessChime();
    else if (anim === 'knock-mug') audioEngineRef.current?.playMugClink();
    else if (anim === 'box-sit') audioEngineRef.current?.playBoxThud();
    else if (anim === 'fish-feast') audioEngineRef.current?.playTreatCrunch();
    else if (anim === 'yarn-chase') audioEngineRef.current?.playYarnChirp();
    else if (anim === 'laser-chase') audioEngineRef.current?.playLaserChirp();
    else if (anim === 'nap-yawn') audioEngineRef.current?.playYawnSigh();

    transitionTo(anim, durationMs);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

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
    resetInactivityTimer();

    const now = Date.now();
    petTimestampsRef.current = petTimestampsRef.current.filter(t => now - t < 5000);
    petTimestampsRef.current.push(now);

    if (petTimestampsRef.current.length >= 8) {
      // Feline overstimulation / petting aggression
      petTimestampsRef.current = [];
      triggerAnnoyanceReaction('over_petting');
      return;
    }

    setPetCount(prev => prev + 1);
    audioEngineRef.current?.playPurr();
    if (state === 'sleep' || state === 'loaf') {
      wakeUp();
    }
  }, [isEnabled, isPaused, state, wakeUp, resetInactivityTimer, triggerAnnoyanceReaction]);

  // Stage 19: Real-Time Active Laser Chasing Kinematics Loop
  useEffect(() => {
    if (!isLaserActive || !isEnabled || isPaused) return;

    const handlePointerMove = (e: PointerEvent) => {
      setLaserCoords({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    const chaseInterval = setInterval(() => {
      if (!isLaserActive || isDragging) return;

      const targetX = typeof window !== 'undefined'
        ? Math.max(20, Math.min(window.innerWidth - 60, window.innerWidth - laserCoords.x - 30))
        : 100;
      const targetY = typeof window !== 'undefined'
        ? Math.max(20, Math.min(window.innerHeight - 60, window.innerHeight - laserCoords.y - 20))
        : 40;

      const dx = targetX - perchX;
      const dy = targetY - perchY;
      const dist = Math.hypot(dx, dy);

      if (dx > 10) setDirection('left');
      else if (dx < -10) setDirection('right');

      if (dist > 80) {
        // Active sprint towards moving red dot
        const speed = Math.min(dist, 55);
        const nextX = perchX + (dx / dist) * speed;
        const nextY = perchY + (dy / dist) * speed;
        setPerchX(Math.round(nextX));
        setPerchY(Math.round(nextY));
        setIsSnappedToDock(false);

        setState(cur => (cur === 'laser-pounce' || cur === 'pounce-prep' ? cur : 'laser-chase'));
      } else if (dist <= 80 && dist > 15) {
        // Pre-pounce butt wiggle
        setState('pounce-prep');
        setTimeout(() => {
          if (!isLaserActive) return;
          // Pounce leap slam directly onto the dot
          setPerchX(targetX);
          setPerchY(targetY);
          setState('laser-pounce');
          audioEngineRef.current?.playPounceLeap();
        }, 450);
      }
    }, 110);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      clearInterval(chaseInterval);
    };
  }, [isLaserActive, isEnabled, isPaused, laserCoords, perchX, perchY, isDragging]);

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
    dragStartTimeRef.current = Date.now();

    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialPerchX: perchX,
      initialPerchY: isSnappedToDock ? 36 : perchY,
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

      // Invert dx because perchX is measured from right edge; subtract dy because bottom position increases as cursor moves up (dy < 0)
      const newPerchX = Math.max(16, Math.min(window.innerWidth - 80, dragStartRef.current.initialPerchX - dx));
      const newPerchY = Math.max(16, Math.min(window.innerHeight - 80, dragStartRef.current.initialPerchY - dy));

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

      if (dragStartTimeRef.current && Date.now() - dragStartTimeRef.current > 2500) {
        // Drag abuse: held by scruff for too long triggers dizzy/annoyance
        triggerAnnoyanceReaction('drag_abuse');
      }
      dragStartTimeRef.current = null;

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
  }, [isReducedMotion, perchX, perchY, clearStateTimer, triggerAnnoyanceReaction]);

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
    // Stage 19 additions:
    annoyanceLevel,
    annoyanceReason,
    scholarXp,
    scholarLevel: scholarInfo.level,
    scholarTitle: scholarInfo.title,
    scholarProgress: scholarInfo.progress,
    addScholarXp,
    playSpecificAnimation,
    triggerAnnoyanceReaction,
    triggerPouncePrep,
    triggerKneadDough,
    triggerMidnightZoomies,
    triggerSlowBlink,
    triggerCheekBunt,
    triggerCelloLeg,
    triggerBlep,
    triggerFlehmenSniff,
    triggerMathZoomies,
    triggerLoafWiggle,
    triggerFocusScholar,
    triggerQedCelebration,
  };
}
