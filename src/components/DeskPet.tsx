import React, { useState, useMemo, useEffect, useRef } from 'react';
import katex from 'katex';
import type {
  DeskPetActionState,
  DeskPetSkin,
  DeskPetAccessory,
  DeskPetEntryVariant,
  DeskPetExitVariant,
  DeskPetRoamMode,
} from '../hooks/useDeskPet';
import {
  Heart,
  Sparkles,
  X,
  Moon,
  Palette,
  Volume2,
  VolumeX,
  GraduationCap,
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
} from 'lucide-react';

export interface DeskPetProps {
  isEnabled: boolean;
  isExiting?: boolean;
  entryVariant?: DeskPetEntryVariant;
  exitVariant?: DeskPetExitVariant;
  state: DeskPetActionState;
  direction: 'left' | 'right';
  pacingOffset: number;
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
  // Stage 15 additions:
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
};

export const DeskPet: React.FC<DeskPetProps> = ({
  isEnabled,
  isExiting = false,
  entryVariant = 'box',
  exitVariant = 'smoke',
  state,
  direction,
  pacingOffset,
  isSleeping: _isSleeping,
  isReducedMotion,
  isPaused,
  petCount,
  skin = 'tuxedo',
  cycleSkin,
  accessory = 'none',
  cycleAccessory,
  isSoundEnabled = false,
  toggleSound,
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
  // Stage 15 additions:
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
}) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const [showHearts, setShowHearts] = useState(false);
  const [hasCopiedFormula, setHasCopiedFormula] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<HTMLDivElement>(null);
  const clickTimestampsRef = useRef<number[]>([]);

  // Eye tracking pupil look-at offset (-2px to +2px)
  const [pupilOffset, setPupilOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!isEnabled || isPaused || isReducedMotion || state === 'sleep' || state === 'loaf' || isDragging) {
      setPupilOffset({ x: 0, y: 0 });
      return;
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!mascotRef.current) return;
      const rect = mascotRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Proximity cursor look-at within 140px
      if (distance < 140 && distance > 5) {
        const angle = Math.atan2(dy, dx);
        const lookRadius = Math.min(2, distance / 40);
        setPupilOffset({
          x: Math.cos(angle) * lookRadius,
          y: Math.sin(angle) * lookRadius,
        });
      } else {
        setPupilOffset({ x: 0, y: 0 });
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [isEnabled, isPaused, isReducedMotion, state, isDragging]);

  // Click outside to dismiss toolbar
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

  // Human-readable status label for ARIA and tooltip
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
      case 'walk':
        return roamMode === 'free' ? 'Wandering freely across desktop perches' : 'Pacing along the ledge';
      case 'idle':
      default:
        return 'Sitting attentively on the ledge';
    }
  }, [state, roamMode]);

  const activePalette = SKIN_PALETTES[skin] || SKIN_PALETTES.tuxedo;

  // 2D Coordinates & Dock Elevation Calculation
  const dockHeight = dockCollapsed ? 32 : 180;
  const bottomPosition = isSnappedToDock ? dockHeight + 4 : perchY;

  // Snappy Triple-Click Trigger (e.detail >= 3 or 3 consecutive clicks in 1200ms)
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    clickTimestampsRef.current = [...clickTimestampsRef.current.filter(t => now - t < 1200), now];

    // Triple click (e.detail >= 3) or 3 rapid clicks toggles options menu
    if (e.detail >= 3 || clickTimestampsRef.current.length >= 3) {
      clickTimestampsRef.current = [];
      setShowToolbar(prev => !prev);
      return;
    }

    if (state === 'sleep' || state === 'loaf') {
      wakeUp?.();
    } else {
      triggerPet?.();
      setShowHearts(true);
      setTimeout(() => setShowHearts(false), 1400);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerYarnChase?.();
  };

  // Click-to-copy mathematical dream formula
  const handleCopyFormula = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(currentDreamFormula);
        setHasCopiedFormula(true);
        setTimeout(() => setHasCopiedFormula(false), 1600);
      }
    } catch {
      // Ignore
    }
  };

  // Keyboard accessibility handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  // KaTeX Mathematical Dream Formula Rendering
  const renderedDreamHtml = useMemo(() => {
    try {
      return katex.renderToString(currentDreamFormula, { displayMode: false, throwOnError: false });
    } catch {
      return currentDreamFormula;
    }
  }, [currentDreamFormula]);

  // If disabled and not mid-exit animation, render zero DOM elements
  if (!isEnabled && !isExiting) {
    return null;
  }

  return (
    <>
      {/* Stage 15: Glowing Red Laser Dot Tracker */}
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
          alignItems: 'flex-end',
          transition: isReducedMotion || isDragging
            ? 'none'
            : 'bottom 0.28s cubic-bezier(0.16, 1, 0.3, 1), right 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Floating Quick Action Toolbar (Opened via 3 clicks or 'O') */}
        {showToolbar && (
          <div
            role="toolbar"
            aria-label="Desk companion quick actions"
            style={{
              pointerEvents: 'auto',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 6px',
              backgroundColor: 'var(--bg-surface-elevated, #1e293b)',
              border: '1px solid var(--border-subtle, #334155)',
              borderRadius: 'var(--radius-sm, 6px)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
            {/* Pet Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={(e) => {
                e.stopPropagation();
                triggerPet?.();
                setShowHearts(true);
                setTimeout(() => setShowHearts(false), 1400);
              }}
              title="Pet TeXCat (Show love - Space)"
              aria-label="Pet companion"
            >
              <Heart size={11} color="#f43f5e" fill="#f43f5e" />
              <span>Pet</span>
            </button>

            {/* Peek-a-Boo Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={(e) => {
                e.stopPropagation();
                triggerPeekABoo?.();
              }}
              title="Peek-a-Boo hiding behind dock (P)"
              aria-label="Peek-a-Boo hiding"
            >
              <Eye size={11} color="#38bdf8" />
              <span>Peek</span>
            </button>

            {/* Laser Pointer Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{
                padding: '2px 5px',
                fontSize: 11,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                color: isLaserActive ? '#ef4444' : 'inherit',
              }}
              onClick={(e) => {
                e.stopPropagation();
                triggerLaser?.();
              }}
              title={`Red laser pointer chase (L) • ${isLaserActive ? 'ACTIVE' : 'OFF'}`}
              aria-label="Toggle laser pointer chase"
            >
              <Target size={11} color={isLaserActive ? '#ef4444' : '#f87171'} />
              <span>Laser</span>
            </button>

            {/* Box Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={(e) => {
                e.stopPropagation();
                triggerBox?.();
              }}
              title="Cozy \hbox{\TeX} cardboard box (B)"
              aria-label="Cardboard box"
            >
              <Box size={11} color="#f59e0b" />
              <span>Box</span>
            </button>

            {/* Fish Treat Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={(e) => {
                e.stopPropagation();
                triggerFish?.();
              }}
              title="Feed crunchy fish treat (F)"
              aria-label="Fish treat"
            >
              <Fish size={11} color="#10b981" />
              <span>Fish</span>
            </button>

            {/* Knuth TeXbook / Check Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={(e) => {
                e.stopPropagation();
                triggerKnuthCelebration?.();
              }}
              title="Donald Knuth TeXbook & $2.56 check celebration (K)"
              aria-label="Knuth celebration"
            >
              <BookOpen size={11} color="#a855f7" />
              <span>Knuth</span>
            </button>

            {/* Mug Knock Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={(e) => {
                e.stopPropagation();
                triggerKnockMug?.();
              }}
              title="Playfully knock TeX mug off ledge (U)"
              aria-label="Knock mug"
            >
              <Coffee size={11} color="#f97316" />
              <span>Mug</span>
            </button>

            {/* Belly Flop Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={(e) => {
                e.stopPropagation();
                triggerBellyFlop?.();
              }}
              title="Playful belly-up flop (G)"
              aria-label="Belly flop"
            >
              <Smile size={11} color="#ec4899" />
              <span>Flop</span>
            </button>

            {/* Roam Mode Toggle Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{
                padding: '2px 5px',
                fontSize: 11,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                color: roamMode === 'free' ? '#38bdf8' : 'inherit',
              }}
              onClick={(e) => {
                e.stopPropagation();
                toggleRoamMode?.();
              }}
              title={`Toggle roam mode (R) • Current: ${roamMode === 'dock' ? 'Dock Patrol' : 'Free Roam Desktop'}`}
              aria-label="Toggle roam mode"
            >
              <Compass size={11} color={roamMode === 'free' ? '#38bdf8' : '#94a3b8'} />
              <span>{roamMode === 'dock' ? 'Patrol' : 'Free Roam'}</span>
            </button>

            {/* Yarn Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={(e) => {
                e.stopPropagation();
                triggerYarnChase?.();
              }}
              title="Toss bouncy yarn ball (Y)"
              aria-label="Toss yarn ball"
            >
              <Sparkles size={11} color="#38bdf8" />
              <span>Yarn</span>
            </button>

            {/* Coat Skin Switcher */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={(e) => {
                e.stopPropagation();
                cycleSkin?.();
              }}
              title={`Cycle coat skin (C) • Current: ${skin.toUpperCase()}`}
              aria-label="Cycle coat skin"
            >
              <Palette size={11} color="#f59e0b" />
              <span style={{ textTransform: 'capitalize' }}>{skin}</span>
            </button>

            {/* Academic Outfit Switcher */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={(e) => {
                e.stopPropagation();
                cycleAccessory?.();
              }}
              title={`Cycle academic attire (A) • Current: ${accessory.toUpperCase()}`}
              aria-label="Cycle academic attire"
            >
              <GraduationCap size={11} color="#38bdf8" />
              <span style={{ textTransform: 'capitalize' }}>{accessory === 'none' ? 'No outfit' : accessory}</span>
            </button>

            {/* Sound Toggle Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center' }}
              onClick={(e) => {
                e.stopPropagation();
                toggleSound?.();
              }}
              title={`Sound Effects (M): ${isSoundEnabled ? 'ON (Purr, meow, chimes & typing thocks active)' : 'MUTED (Zero audio)'}`}
              aria-label="Toggle companion sound"
            >
              {isSoundEnabled ? <Volume2 size={11} color="#10b981" /> : <VolumeX size={11} color="var(--text-muted)" />}
            </button>

            {/* Sleep / Wake Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center' }}
              onClick={(e) => {
                e.stopPropagation();
                if (toggleSleep) {
                  toggleSleep();
                } else {
                  wakeUp?.();
                }
              }}
              title="Toggle sleep / wake (S)"
              aria-label="Toggle sleep"
            >
              <Moon size={11} color="#a855f7" />
            </button>

            {/* Dock Snap / Reset Button */}
            {!isSnappedToDock && (
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center' }}
                onClick={(e) => {
                  e.stopPropagation();
                  resetPositionToDock?.();
                }}
                title="Reset position back to dock ledge"
                aria-label="Reset position to dock"
              >
                <Pin size={11} color="#38bdf8" />
              </button>
            )}

            <div style={{ width: 1, height: 12, backgroundColor: 'var(--border-subtle, #334155)', margin: '0 2px' }} />

            {/* Turn Off / Disable Companion Button */}
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '2px 4px', fontSize: 11, color: 'var(--text-muted)' }}
              onClick={(e) => {
                e.stopPropagation();
                onToggleEnabled?.();
              }}
              title="Disable / Turn off Desk Companion"
              aria-label="Disable companion"
            >
              <X size={11} />
            </button>
          </div>
        )}

        {/* Main Mascot Wrapper with 2D Drag & Fling Physics */}
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
              : `translate3d(-${pacingOffset}px, 0, 0)`,
            transition: isReducedMotion || isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerDown={startDrag}
          role="img"
          tabIndex={0}
          aria-label={`TeXCat Desk Companion: ${stateLabel}. Coat: ${skin}. Outfit: ${accessory}. Pet count: ${petCount}. (Triple-click for menu, drag anywhere in 2D, double-click for yarn)`}
          title={`TeXCat: ${stateLabel}${petCount > 0 ? ` (Loved ${petCount} times)` : ''} — 3 quick clicks for options`}
          onKeyDown={handleKeyDown}
        >
          {/* Floating Heart Particles */}
          {showHearts && (
            <div className="pet-heart-particles" aria-hidden="true">
              <span className="floating-heart heart-1">♥</span>
              <span className="floating-heart heart-2">♥</span>
              <span className="floating-heart heart-3">♥</span>
            </div>
          )}

          {/* Floating Zzz Particles during Sleep */}
          {state === 'sleep' && (
            <div className="pet-sleep-particles" aria-hidden="true">
              <span className="floating-z z-1">z</span>
              <span className="floating-z z-2">z</span>
              <span className="floating-z z-3">Z</span>
            </div>
          )}

          {/* High-DPI KaTeX Mathematical Dream Thought Bubble during Sleep (Click-to-Copy) */}
          {state === 'sleep' && (
            <div
              className="pet-dream-bubble"
              aria-hidden="true"
              onClick={handleCopyFormula}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              title="Click to copy LaTeX formula"
            >
              <span className="dream-formula" dangerouslySetInnerHTML={{ __html: renderedDreamHtml }} />
              {hasCopiedFormula && (
                <span style={{ fontSize: 9, color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <Check size={9} /> Copied!
                </span>
              )}
              <div className="dream-dots">
                <span className="dot dot-1" />
                <span className="dot dot-2" />
              </div>
            </div>
          )}

          {/* Floating Sparkles on Compile Success / Knuth Celebration */}
          {(state === 'compile-success' || state === 'knuth-texbook' || state === 'knuth-check') && (
            <div className="pet-sparkle-particles" aria-hidden="true">
              <span className="floating-sparkle sparkle-1">✦</span>
              <span className="floating-sparkle sparkle-2">✧</span>
              <span className="floating-sparkle sparkle-3">⋆</span>
            </div>
          )}

          {/* Interactive Bouncy Yarn Ball with Physics Bounce Arc */}
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

          {/* Pixel Butterfly for Idle Butterfly Batting */}
          {state === 'butterfly-bat' && (
            <div className="pet-pixel-butterfly" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 4 Q 1 1 2 7 Q 5 6 6 8 Q 7 6 10 7 Q 11 1 8 4 Z" fill="#38bdf8" opacity="0.9" />
                <circle cx="8" cy="8" r="1.5" fill="#f8fafc" />
              </svg>
            </div>
          )}

          {/* Status Speech Bubbles */}
          {state === 'compile-fail' && (
            <div className="pet-reaction-bubble reaction-fail" aria-hidden="true">
              <span>❓ Log alert</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'compile-warning' && (
            <div className="pet-reaction-bubble reaction-warning" aria-hidden="true">
              <span>📏 Margins ok</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'compile-success' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>✨ Q.E.D.</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'knuth-texbook' && (
            <div className="pet-reaction-bubble reaction-knuth" aria-hidden="true">
              <span>📖 The TeXbook</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'knuth-check' && (
            <div className="pet-reaction-bubble reaction-knuth" aria-hidden="true">
              <span>🏆 $2.56 Bug Reward</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'knock-mug' && (
            <div className="pet-reaction-bubble reaction-warning" aria-hidden="true">
              <span>☕ Oops! (mug tap)</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'swat-cursor' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>🐾 Swat!</span>
              <div className="bubble-arrow" />
            </div>
          )}
          {state === 'peek-a-boo' && (
            <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
              <span>👀 Peek-a-boo!</span>
              <div className="bubble-arrow" />
            </div>
          )}

          {/* Procedural High-DPI Vector Mascot Rig */}
          <div
            className={`texcat-rig state-${state} ${state === 'walk' && direction === 'left' ? 'facing-left' : ''}`}
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

              {/* Base platform shadow */}
              <ellipse
                cx="32"
                cy="56"
                rx={state === 'lifted-scruff' ? 12 : state === 'loaf' ? 24 : 20}
                ry={state === 'lifted-scruff' ? 2 : 4}
                fill="rgba(0,0,0,0.25)"
                opacity={state === 'lifted-scruff' ? 0.35 : 0.8}
              />

              {/* Tail Layer with Sway Animation */}
              <g className={`texcat-tail ${state === 'loaf' ? 'tail-tucked' : ''}`} style={{ transformOrigin: '48px 50px' }}>
                <path
                  d={state === 'loaf' ? 'M42 48 C 48 52, 36 56, 26 55' : 'M44 48 C 54 44, 58 36, 56 30 C 54 26, 50 28, 51 32 C 52 38, 48 42, 42 46'}
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

                {/* Tiger Stripes for Ginger or Calico */}
                {activePalette.stripeColor && (
                  <g className="texcat-stripes" opacity="0.45">
                    <path d="M22 41 L 28 43" stroke={activePalette.stripeColor} strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M42 41 L 36 43" stroke={activePalette.stripeColor} strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M20 46 L 26 47" stroke={activePalette.stripeColor} strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M44 46 L 38 47" stroke={activePalette.stripeColor} strokeWidth="1.5" strokeLinecap="round" />
                  </g>
                )}

                {/* Chest Marking */}
                <ellipse cx="32" cy={state === 'loaf' ? 47 : 45} rx={state === 'loaf' ? 10 : 8} ry={state === 'loaf' ? 7 : 9} fill={activePalette.chestFill} opacity="0.8" />
              </g>

              {/* Academic Accessory: Professor Bowtie */}
              {accessory === 'bowtie' && (
                <g className="texcat-accessory-bowtie" aria-hidden="true">
                  <polygon points="26,38 32,41 26,44" fill="#dc2626" />
                  <polygon points="38,38 32,41 38,44" fill="#dc2626" />
                  <circle cx="32" cy="41" r="2.2" fill="#b91c1c" />
                </g>
              )}

              {/* Academic Accessory: Knitted Scholar Scarf */}
              {accessory === 'scarf' && (
                <g className="texcat-accessory-scarf" aria-hidden="true">
                  <ellipse cx="32" cy="38" rx="14" ry="4.5" fill="#b91c1c" stroke="#7f1d1d" strokeWidth="1" />
                  <line x1="22" y1="38" x2="42" y2="38" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 2" />
                  {/* Flowing scarf tail with tassel fringe */}
                  <path d="M38 40 Q 42 48 40 54" stroke="#b91c1c" strokeWidth="4.5" strokeLinecap="round" fill="none" className="scarf-flutter" />
                  <line x1="38" y1="54" x2="42" y2="54" stroke="#fbbf24" strokeWidth="1.5" />
                </g>
              )}

              {/* Cat Head Layer */}
              <g className="texcat-head" style={{ transformOrigin: '32px 30px' }}>
                {/* Left Ear */}
                <path
                  d="M19 22 L 23 10 L 31 18 Z"
                  fill={activePalette.furFill}
                  stroke={activePalette.furStroke}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  className="texcat-ear-left"
                />
                <path d="M22 19 L 24 13 L 29 18 Z" fill={activePalette.earPink} opacity="0.8" />

                {/* Right Ear */}
                <path
                  d="M45 22 L 41 10 L 33 18 Z"
                  fill={activePalette.furFill}
                  stroke={activePalette.furStroke}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  className="texcat-ear-right"
                />
                <path d="M42 19 L 40 13 L 35 18 Z" fill={activePalette.earPink} opacity="0.8" />

                {/* Head Circle */}
                <ellipse
                  cx="32"
                  cy="28"
                  rx="17"
                  ry="14"
                  fill={activePalette.furFill}
                  stroke={activePalette.furStroke}
                  strokeWidth="2"
                />

                {/* Cheeks / Whiskers */}
                <path d="M12 28 L 22 29 M 11 32 L 21 31" stroke="var(--text-muted, #94a3b8)" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M52 28 L 42 29 M 53 32 L 43 31" stroke="var(--text-muted, #94a3b8)" strokeWidth="1.2" strokeLinecap="round" />

                {/* Nose */}
                <polygon points="30,31 34,31 32,33" fill={activePalette.earPink} />

                {/* Mouth & Sleepy Nap Yawn */}
                {state === 'nap-yawn' ? (
                  <g className="texcat-mouth-yawn">
                    <ellipse cx="32" cy="35" rx="4.5" ry="5" fill="#f43f5e" />
                    <polygon points="29.5,32 31.5,32 30.5,34" fill="#ffffff" />
                    <polygon points="32.5,32 34.5,32 33.5,34" fill="#ffffff" />
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

                {/* Eyes Expression System */}
                {state === 'sleep' ? (
                  <g className="texcat-eyes-sleep">
                    <path d="M22 27 Q 26 23 29 27" stroke="var(--text-primary, #f8fafc)" strokeWidth="2" strokeLinecap="round" fill="none" />
                    <path d="M35 27 Q 38 23 42 27" stroke="var(--text-primary, #f8fafc)" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </g>
                ) : state === 'loaf' ? (
                  // Relaxed half-closed loaf eyes
                  <g className="texcat-eyes-loaf">
                    <path d="M22 27 Q 26 25 29 27" stroke={activePalette.eyeColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
                    <path d="M35 27 Q 38 25 42 27" stroke={activePalette.eyeColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
                  </g>
                ) : state === 'compile-success' || state === 'knuth-texbook' || state === 'knuth-check' || state === 'belly-flop' ? (
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

                {/* Scholar Mode / Knuth Glasses */}
                {(state === 'compiling-scholar' || state === 'knuth-texbook' || state === 'knuth-check') && (
                  <g className="texcat-glasses" aria-hidden="true">
                    <circle cx="25" cy="26" r="5" stroke="#f59e0b" strokeWidth="1.5" fill="rgba(245,158,11,0.15)" />
                    <circle cx="39" cy="26" r="5" stroke="#f59e0b" strokeWidth="1.5" fill="rgba(245,158,11,0.15)" />
                    <path d="M30 26 L 34 26" stroke="#f59e0b" strokeWidth="1.5" />
                    <path d="M20 26 L 15 24" stroke="#f59e0b" strokeWidth="1.2" />
                    <path d="M44 26 L 49 24" stroke="#f59e0b" strokeWidth="1.2" />
                  </g>
                )}

                {/* Detective Mode: Magnifying Glass */}
                {state === 'compile-fail' && (
                  <g className="texcat-magnifier" aria-hidden="true" style={{ transformOrigin: '40px 38px' }}>
                    <circle cx="44" cy="38" r="6" stroke="#38bdf8" strokeWidth="2" fill="rgba(56,189,248,0.2)" />
                    <path d="M48 42 L 54 48" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
                  </g>
                )}

                {/* Warning Mode: Typesetter Tape Measure */}
                {state === 'compile-warning' && (
                  <g className="texcat-tape-measure" aria-hidden="true">
                    <rect x="18" y="46" width="28" height="5" rx="1" fill="#facc15" stroke="#ca8a04" strokeWidth="1" />
                    <line x1="22" y1="46" x2="22" y2="49" stroke="#713f12" strokeWidth="0.8" />
                    <line x1="26" y1="46" x2="26" y2="50" stroke="#713f12" strokeWidth="0.8" />
                    <line x1="30" y1="46" x2="30" y2="49" stroke="#713f12" strokeWidth="0.8" />
                    <line x1="34" y1="46" x2="34" y2="50" stroke="#713f12" strokeWidth="0.8" />
                    <line x1="38" y1="46" x2="38" y2="49" stroke="#713f12" strokeWidth="0.8" />
                    <line x1="42" y1="46" x2="42" y2="50" stroke="#713f12" strokeWidth="0.8" />
                  </g>
                )}

                {/* Academic Accessory: Graduate Mortarboard Cap */}
                {accessory === 'mortarboard' && (
                  <g className="texcat-accessory-mortarboard" aria-hidden="true" style={{ transformOrigin: '32px 14px' }}>
                    <ellipse cx="32" cy="16" rx="9" ry="3" fill="#0f172a" />
                    <polygon points="32,7 48,13 32,19 16,13" fill="#1e293b" stroke="#0f172a" strokeWidth="1.2" />
                    <circle cx="32" cy="13" r="1.5" fill="#f59e0b" />
                    <path d="M32 13 Q 42 16 41 23" stroke="#f59e0b" strokeWidth="1.5" fill="none" className="tassel-sway" />
                    <circle cx="41" cy="23.5" r="1.5" fill="#f59e0b" />
                  </g>
                )}

                {/* Academic Accessory: Detective Deerstalker Cap */}
                {accessory === 'detective' && (
                  <g className="texcat-accessory-detective" aria-hidden="true">
                    <path d="M18 16 C 18 8, 46 8, 46 16 Z" fill="#78350f" stroke="#451a03" strokeWidth="1.2" />
                    <path d="M14 17 Q 32 12 50 17" stroke="#451a03" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                    <circle cx="32" cy="8" r="2" fill="#451a03" />
                    <path d="M30 8 L 34 8" stroke="#fbbf24" strokeWidth="1.5" />
                  </g>
                )}
              </g>

              {/* Front Paws & Activity Layers (Continuous SVG Structure) */}
              {state === 'typing-paws' ? (
                // Bongo Cat Drumming Paws & RGB Mechanical Keyboard
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
                // Donald Knuth Easter Egg: Holding The TeXbook
                <g className="texcat-knuth-book">
                  <rect x="23" y="42" width="18" height="14" rx="1.5" fill="#451a03" stroke="#f59e0b" strokeWidth="1" />
                  <rect x="25" y="44" width="14" height="10" fill="#78350f" />
                  <text x="32" y="50" fontSize="4.5" fill="#fbbf24" fontWeight="bold" textAnchor="middle">TeX</text>
                  <ellipse cx="22" cy="49" rx="3" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                  <ellipse cx="42" cy="49" rx="3" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                </g>
              ) : state === 'knuth-check' ? (
                // Donald Knuth $2.56 Bug Reward Check from Bank of San Serriffe
                <g className="texcat-knuth-check-prop">
                  <rect x="16" y="41" width="32" height="15" rx="1.5" fill="#fef9c3" stroke="#ca8a04" strokeWidth="1" />
                  <rect x="18" y="43" width="28" height="11" fill="#fffbeb" />
                  <text x="32" y="46.5" fontSize="3" fill="#854d0e" fontWeight="bold" textAnchor="middle">Bank of San Serriffe</text>
                  <text x="32" y="51" fontSize="4.2" fill="#15803d" fontWeight="bold" textAnchor="middle">$2.56 Reward</text>
                  <ellipse cx="20" cy="49" rx="3" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                  <ellipse cx="44" cy="49" rx="3" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                </g>
              ) : state === 'box-sit' ? (
                // \hbox Cardboard Shipping Box
                <g className="texcat-cardboard-box">
                  <rect x="10" y="38" width="44" height="20" rx="2" fill="#b45309" stroke="#78350f" strokeWidth="1.5" opacity="0.95" />
                  <line x1="32" y1="38" x2="32" y2="58" stroke="#78350f" strokeWidth="1" strokeDasharray="3 2" />
                  <text x="32" y="52" fontSize="5" fill="#fef3c7" fontWeight="bold" textAnchor="middle">\hbox</text>
                  <ellipse cx="22" cy="38" rx="4" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                  <ellipse cx="42" cy="38" rx="4" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                </g>
              ) : state === 'fish-feast' ? (
                // Golden Fish Snack Treat
                <g className="texcat-paw-fish">
                  <path d="M26 44 Q 32 40 38 44 Q 35 48 32 47 Q 29 48 26 44 Z" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                  <polygon points="38,44 42,41 42,47" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                  <circle cx="28" cy="43.5" r="0.8" fill="#000" />
                  <ellipse cx="27" cy="47" rx="3.5" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                  <ellipse cx="37" cy="47" rx="3.5" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                </g>
              ) : state === 'knock-mug' ? (
                // Mini Ceramic TeX Mug Nudged on Ledge
                <g className="texcat-mug-rig">
                  <rect x="40" y="47" width="9" height="8" rx="1.2" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" transform="rotate(18 44 50)" />
                  <path d="M49 48 Q 52 50 49 53" stroke="#94a3b8" strokeWidth="1" fill="none" />
                  <circle cx="53" cy="46" r="1.2" fill="#78350f" opacity="0.8" />
                  <ellipse cx="24" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="38" cy="47" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'swat-cursor' ? (
                // Swatting Towards Cursor
                <g className="texcat-paw-swat">
                  <ellipse cx="20" cy="50" rx="4" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="45" cy="36" rx="4.5" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'belly-flop' ? (
                // Belly-Up Flop Paws in Air
                <g className="texcat-paws-belly">
                  <ellipse cx="22" cy="44" rx="4" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="42" cy="44" rx="4" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'ear-scratch' ? (
                // Ear Scratch with Hind Leg
                <g className="texcat-paw-scratch">
                  <ellipse cx="19" cy="22" rx="4" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="40" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'compiling-scholar' ? (
                // Scholar Manuscript
                <g className="texcat-scholar-props">
                  <rect x="22" y="44" width="20" height="12" rx="1" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
                  <line x1="25" y1="47" x2="39" y2="47" stroke="#0284c7" strokeWidth="1" />
                  <line x1="25" y1="50" x2="36" y2="50" stroke="#64748b" strokeWidth="1" />
                  <line x1="25" y1="53" x2="38" y2="53" stroke="#64748b" strokeWidth="1" />
                  <ellipse cx="22" cy="49" rx="3.5" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                  <ellipse cx="42" cy="49" rx="3.5" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.2" />
                </g>
              ) : state === 'face-wash' ? (
                // Face Washing Paw Lick
                <g className="texcat-paw-wash">
                  <ellipse cx="24" cy="29" rx="4" ry="4.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="40" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'butterfly-bat' ? (
                // Paw Batting Upwards
                <g className="texcat-paw-bat">
                  <ellipse cx="30" cy="38" rx="4" ry="4" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="40" cy="52" rx="4.5" ry="3.5" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'yoga-stretch' ? (
                // Extended Front Paws
                <g className="texcat-paws-extended">
                  <ellipse cx="18" cy="54" rx="5" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                  <ellipse cx="46" cy="54" rx="5" ry="3" fill={activePalette.furFill} stroke={activePalette.furStroke} strokeWidth="1.5" />
                </g>
              ) : state === 'loaf' ? (
                // Loaf: Front paws completely tucked underneath
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
