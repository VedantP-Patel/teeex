import { isFelineAudioMuted, setFelineAudioMuted, playFelineCue, type FelineAudioCue } from "../utils/felineSynth";
import {
  DEFAULT_FELINE_DRIVES,
  stepFelineDrives,
  deriveFelineMood,
  computeGazeOffset,
  computeTailPath,
  type FelineDrives,
  type FelineMood,
  type GazeVector,
  extractWorkspaceLedges,
  computeScruffPendulumTilt,
  classifyPettingZone,
  applyPettingZoneInteraction,
  type WorkspaceLedge,
  type PettingZone,
  stepYarnBallPhysics,
  batYarnBall,
  type ActiveToyMode,
  type YarnBallState,
} from "../utils/felineEngine";
﻿import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
export type EditorCursorContext = 'math' | 'tikz' | 'table' | 'figure' | 'bib' | 'preamble' | 'text';
export type CircadianBucket = 'morning' | 'afternoon' | 'evening' | 'lateNight';

export type DeskPetBaseSkin = 'tuxedo' | 'ginger' | 'calico' | 'siamese' | 'cyberpunk';
export type DeskPetPrestigeSkin = 'blueprint' | 'solarized' | 'gold-tex';
export type DeskPetSkin = DeskPetBaseSkin | DeskPetPrestigeSkin;

export const DESK_PET_SKINS: DeskPetBaseSkin[] = ['tuxedo', 'ginger', 'calico', 'siamese', 'cyberpunk'];
export const PRESTIGE_SKIN_UNLOCKS: Array<{ id: DeskPetPrestigeSkin; label: string; unlockLevel: number }> = [
  { id: 'blueprint', label: 'Blueprint Grid', unlockLevel: 2 },
  { id: 'solarized', label: 'Solarized Parchment', unlockLevel: 4 },
  { id: 'gold-tex', label: 'Knuth Gold Foil', unlockLevel: 5 },
];
export const ALL_DESK_PET_SKINS: DeskPetSkin[] = [
  ...DESK_PET_SKINS,
  ...PRESTIGE_SKIN_UNLOCKS.map(s => s.id),
];

export type DeskPetBaseAccessory = 'none' | 'mortarboard' | 'scarf' | 'detective' | 'bowtie';
export type DeskPetPrestigeAccessory = 'monocle' | 'laurel' | 'visor';
export type DeskPetAccessory = DeskPetBaseAccessory | DeskPetPrestigeAccessory;

export const DESK_PET_ACCESSORIES: DeskPetBaseAccessory[] = ['none', 'mortarboard', 'scarf', 'detective', 'bowtie'];
export const PRESTIGE_ACCESSORY_UNLOCKS: Array<{ id: DeskPetPrestigeAccessory; label: string; unlockLevel: number }> = [
  { id: 'monocle', label: 'Brass Monocle', unlockLevel: 2 },
  { id: 'laurel', label: 'Q.E.D. Laurel', unlockLevel: 3 },
  { id: 'visor', label: 'Typesetter Visor', unlockLevel: 5 },
];
export const ALL_DESK_PET_ACCESSORIES: DeskPetAccessory[] = [
  ...DESK_PET_ACCESSORIES,
  ...PRESTIGE_ACCESSORY_UNLOCKS.map(a => a.id),
];

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

const JUKEBOX_RANDOM_POOL: Array<{ state: DeskPetActionState; duration: number }> = [
  { state: 'knead-dough', duration: 3000 },
  { state: 'pounce-prep', duration: 2200 },
  { state: 'midnight-zoomies', duration: 2800 },
  { state: 'slow-blink', duration: 3000 },
  { state: 'cheek-bunt', duration: 2400 },
  { state: 'cello-leg', duration: 3200 },
  { state: 'blep', duration: 3000 },
  { state: 'flehmen-sniff', duration: 2800 },
  { state: 'loaf-wiggle', duration: 2400 },
  { state: 'focus-scholar', duration: 4000 },
  { state: 'qed-celebration', duration: 3200 },
  { state: 'math-zoomies', duration: 2800 },
  { state: 'yoga-stretch', duration: 2200 },
  { state: 'butterfly-bat', duration: 2400 },
  { state: 'knuth-texbook', duration: 3200 },
  { state: 'box-sit', duration: 3400 },
  { state: 'fish-feast', duration: 2800 },
  { state: 'coffee-sip', duration: 3200 },
  { state: 'origami-crane', duration: 3200 },
];

interface ContextualIdleCandidate {
  state: DeskPetActionState;
  duration: number;
  circadian?: Partial<Record<CircadianBucket, number>>;
  contexts?: EditorCursorContext[];
  sound?: (engine: DeskPetAudioEngine | null) => void;
}

