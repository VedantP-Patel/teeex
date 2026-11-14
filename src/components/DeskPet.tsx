import React, { useState, useMemo, useEffect, useRef } from 'react';
import katex from 'katex';
import '../styles/deskPetEnhancements.css';
import {
  PRESTIGE_SKIN_UNLOCKS,
  PRESTIGE_ACCESSORY_UNLOCKS,
  type DeskPetActionState,
  type DeskPetSkin,
  type DeskPetAccessory,
  type DeskPetEntryVariant,
  type DeskPetExitVariant,
  type DeskPetRoamMode,
} from '../hooks/useDeskPet';
import {
  Heart,
  Sparkles,
  X,
  Moon,
  Volume2,
  VolumeX,
  Pin,
  Eye,
  Target,
  Box,
  Fish,
  BookOpen,
  Compass,
  Check,
  Coffee,
  Smile,
  Award,
  Flame,
  Music,
  Lock,
} from 'lucide-react';

export interface DeskPetProps {
  isEnabled: boolean;
  isExiting?: boolean;
  entryVariant?: DeskPetEntryVariant;
  exitVariant?: DeskPetExitVariant;
  state: DeskPetActionState;
  direction: 'left' | 'right';
  pacingOffset: number;
  dodgeOffsetX?: number;
  isSleeping: boolean;
  isReducedMotion: boolean;
  isPaused: boolean;
  petCount: number;
  skin?: DeskPetSkin;
  setSkin?: (skin: DeskPetSkin) => void;
  cycleSkin?: () => void;
  accessory?: DeskPetAccessory;
  setAccessory?: (acc: DeskPetAccessory) => void;
  cycleAccessory?: () => void;
  isSoundEnabled?: boolean;
  toggleSound?: () => void;
  volume?: number;
  setVolume?: (vol: number) => void;
  perchX?: number;
  perchY?: number;
  isSnappedToDock?: boolean;
  resetPositionToDock?: () => void;
  dragTilt?: number;
  isDragging?: boolean;
  startDrag?: (e: React.PointerEvent) => void;
  currentDreamFormula?: string;
  dockCollapsed?: boolean;
  onToggleEnabled?: () => void;
  triggerYarnChase?: () => void;
  triggerPet?: () => void;
  wakeUp?: () => void;
  toggleSleep?: () => void;
  roamMode?: DeskPetRoamMode;
  setRoamMode?: (mode: DeskPetRoamMode) => void;
  toggleRoamMode?: () => void;
  isTransitioning?: boolean;
  isLaserActive?: boolean;
  laserCoords?: { x: number; y: number };
  triggerLaser?: () => void;
  triggerBox?: () => void;
  triggerFish?: () => void;
  triggerKnuthCelebration?: () => void;
  triggerPeekABoo?: () => void;
  triggerSwatCursor?: () => void;
  triggerKnockMug?: () => void;
  triggerBellyFlop?: () => void;
  triggerEarScratch?: () => void;
  triggerNapYawn?: () => void;
  triggerRoam?: () => void;
  triggerRandomTrick?: () => void;
  annoyanceLevel?: number;
  annoyanceReason?: string | null;
  scholarXp?: number;
  scholarLevel?: number;
  scholarTitle?: string;
  scholarProgress?: number;
  recentLevelUpBanner?: string | null;
  addScholarXp?: (amount: number) => void;
  playSpecificAnimation?: (anim: DeskPetActionState, durationMs?: number) => void;
  triggerAnnoyanceReaction?: (reason?: string) => void;
  triggerPouncePrep?: () => void;
  triggerKneadDough?: () => void;
  triggerMidnightZoomies?: () => void;
  triggerSlowBlink?: () => void;
  triggerCheekBunt?: () => void;
  triggerCelloLeg?: () => void;
  triggerBlep?: () => void;
  triggerFlehmenSniff?: () => void;
  triggerMathZoomies?: () => void;
  triggerLoafWiggle?: () => void;
  triggerFocusScholar?: () => void;
  triggerQedCelebration?: () => void;
  onInsertFormula?: (formula: string) => void;
  onJumpToFirstError?: () => void;
}

interface SkinPalette {
  furFill: string;
  furStroke: string;
  chestFill: string;
  eyeColor: string;
  stripeColor?: string;
  earPink: string;
}

const SKIN_PALETTES: Record<DeskPetSkin, SkinPalette> = {
  tuxedo: {
    furFill: 'var(--pet-fur-fill, #1e293b)',
    furStroke: 'var(--pet-fur-stroke, #475569)',
    chestFill: 'var(--pet-chest-fill, #f8fafc)',
    eyeColor: '#38bdf8',
    earPink: '#fb7185',
  },
  ginger: {
    furFill: '#ea580c',
    furStroke: '#9a3412',
    chestFill: '#ffedd5',
    eyeColor: '#f59e0b',
    stripeColor: '#c2410c',
    earPink: '#fda4af',
  },
  calico: {
    furFill: '#f8fafc',
    furStroke: '#cbd5e1',
    chestFill: '#ea580c',
    eyeColor: '#10b981',
    stripeColor: '#1e293b',
    earPink: '#fb7185',
  },
  siamese: {
    furFill: '#fef3c7',
    furStroke: '#d97706',
    chestFill: '#451a03',
    eyeColor: '#0284c7',
    stripeColor: '#78350f',
    earPink: '#f472b6',
  },
  cyberpunk: {
    furFill: '#090d16',
    furStroke: '#38bdf8',
    chestFill: '#0284c7',
    eyeColor: '#a855f7',
    stripeColor: '#06b6d4',
    earPink: '#ec4899',
  },
  blueprint: {
    furFill: '#1e3a8a',
    furStroke: '#93c5fd',
    chestFill: '#dbeafe',
    eyeColor: '#fde047',
    stripeColor: '#60a5fa',
    earPink: '#38bdf8',
  },
  solarized: {
    furFill: '#eee8d5',
    furStroke: '#586e75',
    chestFill: '#fdf6e3',
    eyeColor: '#2aa198',
    stripeColor: '#93a1a1',
    earPink: '#d33682',
  },
  'gold-tex': {
    furFill: '#f59e0b',
    furStroke: '#78350f',
    chestFill: '#fef3c7',
    eyeColor: '#10b981',
    stripeColor: '#d97706',
    earPink: '#fb7185',
  },
};

