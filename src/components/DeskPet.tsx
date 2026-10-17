import React, { useState, useMemo } from 'react';
import type { DeskPetActionState } from '../hooks/useDeskPet';
import { Heart, Sparkles, X, Moon } from 'lucide-react';

export interface DeskPetProps {
  isEnabled: boolean;
  state: DeskPetActionState;
  direction: 'left' | 'right';
  pacingOffset: number;
  isSleeping: boolean;
  isReducedMotion: boolean;
  isPaused: boolean;
  petCount: number;
  dockCollapsed?: boolean;
  onToggleEnabled?: () => void;
  triggerYarnChase?: () => void;
  triggerPet?: () => void;
  wakeUp?: () => void;
}

export const DeskPet: React.FC<DeskPetProps> = ({
  isEnabled,
  state,
  direction,
  pacingOffset,
  isSleeping: _isSleeping,
  isReducedMotion,
  isPaused,
  petCount,
  dockCollapsed = true,
  onToggleEnabled,
  triggerYarnChase,
  triggerPet,
  wakeUp,
}) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const [showHearts, setShowHearts] = useState(false);

  // Human-readable status label for ARIA and tooltip
  const stateLabel = useMemo(() => {
    switch (state) {
      case 'typing-paws':
        return 'Typing furiously alongside you';
      case 'compiling-scholar':
        return 'Analyzing LaTeX manuscript with scholar glasses';
      case 'compile-success':
        return 'Celebrating successful PDF compilation! (Q.E.D.)';
      case 'compile-fail':
        return 'Investigating compile error diagnostics with magnifying glass';
      case 'yarn-chase':
        return 'Chasing the cyan yarn ball!';
      case 'sleep':
        return 'Sleeping peacefully (Zzz)';
      case 'waking-stretch':
        return 'Waking up with an arch-back stretch';
      case 'walk':
        return 'Pacing along the dock ledge';
      case 'idle':
      default:
        return 'Sitting attentively on the dock ledge';
    }
  }, [state]);

  // If disabled, render absolutely nothing (zero DOM footprint)
  if (!isEnabled) {
    return null;
  }

  // Handle clicking on pet
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === 'sleep') {
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

  // Bottom dock offset calculation
  const dockHeight = dockCollapsed ? 32 : 180;
  const bottomPosition = dockHeight + 4;

  return (
    <div
      className={`desk-pet-container ${isPaused ? 'is-paused' : ''}`}
      style={{
        position: 'fixed',
        right: 28,
        bottom: bottomPosition,
        zIndex: 900,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        transition: isReducedMotion ? 'none' : 'bottom 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Floating Action Menu on Hover */}
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
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            animation: 'fadeIn 0.15s ease-out',
          }}
          onMouseEnter={() => setShowToolbar(true)}
          onMouseLeave={() => setShowToolbar(false)}
        >
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
            title="Pet TeXCat (Show love)"
            aria-label="Pet companion"
          >
            <Heart size={11} color="#f43f5e" fill="#f43f5e" />
            <span>Pet</span>
          </button>

          <button
            type="button"
            className="btn-ghost"
            style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
            onClick={(e) => {
              e.stopPropagation();
              triggerYarnChase?.();
            }}
            title="Toss cyan yarn ball for TeXCat to chase"
            aria-label="Toss yarn ball"
          >
            <Sparkles size={11} color="#38bdf8" />
            <span>Yarn</span>
          </button>

          <button
            type="button"
            className="btn-ghost"
            style={{ padding: '2px 5px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
            onClick={(e) => {
              e.stopPropagation();
              wakeUp?.();
            }}
            title="Toggle sleep / wake"
            aria-label="Toggle sleep"
          >
            <Moon size={11} color="#a855f7" />
          </button>

          <div style={{ width: 1, height: 12, backgroundColor: 'var(--border-subtle, #334155)', margin: '0 2px' }} />

          <button
            type="button"
            className="btn-ghost"
            style={{ padding: '2px 4px', fontSize: 11, color: 'var(--text-muted)' }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleEnabled?.();
            }}
            title="Dismiss / Disable Desk Companion"
            aria-label="Disable companion"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Main Mascot Wrapper */}
      <div
        className="desk-pet-mascot-wrapper"
        style={{
          pointerEvents: 'auto',
          position: 'relative',
          cursor: 'pointer',
          transform: isReducedMotion
            ? 'none'
            : `translate3d(-${pacingOffset}px, 0, 0)`,
          transition: isReducedMotion ? 'none' : 'transform 0.4s ease-out',
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setShowToolbar(true)}
        onMouseLeave={() => setShowToolbar(false)}
        role="img"
        tabIndex={0}
        aria-label={`TeXCat Desk Companion: ${stateLabel}. Pet count: ${petCount}. (Click to interact, double-click for yarn, hover for actions)`}
        title={`TeXCat: ${stateLabel}${petCount > 0 ? ` (Loved ${petCount} times)` : ''} — Click to interact`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick(e as unknown as React.MouseEvent);
          }
        }}
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

        {/* Floating Sparkles on Compile Success */}
        {state === 'compile-success' && (
          <div className="pet-sparkle-particles" aria-hidden="true">
            <span className="floating-sparkle sparkle-1">✦</span>
            <span className="floating-sparkle sparkle-2">✧</span>
            <span className="floating-sparkle sparkle-3">⋆</span>
          </div>
        )}

        {/* Rolling Cyan Yarn Ball during Yarn Chase */}
        {state === 'yarn-chase' && (
          <div className="pet-yarn-ball" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" fill="#0284c7" stroke="#38bdf8" strokeWidth="2" />
              <path d="M6 12C9 8 15 8 18 12" stroke="#bae6fd" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M12 6C8 9 8 15 12 18" stroke="#bae6fd" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M18 15C19.5 17 21 19 23 18" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        )}

        {/* Reaction Speech Bubble for Diagnostics or Status */}
        {state === 'compile-fail' && (
          <div className="pet-reaction-bubble reaction-fail" aria-hidden="true">
            <span>❓ Log alert</span>
            <div className="bubble-arrow" />
          </div>
        )}
        {state === 'compile-success' && (
          <div className="pet-reaction-bubble reaction-success" aria-hidden="true">
            <span>✨ Q.E.D.</span>
            <div className="bubble-arrow" />
          </div>
        )}

        {/* Procedural High-DPI Vector Mascot (TeXCat) */}
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
            {/* Filter for subtle mascot drop shadow */}
            <defs>
              <filter id="texcat-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.35" />
              </filter>
            </defs>

            {/* Base platform shadow */}
            <ellipse cx="32" cy="56" rx="20" ry="4" fill="rgba(0,0,0,0.25)" />

            {/* Tail Layer with Sway Animation */}
            <g className="texcat-tail" style={{ transformOrigin: '48px 50px' }}>
              <path
                d="M44 48 C 54 44, 58 36, 56 30 C 54 26, 50 28, 51 32 C 52 38, 48 42, 42 46"
                stroke="var(--pet-fur-stroke, #334155)"
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
              />
            </g>

            {/* Cat Body */}
            <g className="texcat-body" filter="url(#texcat-shadow)">
              {/* Back / Torso */}
              <ellipse
                cx="32"
                cy="44"
                rx="15"
                ry="13"
                fill="var(--pet-fur-fill, #1e293b)"
                stroke="var(--pet-fur-stroke, #475569)"
                strokeWidth="2"
              />
              {/* Soft Chest Marking */}
              <ellipse cx="32" cy="45" rx="8" ry="9" fill="var(--pet-chest-fill, #334155)" opacity="0.6" />
            </g>

            {/* Cat Head Layer */}
            <g className="texcat-head" style={{ transformOrigin: '32px 30px' }}>
              {/* Left Ear */}
              <path
                d="M19 22 L 23 10 L 31 18 Z"
                fill="var(--pet-fur-fill, #1e293b)"
                stroke="var(--pet-fur-stroke, #475569)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="M22 19 L 24 13 L 29 18 Z" fill="#fb7185" opacity="0.8" />

              {/* Right Ear */}
              <path
                d="M45 22 L 41 10 L 33 18 Z"
                fill="var(--pet-fur-fill, #1e293b)"
                stroke="var(--pet-fur-stroke, #475569)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="M42 19 L 40 13 L 35 18 Z" fill="#fb7185" opacity="0.8" />

              {/* Head Circle */}
              <ellipse
                cx="32"
                cy="28"
                rx="17"
                ry="14"
                fill="var(--pet-fur-fill, #1e293b)"
                stroke="var(--pet-fur-stroke, #475569)"
                strokeWidth="2"
              />

              {/* Cheeks / Whiskers */}
              <path d="M12 28 L 22 29 M 11 32 L 21 31" stroke="var(--text-muted, #94a3b8)" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M52 28 L 42 29 M 53 32 L 43 31" stroke="var(--text-muted, #94a3b8)" strokeWidth="1.2" strokeLinecap="round" />

              {/* Nose */}
              <polygon points="30,31 34,31 32,33" fill="#fb7185" />

              {/* Mouth */}
              <path
                d="M30 34 Q 32 36 34 34"
                stroke="var(--text-muted, #94a3b8)"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />

              {/* Eyes Expression System */}
              {state === 'sleep' ? (
                // Sleeping Eyes: Curved closed slits ^ ^
                <g className="texcat-eyes-sleep">
                  <path d="M22 27 Q 26 23 29 27" stroke="var(--text-primary, #f8fafc)" strokeWidth="2" strokeLinecap="round" fill="none" />
                  <path d="M35 27 Q 38 23 42 27" stroke="var(--text-primary, #f8fafc)" strokeWidth="2" strokeLinecap="round" fill="none" />
                </g>
              ) : state === 'compile-success' ? (
                // Celebratory Happy Eyes
                <g className="texcat-eyes-happy">
                  <path d="M22 28 Q 26 24 29 28" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  <path d="M35 28 Q 38 24 42 28" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                </g>
              ) : state === 'compile-fail' ? (
                // Puzzled / Diagnostic Alert Eyes
                <g className="texcat-eyes-fail">
                  <ellipse cx="25" cy="26" rx="3.5" ry="4" fill="#f59e0b" />
                  <ellipse cx="38" cy="27" rx="4" ry="2.5" fill="#f59e0b" />
                  <circle cx="26" cy="25" r="1.5" fill="#000" />
                  <circle cx="38" cy="27" r="1" fill="#000" />
                  {/* Sweat drop on brow */}
                  <path d="M43 18 C 43 18 45 22 43 23 C 41 23 41 21 43 18 Z" fill="#38bdf8" opacity="0.9" />
                </g>
              ) : (
                // Normal / Attentive Eyes with Procedural CSS Blink
                <g className="texcat-eyes-normal">
                  <ellipse cx="25" cy="26" rx="3.5" ry="4" fill="#38bdf8" className="texcat-eye-pupil" />
                  <circle cx="26" cy="24.5" r="1.2" fill="#fff" />
                  <ellipse cx="39" cy="26" rx="3.5" ry="4" fill="#38bdf8" className="texcat-eye-pupil" />
                  <circle cx="40" cy="24.5" r="1.2" fill="#fff" />
                </g>
              )}

              {/* Scholar Mode: Gold Reading Glasses */}
              {state === 'compiling-scholar' && (
                <g className="texcat-glasses" aria-hidden="true">
                  <circle cx="25" cy="26" r="5" stroke="#f59e0b" strokeWidth="1.5" fill="rgba(245,158,11,0.15)" />
                  <circle cx="39" cy="26" r="5" stroke="#f59e0b" strokeWidth="1.5" fill="rgba(245,158,11,0.15)" />
                  <path d="M30 26 L 34 26" stroke="#f59e0b" strokeWidth="1.5" />
                  <path d="M20 26 L 15 24" stroke="#f59e0b" strokeWidth="1.2" />
                  <path d="M44 26 L 49 24" stroke="#f59e0b" strokeWidth="1.2" />
                </g>
              )}

              {/* Detective Mode: Handheld Magnifying Glass */}
              {state === 'compile-fail' && (
                <g className="texcat-magnifier" aria-hidden="true" style={{ transformOrigin: '40px 38px' }}>
                  <circle cx="44" cy="38" r="6" stroke="#38bdf8" strokeWidth="2" fill="rgba(56,189,248,0.2)" />
                  <path d="M48 42 L 54 48" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
                </g>
              )}
            </g>

            {/* Front Paws & Desk / Keyboard Layer */}
            {state === 'typing-paws' ? (
              // Bongo Cat Drumming Paws & Mini Keyboard Desk
              <g className="texcat-bongo-rig">
                {/* Mini Keyboard Desk */}
                <rect x="14" y="49" width="36" height="6" rx="2" fill="#0f172a" stroke="#334155" strokeWidth="1" />
                <line x1="18" y1="52" x2="46" y2="52" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 2" />

                {/* Alternating Paws */}
                <g className="texcat-paw-left">
                  <ellipse cx="23" cy="48" rx="4.5" ry="3.5" fill="var(--pet-fur-fill, #1e293b)" stroke="#475569" strokeWidth="1.5" />
                </g>
                <g className="texcat-paw-right">
                  <ellipse cx="41" cy="48" rx="4.5" ry="3.5" fill="var(--pet-fur-fill, #1e293b)" stroke="#475569" strokeWidth="1.5" />
                </g>
              </g>
            ) : state === 'compiling-scholar' ? (
              // Scholar Holding Miniature Manuscript
              <g className="texcat-scholar-props">
                <rect x="22" y="44" width="20" height="12" rx="1" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
                <line x1="25" y1="47" x2="39" y2="47" stroke="#0284c7" strokeWidth="1" />
                <line x1="25" y1="50" x2="36" y2="50" stroke="#64748b" strokeWidth="1" />
                <line x1="25" y1="53" x2="38" y2="53" stroke="#64748b" strokeWidth="1" />
                {/* Paws holding sides */}
                <ellipse cx="22" cy="49" rx="3.5" ry="4" fill="var(--pet-fur-fill, #1e293b)" stroke="#475569" strokeWidth="1.2" />
                <ellipse cx="42" cy="49" rx="3.5" ry="4" fill="var(--pet-fur-fill, #1e293b)" stroke="#475569" strokeWidth="1.2" />
              </g>
            ) : (
              // Resting Front Paws
              <g className="texcat-paws-resting">
                <ellipse cx="24" cy="52" rx="4.5" ry="3.5" fill="var(--pet-fur-fill, #1e293b)" stroke="#475569" strokeWidth="1.5" />
                <ellipse cx="40" cy="52" rx="4.5" ry="3.5" fill="var(--pet-fur-fill, #1e293b)" stroke="#475569" strokeWidth="1.5" />
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};