const CONTEXTUAL_IDLE_CANDIDATES: ContextualIdleCandidate[] = [
  { state: 'nap-yawn', duration: 2400, circadian: { morning: 2.2, lateNight: 2.0 }, sound: e => e?.playYawnSigh() },
  { state: 'belly-flop', duration: 2600, sound: e => e?.playPurr(1200) },
  { state: 'ear-scratch', duration: 2200 },
  { state: 'knead-dough', duration: 2800, sound: e => e?.playPurr(1400) },
  { state: 'pounce-prep', duration: 2000 },
  { state: 'slow-blink', duration: 2800, sound: e => e?.playPurr(1600) },
  { state: 'cheek-bunt', duration: 2200, sound: e => e?.playPurr(1400) },
  { state: 'blep', duration: 2600, sound: e => e?.playSlurp() },
  { state: 'cello-leg', duration: 2800, sound: e => e?.playSlurp() },
  { state: 'flehmen-sniff', duration: 2400 },
  { state: 'knock-mug', duration: 2400, sound: e => e?.playMugClink() },
  { state: 'coffee-sip', duration: 3200, circadian: { morning: 2.4, lateNight: 2.6 }, sound: e => e?.playSlurp() },
  { state: 'origami-crane', duration: 3200, contexts: ['tikz', 'figure'], sound: e => e?.playYarnBounce() },
  { state: 'yoga-stretch', duration: 2200, circadian: { morning: 2.3 } },
  { state: 'face-wash', duration: 2200 },
  { state: 'butterfly-bat', duration: 2400 },
  { state: 'tail-chase', duration: 2000 },
  { state: 'knuth-texbook', duration: 3000, contexts: ['preamble', 'math'], sound: e => e?.playSuccessChime() },
  { state: 'focus-scholar', duration: 3600, contexts: ['math', 'preamble'], sound: e => e?.playSingingBowl() },
  { state: 'math-zoomies', duration: 2600, contexts: ['math'], sound: e => e?.playZoomieWhoosh() },
  { state: 'loaf', duration: 3600, circadian: { afternoon: 1.6, evening: 1.5 } },
  { state: 'box-sit', duration: 3000, contexts: ['table'], sound: e => e?.playBoxThud() },
  { state: 'midnight-zoomies', duration: 2400, circadian: { lateNight: 3.0 }, sound: e => e?.playZoomieWhoosh() },
];

export function getCircadianBucket(date: Date = new Date()): CircadianBucket {
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'lateNight';
}

export function selectContextualIdleCandidate(params: {
  cursorContext: EditorCursorContext;
  recentStates: DeskPetActionState[];
  now?: Date;
  rng?: () => number;
}): ContextualIdleCandidate | 'roam' {
  const { cursorContext, recentStates, now = new Date(), rng = Math.random } = params;
  if (rng() < 0.06) return 'roam';

  const bucket = getCircadianBucket(now);
  const weighted = CONTEXTUAL_IDLE_CANDIDATES.map(item => {
    let weight = 1.0;
    if (item.circadian?.[bucket]) weight *= item.circadian[bucket]!;
    if (item.contexts?.includes(cursorContext)) weight *= 2.4;

    const lastIdx = recentStates.lastIndexOf(item.state);
    if (lastIdx !== -1) {
      const dist = recentStates.length - 1 - lastIdx;
      weight *= dist === 0 ? 0.05 : dist < 3 ? 0.35 : 0.75;
    }
    return { item, weight };
  });

  const total = weighted.reduce((acc, entry) => acc + entry.weight, 0);
  if (total <= 0) return CONTEXTUAL_IDLE_CANDIDATES[0];

  let roll = rng() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return weighted[weighted.length - 1].item;
}

export function getScholarLevel(xp: number): { level: number; title: string; nextXp: number; progress: number } {
  if (xp < 100) return { level: 1, title: 'Novice Kitten', nextXp: 100, progress: Math.max(0, Math.min(1, xp / 100)) };
  if (xp < 300) return { level: 2, title: 'Math Apprentice', nextXp: 300, progress: Math.max(0, Math.min(1, (xp - 100) / 200)) };
  if (xp < 600) return { level: 3, title: 'TeX Journeyman', nextXp: 600, progress: Math.max(0, Math.min(1, (xp - 300) / 300)) };
  if (xp < 1000) return { level: 4, title: 'Macro Wizard', nextXp: 1000, progress: Math.max(0, Math.min(1, (xp - 600) / 400)) };
  return { level: 5, title: 'Knuth Grandmaster', nextXp: 2000, progress: Math.max(0, Math.min(1, (xp - 1000) / 1000)) };
}

export interface CaretViewportRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface UseDeskPetOptions {
  compileStatus?: 'idle' | 'compiling' | 'success' | 'error';
  lastCompiledAt?: number | null;
  errorCount?: number;
  warningCount?: number;
  isTypingActive?: boolean;
  inactivitySleepMs?: number;
  cursorContext?: EditorCursorContext;
  caretViewportRect?: CaretViewportRect | null;
}

export interface UseDeskPetReturn {
  isAudioMuted: boolean;
  activeToy: ActiveToyMode;
  yarnBall: YarnBallState;
  toggleAudioMute: () => void;
  triggerFelineSound: (cue: FelineAudioCue) => boolean;
  setToyMode: (mode: ActiveToyMode) => void;
  swatToyYarn: () => void;
  activeLedgeId: string;
  availableLedges: WorkspaceLedge[];
  scruffTiltDeg: number;
  lastPetZone: PettingZone | null;
  handleZonePet: (localX: number, localY: number, width?: number, height?: number) => PettingZone;
  jumpToLedge: (ledgeId?: string) => void;
  updateScruffVelocity: (velocityX: number, dtSec?: number) => void;
  drives: FelineDrives;
  mood: FelineMood;
  gazeOffset: GazeVector;
  facingDirection: 'left' | 'right';
  isBlinking: boolean;
  tailPath: string;
  isEnabled: boolean;
  isExiting: boolean;
  entryVariant: DeskPetEntryVariant;
  exitVariant: DeskPetExitVariant;
  setIsEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  state: DeskPetActionState;
  direction: 'left' | 'right';
  pacingOffset: number;
  dodgeOffsetX: number;
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
  triggerRandomTrick: () => void;
  annoyanceLevel: number;
  annoyanceReason: string | null;
  scholarXp: number;
  scholarLevel: number;
  scholarTitle: string;
  scholarProgress: number;
  recentLevelUpBanner: string | null;
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

function clampPerchCoords(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y };
  const maxX = Math.max(16, window.innerWidth - 80);
  const maxY = Math.max(16, window.innerHeight - 80);
  return {
    x: Math.max(16, Math.min(maxX, x)),
    y: Math.max(16, Math.min(maxY, y)),
  };
}