export const DeskPet: React.FC<DeskPetProps> = ({
  isEnabled,
  isExiting = false,
  entryVariant = 'box',
  exitVariant = 'smoke',
  state,
  direction,
  pacingOffset,
  dodgeOffsetX = 0,
  isSleeping: _isSleeping,
  isReducedMotion,
  isPaused,
  petCount,
  skin = 'tuxedo',
  setSkin,
  cycleSkin,
  accessory = 'none',
  setAccessory,
  cycleAccessory,
  isSoundEnabled = false,
  toggleSound,
  volume = 0.6,
  setVolume,
  perchX = 28,
  perchY = 36,
  isSnappedToDock = true,
  resetPositionToDock,
  dragTilt = 0,
  isDragging = false,
  startDrag,
  currentDreamFormula = 'e^{i\\pi} + 1 = 0',
  dockCollapsed = true,
  onToggleEnabled,
  triggerYarnChase,
  triggerPet,
  wakeUp,
  toggleSleep,
  roamMode = 'dock',
  toggleRoamMode,
  isLaserActive = false,
  laserCoords = { x: 0, y: 0 },
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
  annoyanceLevel = 0,
  annoyanceReason = null,
  scholarXp = 0,
  scholarLevel = 1,
  scholarTitle = 'Novice Kitten',
  scholarProgress = 0,
  recentLevelUpBanner = null,
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
  onInsertFormula,
  onJumpToFirstError,
}) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const [companionTab, setCompanionTab] = useState<'play' | 'jukebox' | 'wardrobe' | 'settings'>('play');
  const [jukeboxFilter, setJukeboxFilter] = useState('');
  const [showHearts, setShowHearts] = useState(false);
  const [hasCopiedFormula, setHasCopiedFormula] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<HTMLDivElement>(null);
  const clickTimestampsRef = useRef<number[]>([]);
  const heartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProximityTriggerRef = useRef<number>(0);
  const lastPointerPosRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const [pupilOffset, setPupilOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!isEnabled || isPaused || isReducedMotion || state === 'sleep' || state === 'loaf' || isDragging) {
      setPupilOffset(prev => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
      return;
    }

    let rafId: number | null = null;
    let latestClientX = 0;
    let latestClientY = 0;

    const handlePointerMove = (e: PointerEvent) => {
      latestClientX = e.clientX;
      latestClientY = e.clientY;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (!mascotRef.current) return;
        const now = performance.now();
        const rect = mascotRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = latestClientX - centerX;
        const dy = latestClientY - centerY;
        const distSq = dx * dx + dy * dy;

        const prevPtr = lastPointerPosRef.current;
        lastPointerPosRef.current = { x: latestClientX, y: latestClientY, t: now };

        if (prevPtr && state === 'idle' && now - lastProximityTriggerRef.current > 6500) {
          const dtSec = Math.max(0.008, (now - prevPtr.t) / 1000);
          const speed = Math.hypot(latestClientX - prevPtr.x, latestClientY - prevPtr.y) / dtSec;
          if (distSq < 2600 && speed > 750) {
            lastProximityTriggerRef.current = now;
            triggerSwatCursor?.();
          } else if (distSq < 1800 && speed < 140) {
            lastProximityTriggerRef.current = now;
            triggerSlowBlink?.();
          }
        }

        if (distSq < 19600 && distSq > 25) {
          const distance = Math.sqrt(distSq);
          const lookRadius = Math.min(2, distance / 40);
          const nextX = (dx / distance) * lookRadius;
          const nextY = (dy / distance) * lookRadius;
          setPupilOffset(prev =>
            Math.abs(nextX - prev.x) > 0.08 || Math.abs(nextY - prev.y) > 0.08 ? { x: nextX, y: nextY } : prev
          );
        } else {
          setPupilOffset(prev => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
        }
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [isEnabled, isPaused, isReducedMotion, state, isDragging, triggerSwatCursor, triggerSlowBlink]);

  useEffect(() => {
    return () => {
      if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showToolbar) return;
    const handleGlobalClick = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowToolbar(false);
      }
    };
    window.addEventListener('pointerdown', handleGlobalClick);
    return () => window.removeEventListener('pointerdown', handleGlobalClick);
  }, [showToolbar]);

  const stateLabel = useMemo(() => {
    switch (state) {
      case 'lifted-scruff':
        return 'Dangling playfully by the scruff';
      case 'fling-air':
        return 'Gliding through the air with feline acrobatics!';
      case 'landing':
        return 'Landing softly onto the ledge';
      case 'typing-paws':
        return 'Typing furiously on RGB mechanical keyboard alongside you';
      case 'compiling-scholar':
        return 'Analyzing LaTeX manuscript with scholar glasses';
      case 'compile-success':
        return 'Celebrating successful PDF compilation! (Q.E.D.)';
      case 'compile-warning':
        return 'Inspecting document margins with typesetter tape measure';
      case 'compile-fail':
        return 'Investigating compile error diagnostics with magnifying glass';
      case 'knuth-texbook':
        return 'Honoring Donald Knuth with The TeXbook celebration!';
      case 'knuth-check':
        return "Proudly displaying Donald Knuth's $2.56 Bank of San Serriffe bug reward check!";
      case 'yarn-chase':
        return 'Chasing the bouncy cyan yarn ball!';
      case 'laser-chase':
      case 'laser-pounce':
        return 'Hunting and sprinting after the glowing red laser dot!';
      case 'box-sit':
        return 'Resting cozily inside the \\hbox{\\TeX} cardboard box ("if it fits, I sits")';
      case 'fish-feast':
        return 'Munching happily on a crunchy golden fish treat';
      case 'tail-chase':
        return 'Hilariously spinning in circles chasing its own fluffy tail!';
      case 'tail-flick':
        return 'Relaxing peacefully with rhythmic tail flicks';
      case 'curious-peep':
        return 'Curiously inspecting the desk edge';
      case 'peek-a-boo':
        return 'Peeking curiously from behind the dock ledge (Peek-a-boo!)';
      case 'swat-cursor':
        return 'Playfully swatting towards your cursor with an extended paw';
      case 'knock-mug':
        return 'Playfully tapping and knocking the mini TeX coffee mug off the ledge!';
      case 'coffee-sip':
        return 'Sipping warm espresso during a late-night typesetting session';
      case 'origami-crane':
        return 'Folding a crisp mathematical origami crane';
      case 'nap-yawn':
        return 'Yawning sleepily with an arched back stretch';
      case 'belly-flop':
        return 'Rolling playfully onto back begging for tummy rubs';
      case 'ear-scratch':
        return 'Scratching ear briskly with hind paw';
      case 'loaf':
        return 'Resting peacefully in tucked-paw loaf pose';
      case 'yoga-stretch':
        return 'Doing a refreshing yoga arch-back paw stretch';
      case 'butterfly-bat':
        return 'Playfully batting at a glowing pixel moth';
      case 'face-wash':
        return 'Washing whiskers and paws attentively';
      case 'sleep':
        return 'Sleeping peacefully, dreaming of LaTeX formulas';
      case 'waking-stretch':
        return 'Waking up with an arch-back stretch';
      case 'airplane-ears':
        return 'Flattening ears in mild disapproval (airplane ears)';
      case 'annoyed-hiss':
        return 'Arching back and hissing defensively!';
      case 'swat-aggressive':
        return 'Double swatting paws in annoyance!';
      case 'tail-thump':
        return 'Thumping tail heavily on the desk in irritation';
      case 'cold-shoulder':
        return 'Turning back to you in cold feline aloofness';
      case 'facepalm-paw':
        return 'Exasperated paw to face at LaTeX syntax errors';
      case 'paper-shred':
        return 'Fiercely shredding bad mathematical syntax scrap';
      case 'glare-judge':
        return 'Silently judging your code with narrow slitted eyes';
      case 'dizzy-wobble':
        return 'Wobbling with dizziness after being swung around';
      case 'keyboard-sprawl':
        return 'Sprawling across the keyboard demanding your undivided attention!';
      case 'hairball-cough':
        return 'Coughing melodramatically over an unclosed curly brace';
      case 'drama-flop':
        return 'Collapsing with dramatic feline theatricality';
      case 'pounce-prep':
        return 'Wiggling butt in pre-pounce concentration!';
      case 'flehmen-sniff':
        return 'Making an open-mouthed Flehmen grimace after smelling that syntax';
      case 'knead-dough':
        return 'Rhythmically making biscuits with front paws';
      case 'midnight-zoomies':
        return 'Sprinting at top speed across the desktop (midnight zoomies)!';
      case 'slow-blink':
        return 'Offering a slow, affectionate blink of feline trust';
      case 'cheek-bunt':
        return 'Rubbing cheek against the screen ledge to scent-mark its territory';
      case 'cello-leg':
        return 'Grooming hind leg vertically in classic cello position';
      case 'blep':
        return 'Staring into space with a derpy pink tongue blep';
      case 'math-zoomies':
        return 'Running laps scattering LaTeX symbols in its wake';
      case 'loaf-wiggle':
        return 'Wiggling into the ultimate comfy loaf position';
      case 'focus-scholar':
        return 'Meditating in deep LaTeX focus and inner calm';
      case 'qed-celebration':
        return 'Triumphantly pumping paw at proof completion (Q.E.D.)!';
      case 'walk':
        return roamMode === 'free' ? 'Wandering freely across desktop perches' : 'Pacing along the ledge';
      case 'idle':
      default:
        return 'Sitting attentively on the ledge';
    }
  }, [state, roamMode]);

  const activePalette = SKIN_PALETTES[skin] || SKIN_PALETTES.tuxedo;

  const dockHeight = dockCollapsed ? 32 : 180;
  const bottomPosition = isSnappedToDock ? dockHeight + 4 : perchY;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    clickTimestampsRef.current = [...clickTimestampsRef.current.filter(t => now - t < 1200), now];

    if (clickTimestampsRef.current.length >= 5) {
      clickTimestampsRef.current = [];
      triggerAnnoyanceReaction?.('click_spam');
      return;
    }

    if (e.detail >= 3 || clickTimestampsRef.current.length === 3) {
      setShowToolbar(prev => !prev);
      return;
    }

    if (state === 'sleep' || state === 'loaf') {
      if (state === 'sleep') {
        if (triggerAnnoyanceReaction) {
          triggerAnnoyanceReaction('disturbed_sleep');
        } else if (playSpecificAnimation) {
          playSpecificAnimation('drama-flop', 3200);
        } else {
          wakeUp?.();
        }
      } else {
        wakeUp?.();
      }
    } else {
      triggerPet?.();
      setShowHearts(true);
      if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
      heartTimerRef.current = setTimeout(() => {
        setShowHearts(false);
        heartTimerRef.current = null;
      }, 1400);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerYarnChase?.();
  };

  const handleCopyFormula = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(currentDreamFormula);
      }
    } catch {
      // Ignore
    }
    if (onInsertFormula && currentDreamFormula) {
      onInsertFormula(currentDreamFormula);
    }
    setHasCopiedFormula(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setHasCopiedFormula(false);
      copyTimerRef.current = null;
    }, 1600);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const key = e.key.toLowerCase();
    if (key === ' ' || key === 'enter') {
      e.preventDefault();
      handleClick(e as unknown as React.MouseEvent);
    } else if (key === 'y') {
      e.preventDefault();
      triggerYarnChase?.();
    } else if (key === 'p') {
      e.preventDefault();
      triggerPeekABoo?.();
    } else if (key === 'l') {
      e.preventDefault();
      triggerLaser?.();
    } else if (key === 'b') {
      e.preventDefault();
      triggerBox?.();
    } else if (key === 'f') {
      e.preventDefault();
      triggerFish?.();
    } else if (key === 'k') {
      e.preventDefault();
      triggerKnuthCelebration?.();
    } else if (key === 'r') {
      e.preventDefault();
      toggleRoamMode?.();
    } else if (key === 'w') {
      e.preventDefault();
      triggerRoam?.();
    } else if (key === 's') {
      e.preventDefault();
      if (toggleSleep) {
        toggleSleep();
      } else {
        wakeUp?.();
      }
    } else if (key === 'c') {
      e.preventDefault();
      cycleSkin?.();
    } else if (key === 'a') {
      e.preventDefault();
      cycleAccessory?.();
    } else if (key === 'm') {
      e.preventDefault();
      toggleSound?.();
    } else if (key === 'u') {
      e.preventDefault();
      triggerKnockMug?.();
    } else if (key === 't') {
      e.preventDefault();
      triggerSwatCursor?.();
    } else if (key === 'g') {
      e.preventDefault();
      triggerBellyFlop?.();
    } else if (key === 'e') {
      e.preventDefault();
      triggerEarScratch?.();
    } else if (key === 'z') {
      e.preventDefault();
      triggerNapYawn?.();
    } else if (key === 'o') {
      e.preventDefault();
      setShowToolbar(prev => !prev);
    } else if (key === 'escape') {
      setShowToolbar(false);
    }
  };

  const renderedDreamHtml = useMemo(() => {
    try {
      return katex.renderToString(currentDreamFormula, { displayMode: false, throwOnError: false });
    } catch {
      return currentDreamFormula;
    }
  }, [currentDreamFormula]);

  const matchesJukeboxFilter = (label: string) => {
    const q = jukeboxFilter.trim().toLowerCase();
    return !q || label.toLowerCase().includes(q);
  };

  if (!isEnabled && !isExiting) {
    return null;
  }

  return (
    <>
      {isLaserActive && (
        <div
          className="pet-laser-dot"
          style={{
            position: 'fixed',
            left: laserCoords.x - 7,
            top: laserCoords.y - 7,
            width: 14,
            height: 14,
            borderRadius: '50%',
            backgroundColor: '#ef4444',
            boxShadow: '0 0 16px 4px #ef4444, 0 0 4px #ffffff',
            pointerEvents: 'none',
            zIndex: 1000,
            animation: 'pulse 0.8s infinite alternate',
          }}
        />
      )}

      <div
        ref={containerRef}
        className={`desk-pet-container skin-${skin} ${isPaused ? 'is-paused' : ''} ${isDragging ? 'is-dragging' : ''} entry-${entryVariant} ${isExiting ? `exit-${exitVariant}` : ''}`}
        style={{
          position: 'fixed',
          right: perchX,
          bottom: bottomPosition,
          zIndex: 900,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: typeof window !== 'undefined' && perchX > window.innerWidth * 0.45 ? 'flex-start' : 'flex-end',
          transition:
            isReducedMotion || isDragging
              ? 'none'
              : 'bottom 0.28s cubic-bezier(0.16, 1, 0.3, 1), right 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {showToolbar && (
          <div
            role="dialog"
            aria-label="TeXCat Desk Companion Menu"
            className="texcat-companion-card"
          >
            <div className="companion-card-header">
              <div className="companion-header-title">
                <span style={{ fontSize: 13 }}>{'\u{1F431}'}</span>
                <span>TeXCat</span>
                <span className="companion-state-badge">{state.replace('-', ' ')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: 10,
                    color: '#f43f5e',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    fontWeight: 600,
                  }}
                >
                  <Heart size={10} fill="#f43f5e" /> {petCount}
                </span>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ padding: '2px 4px', fontSize: 11, color: 'var(--text-muted)' }}
                  onClick={e => {
                    e.stopPropagation();
                    setShowToolbar(false);
                  }}
                  aria-label="Close menu"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            <div className="scholar-xp-container">
              <div className="scholar-xp-header">
                <span className="scholar-xp-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Award size={11} color="#38bdf8" /> Lv.{scholarLevel} {scholarTitle}
                </span>
                <span>{scholarXp} XP</span>
              </div>
              <div className="scholar-xp-bar">
                <div className="scholar-xp-fill" style={{ width: `${Math.round(scholarProgress * 100)}%` }} />
              </div>
              {annoyanceLevel > 0 && (
                <div className="annoyance-meter" style={{ marginTop: 4 }}>
                  <span className="annoyance-meter-badge">
                    <Flame size={10} color="#fb7185" /> Annoyance: {annoyanceLevel}%{' '}
                    {annoyanceReason ? `(${annoyanceReason.replace('_', ' ')})` : ''}
                  </span>
                </div>
              )}
            </div>

            <div className="companion-tabs">
              <button
                type="button"
                className={`companion-tab-btn ${companionTab === 'play' ? 'is-active' : ''}`}
                onClick={e => {
                  e.stopPropagation();
                  setCompanionTab('play');
                }}
              >
                Play & Toys
              </button>
              <button
                type="button"
                className={`companion-tab-btn ${companionTab === 'wardrobe' ? 'is-active' : ''}`}
                onClick={e => {
                  e.stopPropagation();
                  setCompanionTab('wardrobe');
                }}
              >
                Wardrobe
              </button>
              <button
                type="button"
                className={`companion-tab-btn ${companionTab === 'settings' ? 'is-active' : ''}`}
                onClick={e => {
                  e.stopPropagation();
                  setCompanionTab('settings');
                }}
              >
                Settings
              </button>
              <button
                type="button"
                className={`companion-tab-btn ${companionTab === 'jukebox' ? 'is-active' : ''}`}
                onClick={e => {
                  e.stopPropagation();
                  setCompanionTab('jukebox');
                }}
                title="Animation Jukebox to preview any of 35+ animations on demand"
              >
                <Music size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                Jukebox
              </button>
            </div>

            {companionTab === 'play' && (
              <div className="companion-toy-grid">
                <button
                  type="button"
                  className={`companion-toy-chip ${isLaserActive ? 'is-active' : ''}`}
                  onClick={e => {
                    e.stopPropagation();
                    triggerLaser?.();
                  }}
                  title="Toggle red laser pointer sprint & pounce chase (L)"
                >
                  <Target size={12} color={isLaserActive ? '#ef4444' : '#f87171'} />
                  <span>Laser Chase</span>
                </button>

                <button
                  type="button"
                  className="companion-toy-chip"
                  onClick={e => {
                    e.stopPropagation();
                    triggerBox?.();
                  }}
                  title="Rest in cozy \hbox cardboard box (B)"
                >
                  <Box size={12} color="#f59e0b" />
                  <span>Box</span>
                </button>

                <button
                  type="button"
                  className="companion-toy-chip"
                  onClick={e => {
                    e.stopPropagation();
                    triggerFish?.();
                  }}
                  title="Crunchy golden fish treat (F)"
                >
                  <Fish size={12} color="#10b981" />
                  <span>Fish Snack</span>
                </button>

                <button
                  type="button"
                  className="companion-toy-chip"
                  onClick={e => {
                    e.stopPropagation();
                    triggerYarnChase?.();
                  }}
                  title="Toss bouncy yarn ball (Y)"
                >
                  <Sparkles size={12} color="#38bdf8" />
                  <span>Yarn Ball</span>
                </button>

                <button
                  type="button"
                  className="companion-toy-chip"
                  onClick={e => {
                    e.stopPropagation();
                    triggerKnockMug?.();
                  }}
                  title="Playfully knock TeX mug off ledge (U)"
                >
                  <Coffee size={12} color="#f97316" />
                  <span>Knock Mug</span>
                </button>

                <button
                  type="button"
                  className="companion-toy-chip"
                  onClick={e => {
                    e.stopPropagation();
                    triggerPeekABoo?.();
                  }}
                  title="Peek-a-boo hiding behind dock (P)"
                >
                  <Eye size={12} color="#38bdf8" />
                  <span>Peek-a-Boo</span>
                </button>

                <button
                  type="button"
                  className="companion-toy-chip"
                  onClick={e => {
                    e.stopPropagation();
                    triggerBellyFlop?.();
                  }}
                  title="Playful belly-up flop (G)"
                >
                  <Smile size={12} color="#ec4899" />
                  <span>Belly Flop</span>
                </button>

                <button
                  type="button"
                  className="companion-toy-chip"
                  onClick={e => {
                    e.stopPropagation();
                    triggerKnuthCelebration?.();
                  }}
                  title="Donald Knuth $2.56 reward check celebration (K)"
                >
                  <BookOpen size={12} color="#a855f7" />
                  <span>Knuth Check</span>
                </button>
              </div>
            )}

            {companionTab === 'jukebox' && (
              <div className="companion-jukebox-container">
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  <input
                    type="text"
                    value={jukeboxFilter}
                    onChange={e => setJukeboxFilter(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => e.stopPropagation()}
                    placeholder="Filter 35+ animations..."
                    aria-label="Filter animations"
                    style={{
                      flex: 1,
                      fontSize: 10.5,
                      padding: '3px 6px',
                      borderRadius: 4,
                      border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
                      background: 'rgba(15, 23, 42, 0.6)',
                      color: 'inherit',
                      outline: 'none',
                    }}
                  />
                  {triggerRandomTrick && (
                    <button
                      type="button"
                      className="companion-jukebox-chip"
                      style={{ width: 'auto', padding: '3px 7px', flexShrink: 0 }}
                      onClick={e => {
                        e.stopPropagation();
                        triggerRandomTrick();
                      }}
                      title="Play a random trick"
                    >
                      <Sparkles size={10} color="#38bdf8" />
                      <span>Surprise</span>
                    </button>
                  )}
                </div>

                <div className="companion-jukebox-section">
                  <div className="companion-jukebox-title">Authentic Cat Behaviors</div>
                  <div className="companion-jukebox-grid">
                    {matchesJukeboxFilter('Biscuits Dough knead') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'knead-dough' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          triggerKneadDough ? triggerKneadDough() : playSpecificAnimation?.('knead-dough', 3000);
                        }}
                      >
                        <span>{'\u{1F950}'} Biscuits Dough</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Butt Wiggle pounce') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'pounce-prep' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          triggerPouncePrep ? triggerPouncePrep() : playSpecificAnimation?.('pounce-prep', 2400);
                        }}
                      >
                        <span>{'\u{1F3AF}'} Butt Wiggle</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('3 AM Zoomies midnight') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'midnight-zoomies' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          triggerMidnightZoomies
                            ? triggerMidnightZoomies()
                            : playSpecificAnimation?.('midnight-zoomies', 2800);
                        }}
                      >
                        <span>{'\u{1F680}'} 3 AM Zoomies</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Love Blink slow') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'slow-blink' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          triggerSlowBlink ? triggerSlowBlink() : playSpecificAnimation?.('slow-blink', 3000);
                        }}
                      >
                        <span>{'\u{1F496}'} Love Blink</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Cheek Bunt') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'cheek-bunt' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          triggerCheekBunt ? triggerCheekBunt() : playSpecificAnimation?.('cheek-bunt', 2400);
                        }}
                      >
                        <span>{'\u{1F970}'} Cheek Bunt</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Cello Leg groom') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'cello-leg' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          triggerCelloLeg ? triggerCelloLeg() : playSpecificAnimation?.('cello-leg', 3200);
                        }}
                      >
                        <span>{'\u{1F3BB}'} Cello Leg</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Tongue Blep') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'blep' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          triggerBlep ? triggerBlep() : playSpecificAnimation?.('blep', 3000);
                        }}
                      >
                        <span>{'\u{1F445}'} Tongue Blep</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Flehmen Grimace sniff') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'flehmen-sniff' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          triggerFlehmenSniff ? triggerFlehmenSniff() : playSpecificAnimation?.('flehmen-sniff', 2800);
                        }}
                      >
                        <span>{'\u{1F443}'} Flehmen Grimace</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Loaf Wiggle') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'loaf-wiggle' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          triggerLoafWiggle ? triggerLoafWiggle() : playSpecificAnimation?.('loaf-wiggle', 2400);
                        }}
                      >
                        <span>{'\u{1F35E}'} Loaf Wiggle</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Zen Scholar focus') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'focus-scholar' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          triggerFocusScholar ? triggerFocusScholar() : playSpecificAnimation?.('focus-scholar', 4000);
                        }}
                      >
                        <span>{'\u{1F9D8}'} Zen Scholar</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Q.E.D. Proof celebration') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'qed-celebration' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          triggerQedCelebration
                            ? triggerQedCelebration()
                            : playSpecificAnimation?.('qed-celebration', 3200);
                        }}
                      >
                        <span>{'\u{1F3C6}'} Q.E.D. Proof</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Math Zoomies') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'math-zoomies' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          triggerMathZoomies ? triggerMathZoomies() : playSpecificAnimation?.('math-zoomies', 2800);
                        }}
                      >
                        <span>{'\u{1F4D0}'} Math Zoomies</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="companion-jukebox-section">
                  <div className="companion-jukebox-title" style={{ color: '#fb7185' }}>
                    Feline Annoyances
                  </div>
                  <div className="companion-jukebox-grid">
                    {matchesJukeboxFilter('Airplane Ears') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'airplane-ears' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('airplane-ears', 2200);
                        }}
                      >
                        <span>{'\u2708\uFE0F'} Airplane Ears</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Angry Hiss') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'annoyed-hiss' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('annoyed-hiss', 1800);
                        }}
                      >
                        <span>{'\u{1F63E}'} Angry Hiss</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Double Swat') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'swat-aggressive' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('swat-aggressive', 1400);
                        }}
                      >
                        <span>{'\u{1F4A5}'} Double Swat</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Desk Tail Thump') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'tail-thump' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('tail-thump', 2400);
                        }}
                      >
                        <span>{'\u{1F941}'} Desk Tail Thump</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Cold Shoulder') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'cold-shoulder' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('cold-shoulder', 3200);
                        }}
                      >
                        <span>{'\u2744\uFE0F'} Cold Shoulder</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Error Facepalm') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'facepalm-paw' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('facepalm-paw', 2600);
                        }}
                      >
                        <span>{'\u{1F926}'} Error Facepalm</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Paper Shred') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'paper-shred' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('paper-shred', 2000);
                        }}
                      >
                        <span>{'\u{1F4C4}'} Paper Shred</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Judging Glare') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'glare-judge' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('glare-judge', 3000);
                        }}
                      >
                        <span>{'\u{1F441}\uFE0F'} Judging Glare</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Dizzy Wobble') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'dizzy-wobble' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('dizzy-wobble', 2600);
                        }}
                      >
                        <span>{'\u{1F4AB}'} Dizzy Wobble</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Keyboard Sprawl') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'keyboard-sprawl' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('keyboard-sprawl', 3500);
                        }}
                      >
                        <span>{'\u2328\uFE0F'} Keyboard Sprawl</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Brace Cough hairball') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'hairball-cough' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('hairball-cough', 2400);
                        }}
                      >
                        <span>{'\u{1F4E6}'} Brace Cough</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Melodrama Flop') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'drama-flop' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('drama-flop', 2800);
                        }}
                      >
                        <span>{'\u{1F3AD}'} Melodrama Flop</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="companion-jukebox-section">
                  <div className="companion-jukebox-title">Classics & Tricks</div>
                  <div className="companion-jukebox-grid">
                    {matchesJukeboxFilter('Espresso Coffee Sip') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'coffee-sip' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('coffee-sip', 3200);
                        }}
                      >
                        <span>{'\u2615'} Espresso Sip</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Origami Crane') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'origami-crane' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('origami-crane', 3200);
                        }}
                      >
                        <span>{'\u{1F54A}\uFE0F'} Origami Crane</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Laser Pounce') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'laser-pounce' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('laser-pounce', 1800);
                        }}
                      >
                        <span>{'\u26A1'} Laser Pounce</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Tail Chase') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'tail-chase' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('tail-chase', 2000);
                        }}
                      >
                        <span>{'\u{1F504}'} Tail Chase</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Yoga Stretch') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'yoga-stretch' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('yoga-stretch', 2200);
                        }}
                      >
                        <span>{'\u{1F9D8}'} Yoga Stretch</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Paw Face Wash') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'face-wash' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('face-wash', 2200);
                        }}
                      >
                        <span>{'\u{1F9FC}'} Paw Face Wash</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('Butterfly Bat') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'butterfly-bat' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('butterfly-bat', 2400);
                        }}
                      >
                        <span>{'\u{1F98B}'} Butterfly Bat</span>
                      </button>
                    )}
                    {matchesJukeboxFilter('The TeXbook Knuth') && (
                      <button
                        type="button"
                        className={`companion-jukebox-chip ${state === 'knuth-texbook' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          playSpecificAnimation?.('knuth-texbook', 3200);
                        }}
                      >
                        <span>{'\u{1F4D6}'} The TeXbook</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {companionTab === 'wardrobe' && (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Coat Skin ({skin})
                </div>
                <div className="companion-swatches-row">
                  {(['tuxedo', 'ginger', 'calico', 'siamese', 'cyberpunk'] as DeskPetSkin[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      className={`coat-swatch-circle ${skin === s ? 'is-active' : ''}`}
                      style={{
                        backgroundColor:
                          s === 'tuxedo'
                            ? '#1e293b'
                            : s === 'ginger'
                            ? '#ea580c'
                            : s === 'calico'
                            ? '#f8fafc'
                            : s === 'siamese'
                            ? '#fef3c7'
                            : '#090d16',
                        border: s === 'calico' ? '1px solid #94a3b8' : 'none',
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        setSkin?.(s);
                      }}
                      title={`Switch coat to ${s}`}
                      aria-label={`${s} skin`}
                    >
                      {skin === s && <Check size={11} color={s === 'calico' || s === 'siamese' ? '#0f172a' : '#ffffff'} />}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    fontSize: 9.5,
                    color: 'var(--text-muted)',
                    margin: '6px 0 4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Prestige Coats (XP Unlocks)
                </div>
                <div className="companion-swatches-row">
                  {PRESTIGE_SKIN_UNLOCKS.map(p => {
                    const unlocked = scholarLevel >= p.unlockLevel;
                    const bg = p.id === 'blueprint' ? '#1e3a8a' : p.id === 'solarized' ? '#eee8d5' : '#f59e0b';
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!unlocked}
                        className={`prestige-swatch-circle ${skin === p.id ? 'is-active' : ''}`}
                        style={{
                          backgroundColor: bg,
                          opacity: unlocked ? 1 : 0.45,
                          cursor: unlocked ? 'pointer' : 'not-allowed',
                          border: '1px dashed #38bdf8',
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          if (unlocked) setSkin?.(p.id);
                        }}
                        title={unlocked ? `${p.label} (Prestige)` : `Unlocks at Scholar Lv.${p.unlockLevel}`}
                        aria-label={`${p.label} prestige skin`}
                      >
                        {!unlocked ? (
                          <Lock size={9} color={p.id === 'solarized' ? '#0f172a' : '#ffffff'} />
                        ) : (
                          skin === p.id && <Check size={11} color={p.id === 'solarized' ? '#0f172a' : '#ffffff'} />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    margin: '6px 0 4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Academic Attire ({accessory})
                </div>
                <div className="outfit-chips-grid">
                  {(['none', 'mortarboard', 'scarf', 'detective', 'bowtie'] as DeskPetAccessory[]).map(acc => (
                    <button
                      key={acc}
                      type="button"
                      className={`outfit-chip ${accessory === acc ? 'is-active' : ''}`}
                      onClick={e => {
                        e.stopPropagation();
                        setAccessory?.(acc);
                      }}
                    >
                      {acc === 'none' ? 'No Outfit' : acc}
                    </button>
                  ))}
                  {PRESTIGE_ACCESSORY_UNLOCKS.map(acc => {
                    const unlocked = scholarLevel >= acc.unlockLevel;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        disabled={!unlocked}
                        className={`outfit-chip ${accessory === acc.id ? 'is-active' : ''}`}
                        style={{
                          opacity: unlocked ? 1 : 0.5,
                          cursor: unlocked ? 'pointer' : 'not-allowed',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          if (unlocked) setAccessory?.(acc.id);
                        }}
                        title={unlocked ? acc.label : `Unlocks at Scholar Lv.${acc.unlockLevel}`}
                      >
                        {!unlocked && <Lock size={9} />}
                        <span>{unlocked ? acc.id : `Lv.${acc.unlockLevel} ${acc.id}`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {companionTab === 'settings' && (
              <div className="companion-settings-group">
                <div className="companion-settings-row">
                  <span>Navigation:</span>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ padding: '2px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    onClick={e => {
                      e.stopPropagation();
                      toggleRoamMode?.();
                    }}
                  >
                    <Compass size={11} color={roamMode === 'free' ? '#38bdf8' : '#94a3b8'} />
                    <span>{roamMode === 'dock' ? 'Dock Patrol' : 'Safe Perches'}</span>
                  </button>
                </div>

                <div className="companion-settings-row">
                  <span>Dock Ledge:</span>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      color: '#38bdf8',
                    }}
                    onClick={e => {
                      e.stopPropagation();
                      resetPositionToDock?.();
                    }}
                    title="Return position to bottom status dock ledge"
                  >
                    <Pin size={11} color="#38bdf8" />
                    <span>Return to Ledge</span>
                  </button>
                </div>

                <div className="companion-settings-row">
                  <span>Sound ({Math.round((volume || 0.6) * 100)}%):</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ padding: '2px 4px' }}
                      onClick={e => {
                        e.stopPropagation();
                        toggleSound?.();
                      }}
                      title="Toggle sound"
                    >
                      {isSoundEnabled ? (
                        <Volume2 size={12} color="#10b981" />
                      ) : (
                        <VolumeX size={12} color="var(--text-muted)" />
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume ?? 0.6}
                      onChange={e => {
                        e.stopPropagation();
                        setVolume?.(parseFloat(e.target.value));
                      }}
                      style={{ width: 60, height: 4, cursor: 'pointer' }}
                    />
                  </div>
                </div>

                <div className="companion-settings-row">
                  <span>Power State:</span>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ padding: '2px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    onClick={e => {
                      e.stopPropagation();
                      if (toggleSleep) {
                        toggleSleep();
                      } else {
                        wakeUp?.();
                      }
                    }}
                  >
                    <Moon size={11} color="#a855f7" />
                    <span>{state === 'sleep' ? 'Wake Up (S)' : 'Sleep (S)'}</span>
                  </button>
                </div>

                <div
                  style={{
                    width: '100%',
                    height: 1,
                    backgroundColor: 'var(--border-subtle, rgba(255,255,255,0.08))',
                    margin: '2px 0',
                  }}
                />

                <button
                  type="button"
                  className="btn-ghost"
                  style={{
                    width: '100%',
                    padding: '3px 0',
                    fontSize: 10.5,
                    color: '#f87171',
                    justifyContent: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    onToggleEnabled?.();
                  }}
                >
                  <X size={11} />
                  <span>Turn Off Companion</span>
                </button>
              </div>
            )}
          </div>
        )}

        <div
          ref={mascotRef}
          className="desk-pet-mascot-wrapper"
          style={{
            pointerEvents: 'auto',
            position: 'relative',
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none',
            transform: isReducedMotion
              ? 'none'
              : isDragging
              ? `rotate(${dragTilt}deg) scale(0.92, 1.12)`
              : state === 'fling-air'
              ? 'rotate(25deg) scale(0.95)'
              : `translate3d(-${pacingOffset + dodgeOffsetX}px, 0, 0)`,
            transition: isReducedMotion || isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerDown={startDrag}
          role="img"
          tabIndex={0}
          aria-label={`TeXCat Desk Companion: ${stateLabel}. Coat: ${skin}. Outfit: ${accessory}. Pet count: ${petCount}. (Triple-click for menu, drag anywhere in 2D, double-click for yarn)`}
          onKeyDown={handleKeyDown}
        >
          {recentLevelUpBanner && (
            <div className="texcat-levelup-toast" role="status">
              {'\u2728'} {recentLevelUpBanner}
            </div>
          )}

          {showHearts && (
            <div className="pet-heart-particles" aria-hidden="true">
              <span className="floating-heart heart-1">{'\u2665'}</span>
              <span className="floating-heart heart-2">{'\u2665'}</span>
              <span className="floating-heart heart-3">{'\u2665'}</span>
            </div>
          )}

          {state === 'sleep' && (
            <div className="pet-sleep-particles" aria-hidden="true">
              <span className="floating-z z-1">z</span>
              <span className="floating-z z-2">z</span>
              <span className="floating-z z-3">Z</span>
            </div>
          )}

          {state === 'sleep' && (
            <div
              className="pet-dream-bubble"
              role="button"
              tabIndex={0}
              onClick={handleCopyFormula}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCopyFormula(e as unknown as React.MouseEvent);
                }
              }}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              title={`\u2728 TeXCat's mathematical dream \u2014 click to insert into editor`}
            >
              <span className="dream-formula" dangerouslySetInnerHTML={{ __html: renderedDreamHtml }} />
              {hasCopiedFormula && (
                <span className="dream-bubble-inserted-badge">
                  <Sparkles size={9} /> Inserted!
                </span>
              )}
              <div className="dream-dots">
                <span className="dot dot-1" />
                <span className="dot dot-2" />
              </div>
            </div>
          )}

          {(state === 'compile-success' ||
            state === 'knuth-texbook' ||
            state === 'knuth-check' ||
            state === 'qed-celebration') && (
            <div className="pet-sparkle-particles" aria-hidden="true">
              <span className="floating-sparkle sparkle-1">{'\u2726'}</span>
              <span className="floating-sparkle sparkle-2">{'\u2727'}</span>
              <span className="floating-sparkle sparkle-3">{'\u22C6'}</span>
            </div>
          )}

          {state === 'yarn-chase' && (
            <div className="pet-yarn-ball pet-bouncy-ball" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" fill="#0284c7" stroke="#38bdf8" strokeWidth="2" />
                <path d="M6 12C9 8 15 8 18 12" stroke="#bae6fd" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M12 6C8 9 8 15 12 18" stroke="#bae6fd" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M18 15C19.5 17 21 19 23 18" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <div className="ball-bounce-trail" />
            </div>
          )}

          {state === 'butterfly-bat' && (
            <div className="pet-pixel-butterfly" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 4 Q 1 1 2 7 Q 5 6 6 8 Q 7 6 10 7 Q 11 1 8 4 Z" fill="#38bdf8" opacity="0.9" />
                <circle cx="8" cy="8" r="1.5" fill="#f8fafc" />
              </svg>
            </div>
          )}

          {state === 'compile-fail' && (
            <div
              className="pet-reaction-bubble reaction-fail"
              style={onJumpToFirstError ? { cursor: 'pointer' } : undefined}
              onClick={
                onJumpToFirstError
                  ? e => {
                      e.stopPropagation();
                      onJumpToFirstError();
                    }
                  : undefined
              }
              aria-hidden={!onJumpToFirstError}
            >
              <span>{'\u2753'} {onJumpToFirstError ? 'Jump to error' : 'Log alert'}</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'compile-warning' && (
            <div className="pet-reaction-bubble reaction-warning" aria-hidden="true">
              <span>{'\u{1F4D0}'} Margins ok</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'compile-success' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u2728'} Q.E.D.</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'knuth-texbook' && (
            <div className="pet-reaction-bubble reaction-knuth" aria-hidden="true">
              <span>{'\u{1F4D6}'} The TeXbook</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'knuth-check' && (
            <div className="pet-reaction-bubble reaction-knuth" aria-hidden="true">
              <span>{'\u{1F3C6}'} $2.56 Bug Reward</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'knock-mug' && (
            <div className="pet-reaction-bubble reaction-warning" aria-hidden="true">
              <span>{'\u2615'} Oops! (mug tap)</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'coffee-sip' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u2615'} *Sip...*</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'origami-crane' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F54A}\uFE0F'} Origami fold</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'swat-cursor' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F43E}'} Swat!</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'peek-a-boo' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F440}'} Peek-a-boo!</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'airplane-ears' && (
            <div className="pet-reaction-bubble reaction-warning" aria-hidden="true">
              <span>{'\u2708\uFE0F'} Unimpressed</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'annoyed-hiss' && (
            <div className="pet-reaction-bubble reaction-fail" aria-hidden="true">
              <span>{'\u{1F63E}'} *Hisss!*</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'swat-aggressive' && (
            <div className="pet-reaction-bubble reaction-fail" aria-hidden="true">
              <span>{'\u{1F4A5}'} *WHAP!*</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'tail-thump' && (
            <div className="pet-reaction-bubble reaction-warning" aria-hidden="true">
              <span>{'\u{1F941}'} *Thump...*</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'cold-shoulder' && (
            <div className="pet-reaction-bubble reaction-warning" aria-hidden="true">
              <span>{'\u2744\uFE0F'} Hmph.</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'facepalm-paw' && (
            <div className="pet-reaction-bubble reaction-fail" aria-hidden="true">
              <span>{'\u{1F926}'} *Sigh* (LaTeX syntax)</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'paper-shred' && (
            <div className="pet-reaction-bubble reaction-warning" aria-hidden="true">
              <span>{'\u{1F4C4}'} Shredding bad math</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'glare-judge' && (
            <div className="pet-reaction-bubble reaction-warning" aria-hidden="true">
              <span>{'\u{1F441}\uFE0F'} Judging your code</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'dizzy-wobble' && (
            <div className="pet-reaction-bubble reaction-warning" aria-hidden="true">
              <span>{'\u{1F4AB}'} Woah dizzy!</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'keyboard-sprawl' && (
            <div className="pet-reaction-bubble reaction-warning" aria-hidden="true">
              <span>{'\u2328\uFE0F'} Pet me now!</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'hairball-cough' && (
            <div className="pet-reaction-bubble reaction-warning" aria-hidden="true">
              <span>{'\u{1F4E6}'} *Agh!* (unclosed brace)</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'drama-flop' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F3AD}'} The melodrama!</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'pounce-prep' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F3AF}'} Butt wiggle locked on</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'laser-pounce' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u26A1'} Pounce!</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'knead-dough' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F950}'} Making biscuits</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'midnight-zoomies' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F680}'} 3 AM Zoomies!</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'slow-blink' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F496}'} Cat love & trust</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'cheek-bunt' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F970}'} Scent marked</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'cello-leg' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F3BB}'} Cello groom pose</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'blep' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F445}'} *Blep*</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'math-zoomies' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F4D0}'} \int Zoomies!</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'focus-scholar' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F9D8}'} LaTeX Zen Focus</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'qed-celebration' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>{'\u{1F3C6}'} Q.E.D. Complete!</span>
              <div className="bubble-arrow" />
            </div>
          )}

          {/* Procedural High-DPI Vector Mascot Rig */}
          <div
            className={`texcat-rig state-${state} ${state === 'landing' ? 'is-landing-squash' : ''} ${state === 'walk' && direction === 'left' ? 'facing-left' : ''}`}
            style={{
              width: 52,
              height: 52,
              position: 'relative',
              transformOrigin: 'bottom center',
            }}
          >
            <svg
              viewBox="0 0 64 64"
              width="52"
              height="52"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ overflow: 'visible' }}
            >
              <defs>
                <filter id="texcat-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.35" />
                </filter>
              </defs>

              <ellipse
                cx="32"
                cy="56"
                rx={state === 'lifted-scruff' ? 12 : state === 'loaf' ? 24 : 20}
                ry={state === 'lifted-scruff' ? 2 : 4}
                fill="rgba(0,0,0,0.25)"
                opacity={state === 'lifted-scruff' ? 0.35 : 0.8}
              />

              {/* Tail Layer */}
              <g className={`texcat-tail ${state === 'loaf' ? 'tail-tucked' : ''}`} style={{ transformOrigin: '48px 50px' }}>
                <path
                  d={
                    state === 'loaf'
                      ? 'M42 48 C 48 52, 36 56, 26 55'
                      : 'M44 48 C 54 44, 58 36, 56 30 C 54 26, 50 28, 51 32 C 52 38, 48 42, 42 46'
                  }
                  stroke={activePalette.furStroke}
                  strokeWidth="4"
                  strokeLinecap="round"
                  fill="none"
                />
              </g>

              {/* Cat Body */}
              <g className={`texcat-body ${state === 'loaf' ? 'body-loaf' : ''}`} filter="url(#texcat-shadow)">
                <ellipse
                  cx="32"
                  cy={state === 'loaf' ? 46 : 44}
                  rx={state === 'loaf' ? 18 : 15}
                  ry={state === 'loaf' ? 11 : 13}
                  fill={activePalette.furFill}
                  stroke={activePalette.furStroke}
                  strokeWidth="2"
                />

                {activePalette.stripeColor && (
                  <g className="texcat-stripes" opacity="0.45">
                    <path d="M22 41 L 28 43" stroke={activePalette.stripeColor} strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M42 41 L 36 43" stroke={activePalette.stripeColor} strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M20 46 L 26 47" stroke={activePalette.stripeColor} strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M44 46 L 38 47" stroke={activePalette.stripeColor} strokeWidth="1.5" strokeLinecap="round" />
                  </g>
                )}

                <ellipse
                  cx="32"
                  cy={state === 'loaf' ? 47 : 45}
                  rx={state === 'loaf' ? 10 : 8}
                  ry={state === 'loaf' ? 7 : 9}
                  fill={activePalette.chestFill}
                  opacity="0.8"
                />
              </g>

              {accessory === 'bowtie' && (
                <g className="texcat-accessory-bowtie" aria-hidden="true">
                  <polygon points="26,38 32,41 26,44" fill="#dc2626" />
                  <polygon points="38,38 32,41 38,44" fill="#dc2626" />
                  <circle cx="32" cy="41" r="2.2" fill="#b91c1c" />
                </g>
              )}

              {accessory === 'scarf' && (
                <g className="texcat-accessory-scarf" aria-hidden="true">
                  <ellipse cx="32" cy="38" rx="14" ry="4.5" fill="#b91c1c" stroke="#7f1d1d" strokeWidth="1" />
                  <line x1="22" y1="38" x2="42" y2="38" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 2" />
                  <path
                    d="M38 40 Q 42 48 40 54"
                    stroke="#b91c1c"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    fill="none"
                    className="scarf-flutter"
                  />
                  <line x1="38" y1="54" x2="42" y2="54" stroke="#fbbf24" strokeWidth="1.5" />
                </g>
              )}

              {/* Cat Head Layer */}
              <g className="texcat-head" style={{ transformOrigin: '32px 30px' }}>
                <g
                  className="texcat-ear-left-group"
                  style={{
                    transformOrigin: '23px 18px',
                    transform: state === 'airplane-ears' ? 'rotate(-35deg)' : undefined,
                    transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  <path
                    d="M19 22 L 23 10 L 31 18 Z"
                    fill={activePalette.furFill}
                    stroke={activePalette.furStroke}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    className="texcat-ear-left"
                  />
                  <path d="M22 19 L 24 13 L 29 18 Z" fill={activePalette.earPink} opacity="0.8" />
                </g>

                <g
                  className="texcat-ear-right-group"
                  style={{
                    transformOrigin: '41px 18px',
                    transform: state === 'airplane-ears' ? 'rotate(35deg)' : undefined,
                    transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  <path
                    d="M45 22 L 41 10 L 33 18 Z"
                    fill={activePalette.furFill}
                    stroke={activePalette.furStroke}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    className="texcat-ear-right"
                  />
                  <path d="M42 19 L 40 13 L 35 18 Z" fill={activePalette.earPink} opacity="0.8" />
                </g>

                <ellipse
                  cx="32"
                  cy="28"
                  rx="17"
                  ry="14"
                  fill={activePalette.furFill}
                  stroke={activePalette.furStroke}
                  strokeWidth="2"
                />

                <path d="M12 28 L 22 29 M 11 32 L 21 31" stroke="var(--text-muted, #94a3b8)" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M52 28 L 42 29 M 53 32 L 43 31" stroke="var(--text-muted, #94a3b8)" strokeWidth="1.2" strokeLinecap="round" />

                <polygon points="30,31 34,31 32,33" fill={activePalette.earPink} />

                {state === 'nap-yawn' ? (
                  <g className="texcat-mouth-yawn">
                    <ellipse cx="32" cy="35" rx="4.5" ry="5" fill="#f43f5e" />
                    <polygon points="29.5,32 31.5,32 30.5,34" fill="#ffffff" />
                    <polygon points="32.5,32 34.5,32 33.5,34" fill="#ffffff" />
                  </g>
                ) : state === 'annoyed-hiss' ? (
                  <g className="texcat-mouth-hiss">
                    <ellipse cx="32" cy="35" rx="4.5" ry="3.5" fill="#991b1b" />
                    <polygon points="29.5,33.5 31.5,33.5 30.5,36" fill="#ffffff" />
                    <polygon points="32.5,33.5 34.5,33.5 33.5,36" fill="#ffffff" />
                  </g>
                ) : state === 'blep' ? (
                  <g className="texcat-mouth-blep">
                    <path d="M30 34 Q 32 35 34 34" stroke="var(--text-muted, #94a3b8)" strokeWidth="1.5" fill="none" />
                    <ellipse cx="32" cy="36.5" rx="2" ry="2.5" fill="#f43f5e" />
                    <line x1="32" y1="35" x2="32" y2="38" stroke="#be123c" strokeWidth="0.8" />
                  </g>
                ) : state === 'flehmen-sniff' ? (
                  <g className="texcat-mouth-flehmen">
                    <path d="M29 33 Q 32 31 35 33 Q 32 37 29 33" stroke="var(--text-muted, #94a3b8)" strokeWidth="1.2" fill="#fda4af" />
                    <polygon points="30.5,33 31.5,33 31,34.5" fill="#ffffff" />
                    <polygon points="32.5,33 33.5,33 33,34.5" fill="#ffffff" />
                  </g>
                ) : (
                  <path
                    d="M30 34 Q 32 36 34 34"
                    stroke="var(--text-muted, #94a3b8)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                )}

                {state === 'sleep' ? (
                  <g className="texcat-eyes-sleep">
                    <path d="M22 27 Q 26 23 29 27" stroke="var(--text-primary, #f8fafc)" strokeWidth="2" strokeLinecap="round" fill="none" />
                    <path d="M35 27 Q 38 23 42 27" stroke="var(--text-primary, #f8fafc)" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </g>
                ) : state === 'slow-blink' ? (
                  <g className="texcat-eyes-slowblink">
                    <path d="M22 26.5 Q 26 25 29 26.5" stroke={activePalette.eyeColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
                    <path d="M35 26.5 Q 38 25 42 26.5" stroke={activePalette.eyeColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
                  </g>
                ) : state === 'loaf' ? (
                  <g className="texcat-eyes-loaf">
                    <path d="M22 27 Q 26 25 29 27" stroke={activePalette.eyeColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
                    <path d="M35 27 Q 38 25 42 27" stroke={activePalette.eyeColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
                  </g>
                ) : state === 'dizzy-wobble' ? (
                  <g className="texcat-eyes-dizzy">
                    <path d="M23 26 C 23 24, 27 24, 27 26 C 27 28, 24 28, 24 26" stroke="#f59e0b" strokeWidth="1.8" fill="none" />
                    <path d="M37 26 C 37 24, 41 24, 41 26 C 41 28, 38 28, 38 26" stroke="#f59e0b" strokeWidth="1.8" fill="none" />
                  </g>
                ) : state === 'glare-judge' || state === 'airplane-ears' ? (
                  <g className="texcat-eyes-glare">
                    <ellipse cx="25" cy="26" rx="3.5" ry="4" fill="#fef08a" />
                    <ellipse cx="39" cy="26" rx="3.5" ry="4" fill="#fef08a" />
                    <ellipse cx="25" cy="26" rx="1.2" ry="3.8" fill="#000" />
                    <ellipse cx="39" cy="26" rx="1.2" ry="3.8" fill="#000" />
                  </g>
                ) : state === 'compile-success' ||
                  state === 'knuth-texbook' ||
                  state === 'knuth-check' ||
                  state === 'belly-flop' ||
                  state === 'qed-celebration' ? (
                  <g className="texcat-eyes-happy">
                    <path d="M22 28 Q 26 24 29 28" stroke={activePalette.eyeColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
                    <path d="M35 28 Q 38 24 42 28" stroke={activePalette.eyeColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  </g>
                ) : state === 'compile-fail' ? (
                  <g className="texcat-eyes-fail">
                    <ellipse cx="25" cy="26" rx="3.5" ry="4" fill="#f59e0b" />
                    <ellipse cx="38" cy="27" rx="4" ry="2.5" fill="#f59e0b" />
                    <circle cx="26" cy="25" r="1.5" fill="#000" />
                    <circle cx="38" cy="27" r="1" fill="#000" />
                    <path d="M43 18 C 43 18 45 22 43 23 C 41 23 41 21 43 18 Z" fill="#38bdf8" opacity="0.9" />
                  </g>
                ) : (
                  <g className="texcat-eyes-normal">
                    <ellipse
                      cx={25 + pupilOffset.x}
                      cy={26 + pupilOffset.y}
                      rx="3.5"
                      ry="4"
                      fill={activePalette.eyeColor}
                      className="texcat-eye-pupil"
                    />
                    <circle cx={26 + pupilOffset.x} cy={24.5 + pupilOffset.y} r="1.2" fill="#fff" />
                    <ellipse
                      cx={39 + pupilOffset.x}
                      cy={26 + pupilOffset.y}
                      rx="3.5"
                      ry="4"
                      fill={activePalette.eyeColor}
                      className="texcat-eye-pupil"
                    />
                    <circle cx={40 + pupilOffset.x} cy={24.5 + pupilOffset.y} r="1.2" fill="#fff" />
                  </g>
                )}

                {(state === 'compiling-scholar' || state === 'knuth-texbook' || state === 'knuth-check') && (
                  <g className="texcat-glasses" aria-hidden="true">
                    <circle cx="25" cy="26" r="5" stroke="#f59e0b" strokeWidth="1.5" fill="rgba(245,158,11,0.15)" />
                    <circle cx="39" cy="26" r="5" stroke="#f59e0b" strokeWidth="1.5" fill="rgba(245,158,11,0.15)" />
                    <path d="M30 26 L 34 26" stroke="#f59e0b" strokeWidth="1.5" />
                    <path d="M20 26 L 15 24" stroke="#f59e0b" strokeWidth="1.2" />
                    <path d="M44 26 L 49 24" stroke="#f59e0b" strokeWidth="1.2" />
                  </g>
                )}

                {accessory === 'mortarboard' && (
                  <g className="texcat-accessory-mortarboard" aria-hidden="true" style={{ transformOrigin: '32px 14px' }}>
                    <ellipse cx="32" cy="16" rx="9" ry="3" fill="#0f172a" />
                    <polygon points="32,7 48,13 32,19 16,13" fill="#1e293b" stroke="#0f172a" strokeWidth="1.2" />
                    <circle cx="32" cy="13" r="1.5" fill="#f59e0b" />
                    <path d="M32 13 Q 42 16 41 23" stroke="#f59e0b" strokeWidth="1.5" fill="none" className="tassel-sway" />
                    <circle cx="41" cy="23.5" r="1.5" fill="#f59e0b" />
                  </g>
                )}

                {accessory === 'detective' && (
                  <g className="texcat-accessory-detective" aria-hidden="true">
                    <path d="M18 16 C 18 8, 46 8, 46 16 Z" fill="#78350f" stroke="#451a03" strokeWidth="1.2" />
                    <path d="M14 17 Q 32 12 50 17" stroke="#451a03" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                    <circle cx="32" cy="8" r="2" fill="#451a03" />
                    <path d="M30 8 L 34 8" stroke="#fbbf24" strokeWidth="1.5" />
                  </g>
                )}

                {accessory === 'monocle' && (
                  <g className="texcat-accessory-monocle" aria-hidden="true">
                    <circle cx="39" cy="26" r="5" stroke="#eab308" strokeWidth="1.5" fill="rgba(254,240,138,0.14)" />
                    <path d="M44 27 Q 48 33 45 39" stroke="#eab308" strokeWidth="1.1" fill="none" strokeDasharray="2 1.5" />
                  </g>
                )}

                {accessory === 'laurel' && (
                  <g className="texcat-accessory-laurel" aria-hidden="true">
                    <path d="M18 20 Q 19 11 30 11" stroke="#16a34a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                    <path d="M46 20 Q 45 11 34 11" stroke="#16a34a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                    <circle cx="32" cy="11" r="1.6" fill="#facc15" />
                  </g>
                )}

                {accessory === 'visor' && (
                  <g className="texcat-accessory-visor" aria-hidden="true">
                    <path d="M17 18 Q 32 13 47 18 L 49 22 Q 32 18 15 22 Z" fill="rgba(16,185,129,0.72)" stroke="#065f46" strokeWidth="1.1" />
                    <path d="M18 17 Q 32 13 46 17" stroke="#f8fafc" strokeWidth="1.6" fill="none" />
                  </g>
                )}
              </g>

              {/* Front Paws & Activity Layers (Hierarchy-Fixed & Prop-Complete) */}
              {state === 'compile-warning' ? (
                <g className="texcat-tape-measure" aria-hidden="true">
                  <rect x="18" y="45" width="28" height="5" rx="1" fill="#facc15" stroke="#ca8a04" strokeWidth="1" />
                  <line x1="22" y1="45" x2="22" y2="48" stroke="#713f12" strokeWidth="0.8" />
                  <line x1="26" y1="45" x2="26" y2="49.5" stroke="#713f12" strokeWidth="0.8" />
                  <line x1="30" y1="45" x2="30" y2="48" stroke="#713f12" strokeWidth="0.8" />
                  <line x1="34" y1="45" x2="34" y2="49.5" stroke="#713f12" strokeWidth="0.8" />
                  <line x1="38" y1="45" x2="38" y2="48" stroke="#713f12" strokeWidth="0.8" />
                  <line x1="42" y1="45" x2="42" y2="49.5" stroke="#713f12" strokeWidth="0.8" />
                  <ellipse cx="22" cy="51" rx="4" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.4" />
                  <ellipse cx="42" cy="51" rx="4" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.4" />
                </g>
              ) : state === 'compile-fail' ? (
                <g className="texcat-magnifier" aria-hidden="true" style={{ transformOrigin: '44px 42px' }}>
                  <ellipse cx="23" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <circle cx="44" cy="40" r="6" stroke="#38bdf8" strokeWidth="2" fill="rgba(56,189,248,0.22)" />
                  <path d="M48.5 44.5 L 54.5 50.5" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
                  <ellipse cx="41" cy="47" rx="4" ry="3.2" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.4" />
                </g>
              ) : state === 'coffee-sip' ? (
                <g className="texcat-coffee-sip" aria-hidden="true">
                  <path d="M29 36 Q 27 33 29 30" stroke="#cbd5e1" strokeWidth="1.1" strokeLinecap="round" fill="none" className="steam-wisp-1" />
                  <path d="M35 36 Q 37 33 35 30" stroke="#cbd5e1" strokeWidth="1.1" strokeLinecap="round" fill="none" className="steam-wisp-2" />
                  <rect x="26" y="40" width="12" height="11" rx="2" fill="#f8fafc" stroke="#64748b" strokeWidth="1.2" />
                  <path d="M38 42 Q 42 45.5 38 49" stroke="#64748b" strokeWidth="1.4" fill="none" />
                  <text x="32" y="47" fontSize="4.2" fill="#0284c7" fontWeight="bold" textAnchor="middle">TeX</text>
                  <ellipse cx="24" cy="47" rx="3.8" ry="3.2" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.3" />
                  <ellipse cx="40" cy="47" rx="3.8" ry="3.2" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.3" />
                </g>
              ) : state === 'origami-crane' ? (
                <g className="texcat-origami-crane" aria-hidden="true">
                  <polygon points="34,43 44,34 42,44" fill="#bae6fd" stroke="#0284c7" strokeWidth="0.9" />
                  <polygon points="34,43 42,44 38,48" fill="#7dd3fc" stroke="#0284c7" strokeWidth="0.9" />
                  <polygon points="42,44 48,39 45,45" fill="#e0f2fe" stroke="#0284c7" strokeWidth="0.9" />
                  <polygon points="34,43 29,39 33,45" fill="#e0f2fe" stroke="#0284c7" strokeWidth="0.9" />
                  <ellipse cx="23" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="39" cy="49" rx="4" ry="3.2" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.4" />
                </g>
              ) : state === 'paper-shred' ? (
                <g className="texcat-paper-shred" aria-hidden="true">
                  <rect x="17" y="45" width="7" height="10" rx="0.8" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.9" transform="rotate(-14 20 50)" />
                  <rect x="40" y="45" width="7" height="10" rx="0.8" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.9" transform="rotate(16 43 50)" />
                  <line x1="19" y1="48" x2="22" y2="48" stroke="#ef4444" strokeWidth="0.9" />
                  <line x1="41" y1="48" x2="45" y2="48" stroke="#ef4444" strokeWidth="0.9" />
                  <ellipse cx="24" cy="47" rx="4" ry="3.2" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.4" className="paw-knead-left" />
                  <ellipse cx="40" cy="47" rx="4" ry="3.2" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.4" className="paw-knead-right" />
                </g>
              ) : state === 'hairball-cough' ? (
                <g className="texcat-hairball" aria-hidden="true">
                  <ellipse cx="32" cy="53" rx="6.5" ry="3.8" fill="#475569" stroke="#1e293b" strokeWidth="1.1" />
                  <text x="32" y="54.5" fontSize="4.2" fill="#f8fafc" fontWeight="bold" textAnchor="middle">{'{}'}</text>
                  <ellipse cx="21" cy="51" rx="4.2" ry="3.4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.4" />
                  <ellipse cx="43" cy="51" rx="4.2" ry="3.4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.4" />
                </g>
              ) : state === 'keyboard-sprawl' ? (
                <g className="texcat-keyboard-sprawl" aria-hidden="true">
                  <rect x="11" y="49" width="42" height="7" rx="1.8" fill="#1e293b" stroke="#475569" strokeWidth="1.1" />
                  {[15, 20, 25, 30, 35, 40, 45].map(x => (
                    <rect key={x} x={x} y="51" width="3.5" height="2" rx="0.4" fill="#94a3b8" />
                  ))}
                  <ellipse cx="19" cy="48" rx="5.5" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.4" />
                  <ellipse cx="45" cy="48" rx="5.5" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.4" />
                </g>
              ) : state === 'typing-paws' ? (
                <g className="texcat-bongo-rig">
                  <rect x="12" y="48" width="40" height="7" rx="2" fill="#0f172a" stroke="#38bdf8" strokeWidth="1" />
                  <line x1="16" y1="51.5" x2="48" y2="51.5" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="3 2" />
                  <g className="texcat-paw-left">
                    <ellipse cx="23" cy="47" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  </g>
                  <g className="texcat-paw-right">
                    <ellipse cx="41" cy="47" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  </g>
                </g>
              ) : state === 'knuth-texbook' ? (
                <g className="texcat-knuth-book">
                  <rect x="23" y="42" width="18" height="14" rx="1.5" fill="#451a03" stroke="#f59e0b" strokeWidth="1" />
                  <rect x="25" y="44" width="14" height="10" fill="#78350f" />
                  <text x="32" y="50" fontSize="4.5" fill="#fbbf24" fontWeight="bold" textAnchor="middle">TeX</text>
                  <ellipse cx="22" cy="49" rx="3" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                  <ellipse cx="42" cy="49" rx="3" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                </g>
              ) : state === 'knuth-check' ? (
                <g className="texcat-knuth-check-prop">
                  <rect x="16" y="41" width="32" height="15" rx="1.5" fill="#fef9c3" stroke="#ca8a04" strokeWidth="1" />
                  <rect x="18" y="43" width="28" height="11" fill="#fffbeb" />
                  <text x="32" y="46.5" fontSize="3" fill="#854d0e" fontWeight="bold" textAnchor="middle">Bank of San Serriffe</text>
                  <text x="32" y="51" fontSize="4.2" fill="#15803d" fontWeight="bold" textAnchor="middle">$2.56 Reward</text>
                  <ellipse cx="20" cy="49" rx="3" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                  <ellipse cx="44" cy="49" rx="3" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                </g>
              ) : state === 'box-sit' ? (
                <g className="texcat-cardboard-box">
                  <rect x="10" y="38" width="44" height="20" rx="2" fill="#b45309" stroke="#78350f" strokeWidth="1.5" opacity="0.95" />
                  <line x1="32" y1="38" x2="32" y2="58" stroke="#78350f" strokeWidth="1" strokeDasharray="3 2" />
                  <text x="32" y="52" fontSize="5" fill="#fef3c7" fontWeight="bold" textAnchor="middle">\hbox</text>
                  <ellipse cx="22" cy="38" rx="4" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                  <ellipse cx="42" cy="38" rx="4" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                </g>
              ) : state === 'fish-feast' ? (
                <g className="texcat-paw-fish">
                  <path d="M26 44 Q 32 40 38 44 Q 35 48 32 47 Q 29 48 26 44 Z" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                  <polygon points="38,44 42,41 42,47" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                  <circle cx="28" cy="43.5" r="0.8" fill="#000" />
                  <ellipse cx="27" cy="47" rx="3.5" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                  <ellipse cx="37" cy="47" rx="3.5" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                </g>
              ) : state === 'knock-mug' ? (
                <g className="texcat-mug-rig">
                  <rect x="40" y="47" width="9" height="8" rx="1.2" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" transform="rotate(18 44 50)" />
                  <path d="M49 48 Q 52 50 49 53" stroke="#94a3b8" strokeWidth="1" fill="none" />
                  <circle cx="53" cy="46" r="1.2" fill="#78350f" opacity="0.8" />
                  <ellipse cx="24" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="38" cy="47" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'swat-cursor' ? (
                <g className="texcat-paw-swat">
                  <ellipse cx="20" cy="50" rx="4" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="45" cy="36" rx="4.5" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'belly-flop' ? (
                <g className="texcat-paws-belly">
                  <ellipse cx="22" cy="44" rx="4" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="42" cy="44" rx="4" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'ear-scratch' ? (
                <g className="texcat-paw-scratch">
                  <ellipse cx="19" cy="22" rx="4" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="40" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'compiling-scholar' ? (
                <g className="texcat-scholar-props">
                  <rect x="22" y="44" width="20" height="12" rx="1" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
                  <line x1="25" y1="47" x2="39" y2="47" stroke="#0284c7" strokeWidth="1" />
                  <line x1="25" y1="50" x2="36" y2="50" stroke="#64748b" strokeWidth="1" />
                  <line x1="25" y1="53" x2="38" y2="53" stroke="#64748b" strokeWidth="1" />
                  <ellipse cx="22" cy="49" rx="3.5" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                  <ellipse cx="42" cy="49" rx="3.5" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                </g>
              ) : state === 'face-wash' ? (
                <g className="texcat-paw-wash">
                  <ellipse cx="24" cy="29" rx="4" ry="4.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="40" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'butterfly-bat' ? (
                <g className="texcat-paw-bat">
                  <ellipse cx="30" cy="38" rx="4" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="40" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'yoga-stretch' ? (
                <g className="texcat-paws-extended">
                  <ellipse cx="18" cy="54" rx="5" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="46" cy="54" rx="5" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'facepalm-paw' ? (
                <g className="texcat-paw-facepalm">
                  <ellipse cx="24" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="33" cy="27" rx="5" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" transform="rotate(-20 33 27)" />
                </g>
              ) : state === 'knead-dough' ? (
                <g className="texcat-paws-knead">
                  <ellipse cx="22" cy="50" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" className="paw-knead-left" />
                  <ellipse cx="42" cy="54" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" className="paw-knead-right" />
                </g>
              ) : state === 'cello-leg' ? (
                <g className="texcat-paw-cello">
                  <ellipse cx="24" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="45" cy="23" rx="3.5" ry="9" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" transform="rotate(16 45 23)" />
                </g>
              ) : state === 'qed-celebration' ? (
                <g className="texcat-paw-qed">
                  <ellipse cx="24" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="40" cy="48" rx="4" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <circle cx="43" cy="44" r="5" fill="#facc15" stroke="#ca8a04" strokeWidth="1" />
                  <text x="43" y="46.2" fontSize="3" fill="#713f12" fontWeight="bold" textAnchor="middle">QED</text>
                </g>
              ) : state === 'focus-scholar' ? (
                <g className="texcat-paws-zen">
                  <ellipse cx="26" cy="52" rx="4.5" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="38" cy="52" rx="4.5" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <circle cx="32" cy="51" r="2" fill="#38bdf8" opacity="0.6" />
                </g>
              ) : state === 'loaf' ? (
                <g className="texcat-paws-loaf" />
              ) : state === 'lifted-scruff' ? (
                <g className="texcat-paws-dangling">
                  <ellipse cx="25" cy="54" rx="3.5" ry="5.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="39" cy="54" rx="3.5" ry="5.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : (
                <g className="texcat-paws-resting">
                  <ellipse cx="24" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="40" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              )}
            </svg>
          </div>
        </div>
      </div>
    </>
  );
};

