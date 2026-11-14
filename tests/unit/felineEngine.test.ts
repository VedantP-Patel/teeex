import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FELINE_DRIVES,
  stepFelineDrives,
  deriveFelineMood,
  scoreBehaviorCandidates,
  computeGazeOffset,
  computeTailPath,
} from '../../src/utils/felineEngine';

describe('Stage 20 & 21: Feline Homeostatic Drive Engine & Gaze/Tail Kinematics', () => {
  it('evolves homeostatic drives realistically across sleep, typing, and play states', () => {
    const afterTyping = stepFelineDrives(DEFAULT_FELINE_DRIVES, {
      dtSec: 10,
      state: 'idle',
      isTypingActive: true,
      cursorContext: 'math',
    });
    expect(afterTyping.mischief).toBeGreaterThan(DEFAULT_FELINE_DRIVES.mischief);
    expect(afterTyping.curiosity).toBeGreaterThan(DEFAULT_FELINE_DRIVES.curiosity);

    const lowEnergy = { ...DEFAULT_FELINE_DRIVES, energy: 0.2 };
    const afterSleep = stepFelineDrives(lowEnergy, {
      dtSec: 10,
      state: 'sleep',
      isTypingActive: false,
    });
    expect(afterSleep.energy).toBeGreaterThan(lowEnergy.energy);
  });

  it('derives accurate moods and penalizes recently repeated behaviors in Utility AI', () => {
    expect(deriveFelineMood({ ...DEFAULT_FELINE_DRIVES, stimulation: 0.85 }, 'idle')).toBe('sassy');
    expect(deriveFelineMood({ ...DEFAULT_FELINE_DRIVES, energy: 0.15 }, 'idle')).toBe('sleepy');
    expect(deriveFelineMood(DEFAULT_FELINE_DRIVES, 'compiling-scholar')).toBe('focused');

    const freshScores = scoreBehaviorCandidates({
      drives: { ...DEFAULT_FELINE_DRIVES, mischief: 0.9, energy: 0.8 },
      recentStates: [],
    });
    const penalizedScores = scoreBehaviorCandidates({
      drives: { ...DEFAULT_FELINE_DRIVES, mischief: 0.9, energy: 0.8 },
      recentStates: ['knock-mug'],
    });
    const freshKnock = freshScores.find(s => s.action === 'knock-mug')!.score;
    const penalizedKnock = penalizedScores.find(s => s.action === 'knock-mug')!.score;
    expect(penalizedKnock).toBeLessThan(freshKnock);
  });

  it('clamps cursor gaze vectors within deadzone and generates mood-specific Bézier tails', () => {
    expect(
      computeGazeOffset({ pointerX: 505, pointerY: 505, petCenterX: 500, petCenterY: 500 })
    ).toEqual({ x: 0, y: 0 });

    const farLeft = computeGazeOffset({
      pointerX: 0,
      pointerY: 500,
      petCenterX: 900,
      petCenterY: 500,
      maxOffset: 2.0,
    });
    expect(farLeft.x).toBeCloseTo(-2.0, 2);
    expect(farLeft.y).toBeCloseTo(0, 2);

    expect(computeTailPath('sleepy')).toContain('Q 10 53');
    expect(computeTailPath('playful')).toContain('C 7 37');
  });
});