export function useDeskPet({
  compileStatus = 'idle',
  lastCompiledAt,
  errorCount: _errorCount = 0,
  warningCount = 0,
  isTypingActive = false,
  inactivitySleepMs = 45000,
  cursorContext = 'text',
  caretViewportRect = null,
}: UseDeskPetOptions = {}): UseDeskPetReturn {
  const [isEnabled, setIsEnabledState] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(STORAGE_KEY) === 'true';
      }
    } catch {
      // Ignore
    }
    return false;
  });

  const [isExiting, setIsExiting] = useState<boolean>(false);
  const [entryVariant, setEntryVariant] = useState<DeskPetEntryVariant>('box');
  const [exitVariant, setExitVariant] = useState<DeskPetExitVariant>('smoke');

  const [skin, setSkinState] = useState<DeskPetSkin>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(SKIN_STORAGE_KEY);
        if (saved && ALL_DESK_PET_SKINS.includes(saved as DeskPetSkin)) {
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
      const idx = DESK_PET_SKINS.indexOf(prev as DeskPetBaseSkin);
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

  const [accessory, setAccessoryState] = useState<DeskPetAccessory>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(ACCESSORY_STORAGE_KEY);
        if (saved && ALL_DESK_PET_ACCESSORIES.includes(saved as DeskPetAccessory)) {
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
      const idx = DESK_PET_ACCESSORIES.indexOf(prev as DeskPetBaseAccessory);
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

  const audioEngineRef = useRef<DeskPetAudioEngine | null>(null);
  useEffect(() => {
    const engine = new DeskPetAudioEngine(!isSoundEnabled, volume);
    audioEngineRef.current = engine;
    return () => {
      engine.dispose();
      audioEngineRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const [state, setState] = useState<DeskPetActionState>('idle');
  const [drives, setDrives] = useState<FelineDrives>(DEFAULT_FELINE_DRIVES);
  const [gazeOffset, setGazeOffset] = useState<GazeVector>({ x: 0, y: 0 });
  const [facingDirection, setFacingDirection] = useState<"left" | "right">("right");
  const [isBlinking, setIsBlinking] = useState<boolean>(false);
  const [activeLedgeId, setActiveLedgeId] = useState<string>("viewport-floor");
  const [availableLedges, setAvailableLedges] = useState<WorkspaceLedge[]>([
    { id: "viewport-floor", label: "Desk Floor", xMin: 16, xMax: 900, yBottom: 16 },
  ]);
  const [scruffTiltDeg, setScruffTiltDeg] = useState<number>(0);
  const [lastPetZone, setLastPetZone] = useState<PettingZone | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(() => isFelineAudioMuted());
  const [activeToy, setActiveToy] = useState<ActiveToyMode>("none");
  const [yarnBall, setYarnBall] = useState<YarnBallState>({
    x: 140,
    y: 16,
    vx: 0,
    vy: 0,
    angleDeg: 0,
    radius: 11,
  });
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [pacingOffset, setPacingOffset] = useState<number>(0);
  const [dodgeOffsetX, setDodgeOffsetX] = useState<number>(0);
  const [petCount, setPetCount] = useState<number>(0);
  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragTilt, setDragTilt] = useState<number>(0);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [currentDreamFormula, setCurrentDreamFormula] = useState<string>(MATH_DREAM_FORMULAS[0]);

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

  const [isLaserActive, setIsLaserActive] = useState<boolean>(false);
  const [laserCoords, setLaserCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [annoyanceLevel, setAnnoyanceLevel] = useState<number>(0);
  const [annoyanceReason, setAnnoyanceReason] = useState<string | null>(null);
  const [recentLevelUpBanner, setRecentLevelUpBanner] = useState<string | null>(null);
  const levelBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const prevInfo = getScholarLevel(prev);
      const nextInfo = getScholarLevel(next);
      if (nextInfo.level > prevInfo.level) {
        setRecentLevelUpBanner(`Lv.${nextInfo.level} ${nextInfo.title}!`);
        if (levelBannerTimerRef.current) clearTimeout(levelBannerTimerRef.current);
        levelBannerTimerRef.current = setTimeout(() => {
          setRecentLevelUpBanner(null);
        }, 2800);
      }
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

  const stateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loafTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const organicScheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dreamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const prevCompileStatusRef = useRef<string>(compileStatus);
  const prevLastCompiledAtRef = useRef<number | null | undefined>(lastCompiledAt);
  const hadPreviousCompileErrorRef = useRef<boolean>(false);
  const isTypingRef = useRef<boolean>(false);
  const typingBurstStartRef = useRef<number | null>(null);
  const lastActivityResetRef = useRef<number>(0);
  const stateRef = useRef<DeskPetActionState>(state);
  const perchXRef = useRef<number>(perchX);
  const perchYRef = useRef<number>(perchY);
  const isDraggingRef = useRef<boolean>(isDragging);
  const laserCoordsRef = useRef<{ x: number; y: number }>(laserCoords);
  const petTimestampsRef = useRef<number[]>([]);
  const consecutiveErrorsRef = useRef<number>(0);
  const recentStatesRef = useRef<DeskPetActionState[]>([]);
  const cursorContextRef = useRef<EditorCursorContext>(cursorContext);

  useEffect(() => {
    stateRef.current = state;
    if (state !== 'idle' && state !== 'walk') {
      recentStatesRef.current = [...recentStatesRef.current.slice(-7), state];
    }
  }, [state]);

  useEffect(() => {
    cursorContextRef.current = cursorContext;
  }, [cursorContext]);

  useEffect(() => {
    perchXRef.current = perchX;
  }, [perchX]);

  useEffect(() => {
    perchYRef.current = perchY;
  }, [perchY]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // Caret auto-dodge: hop horizontally if active editor caret enters mascot hitbox
  useEffect(() => {
    if (!isEnabled || isPaused || isReducedMotion || !caretViewportRect || typeof window === 'undefined') {
      setDodgeOffsetX(0);
      return;
    }
    const petRight = window.innerWidth - perchX - pacingOffset;
    const petLeft = petRight - 56;
    const petBottom = window.innerHeight - perchY;
    const petTop = petBottom - 56;
    const pad = 16;

    const overlaps =
      caretViewportRect.left < petRight + pad &&
      caretViewportRect.right > petLeft - pad &&
      caretViewportRect.top < petBottom + pad &&
      caretViewportRect.bottom > petTop - pad;

    if (!overlaps) {
      setDodgeOffsetX(0);
    } else {
      setDodgeOffsetX(petLeft > window.innerWidth * 0.5 ? 120 : -120);
    }
  }, [caretViewportRect, isEnabled, isPaused, isReducedMotion, perchX, perchY, pacingOffset]);

  const hasAnnoyance = annoyanceLevel > 0;
  useEffect(() => {
    if (!isEnabled || isPaused || !hasAnnoyance) return;
    const decayTimer = setInterval(() => {
      setAnnoyanceLevel(prev => {
        const next = Math.max(0, prev - 10);
        if (next === 0) setAnnoyanceReason(null);
        return next;
      });
    }, 2500);
    return () => clearInterval(decayTimer);
  }, [isEnabled, isPaused, hasAnnoyance]);

  useEffect(() => {
    if (!isEnabled || isSnappedToDock || typeof window === 'undefined') return;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const clamped = clampPerchCoords(perchXRef.current, perchYRef.current);
        if (clamped.x !== perchXRef.current) setPerchX(clamped.x);
        if (clamped.y !== perchYRef.current) setPerchY(clamped.y);
      }, 150);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [isEnabled, isSnappedToDock]);

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

  const transitionTo = useCallback(
    (nextState: DeskPetActionState, durationMs?: number, nextCallback?: () => void) => {
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
    },
    [clearStateTimer]
  );

  const setIsEnabled = useCallback((enabled: boolean) => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (enabled) {
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
      exitTimerRef.current = setTimeout(() => {
        setIsExiting(false);
        exitTimerRef.current = null;
      }, 550);
    }
  }, []);

  const toggleEnabled = useCallback(() => {
    setIsEnabled(!isEnabled);
  }, [isEnabled, setIsEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(media.matches);

    const handler = (e: MediaQueryListEvent) => {
      setIsReducedMotion(e.matches);
      if (e.matches) {
        setPacingOffset(0);
        setDodgeOffsetX(0);
        setDragTilt(0);
      }
    };
    media.addEventListener?.('change', handler);
    return () => {
      media.removeEventListener?.('change', handler);
    };
  }, []);

  const resetInactivityTimer = useCallback(
    (force = false) => {
      if (!isEnabled || isPaused) return;
      const now = Date.now();
      if (!force && now - lastActivityResetRef.current < 1000 && inactivityTimerRef.current) {
        return;
      }
      lastActivityResetRef.current = now;

      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (loafTimerRef.current) clearTimeout(loafTimerRef.current);

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
            'focus-scholar',
            'yarn-chase',
            'laser-chase',
            'fish-feast',
            'knuth-check',
            'lifted-scruff',
            'sleep',
          ];
          return nonInterruptible.includes(current) ? current : 'loaf';
        });
      }, 18000);

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
          return nonInterruptible.includes(current) ? current : 'sleep';
        });
      }, inactivitySleepMs);
    },
    [isEnabled, isPaused, inactivitySleepMs, clearStateTimer]
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      const hidden = document.hidden;
      if (hidden) {
        setIsPaused(true);
        clearStateTimer();
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        if (loafTimerRef.current) clearTimeout(loafTimerRef.current);
        if (organicScheduleTimerRef.current) clearTimeout(organicScheduleTimerRef.current);
        if (dreamIntervalRef.current) clearInterval(dreamIntervalRef.current);
        if (pounceTimeoutRef.current) clearTimeout(pounceTimeoutRef.current);
      } else {
        setIsPaused(false);
        resetInactivityTimer(true);
      }
      audioEngineRef.current?.handleVisibilityChange(hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearStateTimer, resetInactivityTimer]);

  const wakeUp = useCallback(() => {
    resetInactivityTimer(true);
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

  useEffect(() => {
    if (state === 'sleep' && !isPaused && isEnabled) {
      dreamIntervalRef.current = setInterval(() => {
        setCurrentDreamFormula(prev => {
          const idx = MATH_DREAM_FORMULAS.indexOf(prev);
          return MATH_DREAM_FORMULAS[(idx + 1) % MATH_DREAM_FORMULAS.length];
        });
      }, 5500);
    } else if (dreamIntervalRef.current) {
      clearInterval(dreamIntervalRef.current);
      dreamIntervalRef.current = null;
    }
    return () => {
      if (dreamIntervalRef.current) clearInterval(dreamIntervalRef.current);
    };
  }, [state, isPaused, isEnabled]);

  useEffect(() => {
    if (!isEnabled || isPaused) return;

    const handleAnonymousActivity = (e: Event) => {
      if (e.target && (e.target as HTMLElement).closest?.('.desk-pet-container')) {
        return;
      }
      const curState = stateRef.current;
      if (curState === 'sleep' || curState === 'loaf') {
        wakeUp();
        return;
      }

      resetInactivityTimer(false);

      if (e.type === 'keydown' && (curState === 'typing-paws' || curState === 'focus-scholar')) {
        isTypingRef.current = true;
        if (!typingBurstStartRef.current) {
          typingBurstStartRef.current = Date.now();
        } else if (curState === 'typing-paws' && Date.now() - typingBurstStartRef.current >= 15000) {
          setState('focus-scholar');
          addScholarXp(10);
        }

        if (typingSettleTimerRef.current) {
          clearTimeout(typingSettleTimerRef.current);
        }
        typingSettleTimerRef.current = setTimeout(() => {
          isTypingRef.current = false;
          typingBurstStartRef.current = null;
          setState(cur => (cur === 'typing-paws' || cur === 'focus-scholar' ? 'idle' : cur));
        }, 450);
      }
    };

    window.addEventListener('keydown', handleAnonymousActivity, { passive: true });
    window.addEventListener('pointerdown', handleAnonymousActivity, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleAnonymousActivity);
      window.removeEventListener('pointerdown', handleAnonymousActivity);
    };
  }, [isEnabled, isPaused, wakeUp, resetInactivityTimer, addScholarXp]);

  useEffect(() => {
    if (!isEnabled || isPaused) return;

    if (isTypingActive) {
      isTypingRef.current = true;
      if (!typingBurstStartRef.current) {
        typingBurstStartRef.current = Date.now();
      }
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
        typingBurstStartRef.current = null;
        setState(cur => (cur === 'typing-paws' || cur === 'focus-scholar' ? 'idle' : cur));
      }, 450);
    }
  }, [isTypingActive, isEnabled, isPaused, clearStateTimer]);

  // Compiler Lifecycle State Transitions + Error-to-Success Recovery Celebration
  useEffect(() => {
    if (!isEnabled || isPaused) return;

    const prevStatus = prevCompileStatusRef.current;
    const prevTimestamp = prevLastCompiledAtRef.current;
    prevCompileStatusRef.current = compileStatus;
    prevLastCompiledAtRef.current = lastCompiledAt;

    if (compileStatus === 'compiling') {
      clearStateTimer();
      setState('compiling-scholar');
      resetInactivityTimer(true);
      return;
    }

    if (compileStatus === 'success' && (prevStatus === 'compiling' || (lastCompiledAt && lastCompiledAt !== prevTimestamp))) {
      clearStateTimer();
      resetInactivityTimer(true);
      const recoveredFromError = hadPreviousCompileErrorRef.current || consecutiveErrorsRef.current > 0;
      hadPreviousCompileErrorRef.current = false;
      consecutiveErrorsRef.current = 0;

      if (recoveredFromError) {
        setState('qed-celebration');
        audioEngineRef.current?.playSuccessChime();
        addScholarXp(35);
        stateTimerRef.current = setTimeout(() => {
          setState('idle');
        }, 3600);
      } else if (warningCount > 0) {
        setState('compile-warning');
        audioEngineRef.current?.playWarningChime();
        addScholarXp(10);
        stateTimerRef.current = setTimeout(() => {
          setState('idle');
        }, 3000);
      } else {
        setState('compile-success');
        audioEngineRef.current?.playSuccessChime();
        addScholarXp(25);
        stateTimerRef.current = setTimeout(() => {
          setState('idle');
        }, 3500);
      }
      return;
    }

    if (compileStatus === 'error' && (prevStatus === 'compiling' || (lastCompiledAt && lastCompiledAt !== prevTimestamp))) {
      clearStateTimer();
      resetInactivityTimer(true);
      hadPreviousCompileErrorRef.current = true;
      consecutiveErrorsRef.current = (consecutiveErrorsRef.current || 0) + 1;

      if (consecutiveErrorsRef.current >= 2) {
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

  const triggerRoam = useCallback(() => {
    if (!isEnabled || isPaused || isReducedMotion || isTypingRef.current || isDraggingRef.current) return;

    if (roamMode === 'dock') {
      const maxLedgeOffset = typeof window !== 'undefined' ? Math.max(40, Math.min(window.innerWidth - 220, 360)) : 300;
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
      const maxW = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const maxH = typeof window !== 'undefined' ? window.innerHeight : 800;

      const perchOptions = [
        { x: Math.round(Math.random() * 240 + 28), y: 36, snapped: true },
        { x: Math.round(maxW * 0.35), y: 36, snapped: true },
        { x: Math.round(Math.random() * 200 + 40), y: Math.max(36, maxH - 80), snapped: false },
        { x: Math.round(maxW * 0.45), y: Math.max(36, maxH - 80), snapped: false },
        { x: Math.round(maxW * 0.5), y: Math.round(maxH * 0.7), snapped: false },
        { x: Math.round(maxW * 0.5), y: Math.round(maxH * 0.25), snapped: false },
      ];

      const chosen = perchOptions[Math.floor(Math.random() * perchOptions.length)];
      const clamped = clampPerchCoords(chosen.x, chosen.y);
      const targetX = clamped.x;
      const targetY = chosen.snapped ? 36 : clamped.y;

      setDirection(targetX > perchXRef.current ? 'left' : 'right');
      const dx = targetX - perchXRef.current;
      const dy = targetY - perchYRef.current;
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
  }, [isEnabled, isPaused, isReducedMotion, roamMode, pacingOffset, transitionTo]);

  // Context-Aware + Circadian Organic Behavior Scheduler
  useEffect(() => {
    if (!isEnabled || isPaused || isReducedMotion) {
      if (organicScheduleTimerRef.current) clearTimeout(organicScheduleTimerRef.current);
      return;
    }

    const scheduleNextBehavior = () => {
      const delay = 2200 + Math.random() * 2200;
      organicScheduleTimerRef.current = setTimeout(() => {
        if (stateRef.current === 'idle' && !isTypingRef.current && !isDraggingRef.current && !isLaserActive) {
          const selection = selectContextualIdleCandidate({
            cursorContext: cursorContextRef.current,
            recentStates: recentStatesRef.current,
          });
          if (selection === 'roam') {
            triggerRoam();
          } else {
            selection.sound?.(audioEngineRef.current);
            transitionTo(selection.state, selection.duration);
          }
        }
        scheduleNextBehavior();
      }, delay);
    };

    scheduleNextBehavior();

    return () => {
      if (organicScheduleTimerRef.current) clearTimeout(organicScheduleTimerRef.current);
    };
  }, [isEnabled, isPaused, isReducedMotion, isLaserActive, transitionTo, triggerRoam]);

  const triggerAnnoyanceReaction = useCallback(
    (reason?: string) => {
      if (!isEnabled || isPaused) return;
      resetInactivityTimer(true);
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
    },
    [isEnabled, isPaused, resetInactivityTimer, transitionTo]
  );

  const triggerPouncePrep = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    transitionTo('pounce-prep', 2000);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerKneadDough = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playPurr(2000);
    transitionTo('knead-dough', 3000);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerMidnightZoomies = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playZoomieWhoosh();
    transitionTo('midnight-zoomies', 2800);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerSlowBlink = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playPurr(1500);
    transitionTo('slow-blink', 3000);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerCheekBunt = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playPurr(1400);
    transitionTo('cheek-bunt', 2400);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerCelloLeg = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playSlurp();
    transitionTo('cello-leg', 3200);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerBlep = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playSlurp();
    transitionTo('blep', 3000);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerFlehmenSniff = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playAlertBoop();
    transitionTo('flehmen-sniff', 2800);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerMathZoomies = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playZoomieWhoosh();
    transitionTo('math-zoomies', 2800);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerLoafWiggle = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playPurr(1200);
    transitionTo('loaf-wiggle', 2400);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerFocusScholar = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playSingingBowl();
    transitionTo('focus-scholar', 4000);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerQedCelebration = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playSuccessChime();
    addScholarXp(25);
    transitionTo('qed-celebration', 3200);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo, addScholarXp]);

  const playSpecificAnimation = useCallback(
    (anim: DeskPetActionState, durationMs = 2800) => {
      if (!isEnabled || isPaused) return;
      resetInactivityTimer(true);
      if (anim === 'annoyed-hiss') audioEngineRef.current?.playHiss();
      else if (anim === 'tail-thump') audioEngineRef.current?.playTailThump();
      else if (anim === 'midnight-zoomies' || anim === 'math-zoomies') audioEngineRef.current?.playZoomieWhoosh();
      else if (anim === 'laser-pounce') audioEngineRef.current?.playPounceLeap();
      else if (anim === 'blep' || anim === 'cello-leg' || anim === 'coffee-sip') audioEngineRef.current?.playSlurp();
      else if (anim === 'focus-scholar') audioEngineRef.current?.playSingingBowl();
      else if (
        anim === 'knead-dough' ||
        anim === 'slow-blink' ||
        anim === 'cheek-bunt' ||
        anim === 'loaf-wiggle' ||
        anim === 'drama-flop'
      )
        audioEngineRef.current?.playPurr(1500);
      else if (
        anim === 'knuth-texbook' ||
        anim === 'knuth-check' ||
        anim === 'compile-success' ||
        anim === 'qed-celebration'
      )
        audioEngineRef.current?.playSuccessChime();
      else if (anim === 'knock-mug') audioEngineRef.current?.playMugClink();
      else if (anim === 'box-sit') audioEngineRef.current?.playBoxThud();
      else if (anim === 'fish-feast' || anim === 'paper-shred') audioEngineRef.current?.playTreatCrunch();
      else if (anim === 'yarn-chase') audioEngineRef.current?.playYarnChirp();
      else if (anim === 'laser-chase') audioEngineRef.current?.playLaserChirp();
      else if (anim === 'nap-yawn') audioEngineRef.current?.playYawnSigh();
      else if (anim === 'origami-crane') audioEngineRef.current?.playYarnBounce();
      else if (anim === 'hairball-cough' || anim === 'facepalm-paw' || anim === 'airplane-ears')
        audioEngineRef.current?.playAlertBoop();

      transitionTo(anim, durationMs);
    },
    [isEnabled, isPaused, resetInactivityTimer, transitionTo]
  );

  const triggerRandomTrick = useCallback(() => {
    if (!isEnabled || isPaused) return;
    const candidates = JUKEBOX_RANDOM_POOL.filter(item => item.state !== stateRef.current);
    const pick = candidates[Math.floor(Math.random() * candidates.length)] || JUKEBOX_RANDOM_POOL[0];
    playSpecificAnimation(pick.state, pick.duration);
  }, [isEnabled, isPaused, playSpecificAnimation]);

  const triggerYarnChase = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
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
        if (pounceTimeoutRef.current) {
          clearTimeout(pounceTimeoutRef.current);
          pounceTimeoutRef.current = null;
        }
        setState('idle');
      }
      return next;
    });
  }, [isEnabled, isPaused, transitionTo]);

  const triggerBox = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playBoxThud();
    transitionTo('box-sit', 3400);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerFish = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playTreatCrunch();
    transitionTo('fish-feast', 2800);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerKnuthCelebration = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playSuccessChime();
    transitionTo('knuth-check', 3600);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerPeekABoo = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playMeow();
    transitionTo('peek-a-boo', 2600);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerSwatCursor = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playMeow();
    transitionTo('swat-cursor', 1800);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerKnockMug = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playMugClink();
    transitionTo('knock-mug', 2400);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerBellyFlop = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playPurr(1400);
    transitionTo('belly-flop', 2600);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerEarScratch = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    transitionTo('ear-scratch', 2200);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerNapYawn = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);
    audioEngineRef.current?.playYawnSigh();
    transitionTo('nap-yawn', 2400);
  }, [isEnabled, isPaused, resetInactivityTimer, transitionTo]);

  const triggerPet = useCallback(() => {
    if (!isEnabled || isPaused) return;
    resetInactivityTimer(true);

    const now = Date.now();
    petTimestampsRef.current = petTimestampsRef.current.filter(t => now - t < 5000);
    petTimestampsRef.current.push(now);

    if (petTimestampsRef.current.length >= 8) {
      petTimestampsRef.current = [];
      triggerAnnoyanceReaction('over_petting');
      return;
    }

    setPetCount(prev => prev + 1);
    audioEngineRef.current?.playPurr();
    if (stateRef.current === 'sleep' || stateRef.current === 'loaf') {
      wakeUp();
    }
  }, [isEnabled, isPaused, wakeUp, resetInactivityTimer, triggerAnnoyanceReaction]);

  useEffect(() => {
    if (!isLaserActive || !isEnabled || isPaused) return;

    let rafId: number | null = null;
    const handlePointerMove = (e: PointerEvent) => {
      laserCoordsRef.current = { x: e.clientX, y: e.clientY };
      if (rafId === null) {
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          setLaserCoords(laserCoordsRef.current);
        });
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    const chaseInterval = setInterval(() => {
      if (isDraggingRef.current) return;

      const curLaser = laserCoordsRef.current;
      const curX = perchXRef.current;
      const curY = perchYRef.current;

      const targetX =
        typeof window !== 'undefined'
          ? Math.max(20, Math.min(window.innerWidth - 60, window.innerWidth - curLaser.x - 30))
          : 100;
      const targetY =
        typeof window !== 'undefined'
          ? Math.max(20, Math.min(window.innerHeight - 60, window.innerHeight - curLaser.y - 20))
          : 40;

      const dx = targetX - curX;
      const dy = targetY - curY;
      const dist = Math.hypot(dx, dy);

      if (dx > 10) setDirection('left');
      else if (dx < -10) setDirection('right');

      if (dist > 80) {
        if (pounceTimeoutRef.current) {
          clearTimeout(pounceTimeoutRef.current);
          pounceTimeoutRef.current = null;
        }
        const speed = Math.min(dist, 55);
        const nextX = Math.round(curX + (dx / dist) * speed);
        const nextY = Math.round(curY + (dy / dist) * speed);
        perchXRef.current = nextX;
        perchYRef.current = nextY;
        setPerchX(nextX);
        setPerchY(nextY);
        setIsSnappedToDock(false);

        setState(cur => (cur === 'laser-pounce' || cur === 'pounce-prep' ? cur : 'laser-chase'));
      } else if (dist <= 80 && dist > 15 && !pounceTimeoutRef.current && stateRef.current !== 'laser-pounce') {
        setState('pounce-prep');
        pounceTimeoutRef.current = setTimeout(() => {
          pounceTimeoutRef.current = null;
          perchXRef.current = targetX;
          perchYRef.current = targetY;
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
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (pounceTimeoutRef.current) {
        clearTimeout(pounceTimeoutRef.current);
        pounceTimeoutRef.current = null;
      }
    };
  }, [isLaserActive, isEnabled, isPaused]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if (isReducedMotion) return;
      if ((e.target as HTMLElement).closest('button, input')) return;

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
        initialPerchX: perchXRef.current,
        initialPerchY: isSnappedToDock ? 36 : perchYRef.current,
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

        const wasAbused = dragStartTimeRef.current !== null && Date.now() - dragStartTimeRef.current > 2500;
        dragStartTimeRef.current = null;

        const dragInfo = dragStartRef.current;
        dragStartRef.current = null;

        if (wasAbused) {
          triggerAnnoyanceReaction('drag_abuse');
        } else {
          const speed = dragInfo ? Math.sqrt(dragInfo.vx * dragInfo.vx + dragInfo.vy * dragInfo.vy) : 0;
          if (speed > 0.45) {
            transitionTo('fling-air', 400, () => {
              transitionTo('landing', 350);
            });
          } else {
            transitionTo('landing', 350);
          }
        }

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
    },
    [isReducedMotion, isSnappedToDock, clearStateTimer, triggerAnnoyanceReaction, transitionTo]
  );

  useEffect(() => {
    if (!isEnabled) {
      clearStateTimer();
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (loafTimerRef.current) clearTimeout(loafTimerRef.current);
      if (organicScheduleTimerRef.current) clearTimeout(organicScheduleTimerRef.current);
      if (typingSettleTimerRef.current) clearTimeout(typingSettleTimerRef.current);
      if (dreamIntervalRef.current) clearInterval(dreamIntervalRef.current);
      if (pounceTimeoutRef.current) clearTimeout(pounceTimeoutRef.current);
      setState('idle');
      setPacingOffset(0);
      setDodgeOffsetX(0);
      setIsDragging(false);
      setDragTilt(0);
      setIsLaserActive(false);
    } else {
      resetInactivityTimer(true);
    }
    return () => {
      clearStateTimer();
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (loafTimerRef.current) clearTimeout(loafTimerRef.current);
      if (organicScheduleTimerRef.current) clearTimeout(organicScheduleTimerRef.current);
      if (typingSettleTimerRef.current) clearTimeout(typingSettleTimerRef.current);
      if (dreamIntervalRef.current) clearInterval(dreamIntervalRef.current);
      if (pounceTimeoutRef.current) clearTimeout(pounceTimeoutRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (levelBannerTimerRef.current) clearTimeout(levelBannerTimerRef.current);
    };
  }, [isEnabled, clearStateTimer, resetInactivityTimer]);

  useEffect(() => {
    if (!isEnabled) return;
    const driveTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setDrives((prev) =>
        stepFelineDrives(prev, {
          dtSec: 2,
          state,
          isTypingActive: Boolean(isTypingActive),
          cursorContext: cursorContext,
        })
      );
    }, 2000);

    const blinkTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 130);
    }, 4600);

    return () => {
      clearInterval(driveTimer);
      clearInterval(blinkTimer);
    };
  }, [isEnabled, state, Boolean(isTypingActive), cursorContext]);

  useEffect(() => {
    if (!isEnabled || typeof window === "undefined") return;
    let rafId: number | null = null;
    const onPointerMove = (e: PointerEvent) => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const petCenterX = window.innerWidth - (perchX + 34);
        const petCenterY = window.innerHeight - (perchY + 34);
        const nextGaze = computeGazeOffset({
          pointerX: e.clientX,
          pointerY: e.clientY,
          petCenterX,
          petCenterY,
        });
        setGazeOffset(nextGaze);
        const deltaX = e.clientX - petCenterX;
        if (Math.abs(deltaX) > 48) {
          setFacingDirection(deltaX < 0 ? "left" : "right");
        }
      });
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [isEnabled, perchX, perchY]);

  const mood: FelineMood = useMemo(() => deriveFelineMood(drives, state), [drives, state]);
  const tailPath: string = useMemo(() => computeTailPath(mood), [mood]);

    useEffect(() => {
    if (!isEnabled || typeof window === "undefined" || typeof document === "undefined") return;

    const scanLedges = () => {
      const candidates: Array<{ id: string; label: string; selector: string }> = [
        { id: "editor-pane", label: "Editor Ledge", selector: ".cm-editor" },
        { id: "preview-pane", label: "PDF Ledge", selector: ".pdf-preview-pane, [data-ledge='preview']" },
        { id: "toolbar-ledge", label: "Toolbar Ledge", selector: "header, .toolbar, [data-ledge='toolbar']" },
      ];
      const rects = candidates
        .map((c) => {
          const el = document.querySelector(c.selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { id: c.id, label: c.label, top: r.top, left: r.left, right: r.right, bottom: r.bottom };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      setAvailableLedges(extractWorkspaceLedges(window.innerWidth, window.innerHeight, rects));
    };

    scanLedges();
    window.addEventListener("resize", scanLedges, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scanLedges);
      observer.observe(document.body);
    }
    return () => {
      window.removeEventListener("resize", scanLedges);
      observer?.disconnect();
    };
  }, [isEnabled]);

  const handleZonePet = useCallback(
    (localX: number, localY: number, width = 68, height = 68): PettingZone => {
      const zone = classifyPettingZone(localX, localY, width, height);
      setLastPetZone(zone);
      setDrives((prev) => {
        const outcome = applyPettingZoneInteraction(prev, zone);
        setState(outcome.reaction as never);
        return outcome.drives;
      });
      return zone;
    },
    []
  );

  const jumpToLedge = useCallback(
    (ledgeId?: string) => {
      if (availableLedges.length === 0) return;
      const target = ledgeId
        ? availableLedges.find((l) => l.id === ledgeId) ?? availableLedges[0]
        : availableLedges[(availableLedges.findIndex((l) => l.id === activeLedgeId) + 1) % availableLedges.length];
      setActiveLedgeId(target.id);
      setState("pounce-leap" as never);
      setPerchX(Math.min(target.xMax, Math.max(target.xMin, perchX)));
      setPerchY(target.yBottom);
    },
    [availableLedges, activeLedgeId, perchX]
  );

  const updateScruffVelocity = useCallback((velocityX: number, dtSec = 0.016) => {
    setScruffTiltDeg((prev) => computeScruffPendulumTilt(velocityX, prev, dtSec));
  }, []);

  const toggleAudioMute = useCallback(() => {
    setIsAudioMuted((prev) => {
      const next = setFelineAudioMuted(!prev);
      if (!next) playFelineCue("trill", true);
      return next;
    });
  }, []);

  const triggerFelineSound = useCallback(
    (cue: FelineAudioCue): boolean => {
      if (isAudioMuted) return false;
      return playFelineCue(cue);
    },
    [isAudioMuted]
  );

  const setToyMode = useCallback(
    (mode: ActiveToyMode) => {
      setActiveToy((prev) => {
        const resolved = prev === mode ? "none" : mode;
        if (resolved === "laser") {
          setState("laser-chase" as never);
          if (!isAudioMuted) playFelineCue("chirp");
        } else if (resolved === "yarn") {
          setState("yarn-chase" as never);
          setYarnBall({ x: perchX + 64, y: perchY + 48, vx: 180, vy: 260, angleDeg: 0, radius: 11 });
          if (!isAudioMuted) playFelineCue("trill");
        }
        return resolved;
      });
    },
    [isAudioMuted, perchX, perchY]
  );

  const swatToyYarn = useCallback(() => {
    setYarnBall((prev) => batYarnBall(prev, facingDirection));
    setState("yarn-chase" as never);
    if (!isAudioMuted) playFelineCue("chirp");
  }, [facingDirection, isAudioMuted]);

  useEffect(() => {
    if (!isEnabled || activeToy !== "yarn") return;
    const timer = setInterval(() => {
      const maxX = typeof window !== "undefined" ? Math.max(120, window.innerWidth - 40) : 900;
      setYarnBall((prev) => stepYarnBallPhysics(prev, { minX: 16, maxX, floorY: 16 }, 0.032));
    }, 32);
    return () => clearInterval(timer);
  }, [isEnabled, activeToy]);

return {
    isAudioMuted,
    activeToy,
    yarnBall,
    toggleAudioMute,
    triggerFelineSound,
    setToyMode,
    swatToyYarn,
    activeLedgeId,
    availableLedges,
    scruffTiltDeg,
    lastPetZone,
    handleZonePet,
    jumpToLedge,
    updateScruffVelocity,
    drives,
    mood,
    gazeOffset,
    facingDirection,
    isBlinking,
    tailPath,
    isEnabled,
    isExiting,
    entryVariant,
    exitVariant,
    setIsEnabled,
    toggleEnabled,
    state,
    direction,
    pacingOffset: isReducedMotion ? 0 : pacingOffset,
    dodgeOffsetX: isReducedMotion ? 0 : dodgeOffsetX,
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
    triggerRandomTrick,
    annoyanceLevel,
    annoyanceReason,
    scholarXp,
    scholarLevel: scholarInfo.level,
    scholarTitle: scholarInfo.title,
    scholarProgress: scholarInfo.progress,
    recentLevelUpBanner,
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

