import { describe, it, expect, beforeEach } from 'vitest';
import {
  isFelineAudioMuted,
  setFelineAudioMuted,
  playFelineCue,
} from '../../src/utils/felineSynth';
import {
  stepLaserPursuit,
  stepYarnBallPhysics,
  batYarnBall,
  type YarnBallState,
} from '../../src/utils/felineEngine';

describe('Stage 24 & 25: Procedural Feline Web Audio Synth & Interactive Toy Physics', () => {
  beforeEach(() => {
    setFelineAudioMuted(false);
  });

  it('persists mute state and safely no-ops in headless environments without AudioContext', () => {
    expect(isFelineAudioMuted()).toBe(false);
    setFelineAudioMuted(true);
    expect(isFelineAudioMuted()).toBe(true);
    expect(playFelineCue('purr')).toBe(false);

    setFelineAudioMuted(false);
    expect(isFelineAudioMuted()).toBe(false);
    // In jsdom without Web Audio API, playFelineCue degrades gracefully without throwing
    expect(() => playFelineCue('chirp')).not.toThrow();
  });

  it('advances laser pursuit along unit direction vector and detects catch radius', () => {
    const step1 = stepLaserPursuit({
      petPos: { x: 100, y: 16 },
      laserPos: { x: 400, y: 16 },
      dtSec: 0.1,
      speedPxPerSec: 300,
      catchRadiusPx: 20,
    });
    expect(step1.nextPos.x).toBeCloseTo(130, 1);
    expect(step1.caught).toBe(false);
    expect(step1.facing).toBe('left');

    const caughtStep = stepLaserPursuit({
      petPos: { x: 388, y: 16 },
      laserPos: { x: 400, y: 16 },
      dtSec: 0.1,
      speedPxPerSec: 300,
      catchRadiusPx: 20,
    });
    expect(caughtStep.caught).toBe(true);
  });

  it('simulates yarn-ball gravity, floor/wall elastic bounces, and feline paw-bat impulses', () => {
    let ball: YarnBallState = {
      x: 50,
      y: 25,
      vx: -400,
      vy: -120,
      angleDeg: 0,
      radius: 11,
    };

    // Step into left wall and floor
    ball = stepYarnBallPhysics(ball, { minX: 16, maxX: 800, floorY: 16 }, 0.1);
    expect(ball.x).toBe(16);
    expect(ball.vx).toBeGreaterThan(0);
    expect(ball.y).toBe(16);
    expect(ball.vy).toBeGreaterThan(0);

    const batted = batYarnBall(ball, 'left');
    expect(batted.vx).toBe(310);
    expect(batted.vy).toBeGreaterThanOrEqual(340);
  });
});
