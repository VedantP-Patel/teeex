export interface FelineDrives {
  energy: number;
  curiosity: number;
  affection: number;
  mischief: number;
  stimulation: number;
}

export type FelineMood = 'content' | 'playful' | 'sleepy' | 'sassy' | 'focused';

export type StructuralCursorContext = 'math' | 'text' | 'preamble' | 'bib' | 'figure' | (string & {});

export interface GazeVector {
  x: number;
  y: number;
}

export interface BehaviorCandidateScore {
  action: string;
  score: number;
}

export const DEFAULT_FELINE_DRIVES: FelineDrives = {
  energy: 0.78,
  curiosity: 0.52,
  affection: 0.60,
  mischief: 0.34,
  stimulation: 0.12,
};

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function stepFelineDrives(
  prev: FelineDrives,
  params: {
    dtSec: number;
    state: string;
    isTypingActive: boolean;
    cursorContext?: StructuralCursorContext;
  }
): FelineDrives {
  const dt = Math.max(0, Math.min(params.dtSec, 10));
  const { state, isTypingActive, cursorContext } = params;

  const isResting = state === 'sleep' || state === 'loaf';
  const isHighEnergy =
    state === 'yarn-chase' ||
    state === 'laser-chase' ||
    state === 'pounce-leap' ||
    state === 'roam' ||
    state === 'knock-mug' ||
    state === 'swat-cursor';
  const isAffectionate =
    state === 'purr' ||
    state === 'knead-dough' ||
    state === 'face-wash' ||
    state === 'heart-eyes';
  const isAnnoyed = state === 'annoyed' || state === 'drama-flop';

  const energyDelta = isResting
    ? 0.022 * dt
    : isHighEnergy
      ? -0.026 * dt
      : -0.005 * dt;

  const contextCuriosityBoost =
    cursorContext === 'math' || cursorContext === 'bib' ? 0.006 * dt : 0;
  const curiosityDelta = isHighEnergy
    ? -0.03 * dt
    : 0.011 * dt + contextCuriosityBoost;

  const affectionDelta = isAffectionate
    ? 0.035 * dt
    : isAnnoyed
      ? -0.04 * dt
      : 0.004 * dt;

  const mischiefDelta =
    state === 'knock-mug' || state === 'swat-cursor' || state === 'peek-a-boo'
      ? -0.08 * dt
      : isTypingActive
        ? 0.016 * dt
        : 0.005 * dt;

  const stimulationDecay = isAnnoyed ? -0.045 * dt : -0.075 * dt;

  return {
    energy: clamp01(prev.energy + energyDelta),
    curiosity: clamp01(prev.curiosity + curiosityDelta),
    affection: clamp01(prev.affection + affectionDelta),
    mischief: clamp01(prev.mischief + mischiefDelta),
    stimulation: clamp01(prev.stimulation + stimulationDecay),
  };
}

export function deriveFelineMood(drives: FelineDrives, state: string): FelineMood {
  if (state === 'compiling-scholar' || state === 'focus-scholar') {
    return 'focused';
  }
  if (state === 'annoyed' || drives.stimulation > 0.72) {
    return 'sassy';
  }
  if (state === 'sleep' || state === 'nap-yawn' || drives.energy < 0.28) {
    return 'sleepy';
  }
  if (drives.energy > 0.52 && (drives.curiosity > 0.56 || drives.mischief > 0.54)) {
    return 'playful';
  }
  return 'content';
}

export function scoreBehaviorCandidates(params: {
  drives: FelineDrives;
  cursorContext?: StructuralCursorContext;
  recentStates: string[];
}): BehaviorCandidateScore[] {
  const { drives, cursorContext, recentStates } = params;
  const recentSet = new Set(recentStates.slice(-4));

  const raw: BehaviorCandidateScore[] = [
    {
      action: 'knock-mug',
      score: drives.mischief * 0.7 + drives.energy * 0.3,
    },
    {
      action: 'swat-cursor',
      score: drives.curiosity * 0.6 + drives.mischief * 0.4,
    },
    {
      action: 'butterfly-bat',
      score: drives.curiosity * 0.65 + drives.energy * 0.35,
    },
    {
      action: 'knead-dough',
      score: drives.affection * 0.75 + (1 - drives.stimulation) * 0.25,
    },
    {
      action: 'face-wash',
      score: drives.affection * 0.5 + (1 - drives.mischief) * 0.5,
    },
    {
      action: 'yoga-stretch',
      score: (1 - drives.energy) * 0.45 + drives.affection * 0.35 + 0.2,
    },
    {
      action: 'nap-yawn',
      score: (1 - drives.energy) * 0.85,
    },
    {
      action: 'focus-scholar',
      score:
        (cursorContext === 'math' || cursorContext === 'preamble' ? 0.45 : 0.2) +
        (1 - drives.mischief) * 0.4,
    },
  ];

  return raw
    .map(item => ({
      action: item.action,
      score: Number((recentSet.has(item.action) ? item.score * 0.45 : item.score).toFixed(4)),
    }))
    .sort((a, b) => b.score - a.score);
}

export function computeGazeOffset(params: {
  pointerX: number;
  pointerY: number;
  petCenterX: number;
  petCenterY: number;
  maxOffset?: number;
  deadzonePx?: number;
}): GazeVector {
  const maxOffset = params.maxOffset ?? 2.1;
  const deadzonePx = params.deadzonePx ?? 18;
  const dx = params.pointerX - params.petCenterX;
  const dy = params.pointerY - params.petCenterY;
  const dist = Math.hypot(dx, dy);

  if (dist <= deadzonePx) {
    return { x: 0, y: 0 };
  }

  const normalized = Math.min(1, (dist - deadzonePx) / 260);
  const angle = Math.atan2(dy, dx);
  return {
    x: Number((Math.cos(angle) * maxOffset * normalized).toFixed(2)),
    y: Number((Math.sin(angle) * maxOffset * normalized).toFixed(2)),
  };
}

export function computeTailPath(mood: FelineMood, phaseRad = 0): string {
  const sway = Math.sin(phaseRad);
  if (mood === 'sleepy') {
    return 'M 15 47 Q 10 53 19 55';
  }
  if (mood === 'sassy') {
    const tipX = (6 + sway * 4).toFixed(1);
    const tipY = (44 - Math.abs(sway) * 3).toFixed(1);
    return `M 15 45 Q 9 47 ${tipX} ${tipY}`;
  }
  if (mood === 'playful') {
    const tipX = (11 + sway * 3.5).toFixed(1);
    return `M 15 44 C 7 37, 8 27, ${tipX} 24`;
  }
  if (mood === 'focused') {
    const tipX = (12 + sway * 1.5).toFixed(1);
    return `M 15 44 C 9 39, 9 31, ${tipX} 28`;
  }
  const tipX = (13 + sway * 2).toFixed(1);
  return `M 15 44 C 8 38, 9 28, ${tipX} 26`;
}


export interface WorkspaceLedge {
  id: string;
  label: string;
  xMin: number;
  xMax: number;
  yBottom: number;
}

export interface DomRectLike {
  id: string;
  label: string;
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export type PettingZone = 'head' | 'chin' | 'back' | 'belly';

export interface PettingReactionResult {
  drives: FelineDrives;
  reaction: 'purr' | 'heart-eyes' | 'annoyed';
  affectionDelta: number;
  stimulationDelta: number;
}

export function extractWorkspaceLedges(
  viewportWidth: number,
  viewportHeight: number,
  rects: DomRectLike[]
): WorkspaceLedge[] {
  const floorMaxX = Math.max(80, Math.round(viewportWidth - 84));
  const ledges: WorkspaceLedge[] = [
    {
      id: 'viewport-floor',
      label: 'Desk Floor',
      xMin: 16,
      xMax: floorMaxX,
      yBottom: 16,
    },
  ];

  for (const r of rects) {
    const width = r.right - r.left;
    const yBottom = Math.round(viewportHeight - r.top);
    if (width < 120) continue;
    if (r.top < 72 || yBottom < 44 || yBottom > viewportHeight - 72) continue;

    const xMin = Math.max(16, Math.round(viewportWidth - r.right + 12));
    const xMax = Math.max(xMin + 24, Math.round(viewportWidth - r.left - 76));
    if (xMax <= floorMaxX) {
      ledges.push({
        id: r.id,
        label: r.label,
        xMin,
        xMax,
        yBottom,
      });
    }
  }

  return ledges;
}

export function computeParabolicJumpArc(
  start: { x: number; y: number },
  target: { x: number; y: number },
  tNorm: number,
  arcHeight = 54
): { x: number; y: number } {
  const t = clamp01(tNorm);
  const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const x = start.x + (target.x - start.x) * ease;
  const linearY = start.y + (target.y - start.y) * ease;
  const lift = 4 * arcHeight * t * (1 - t);
  return {
    x: Number(x.toFixed(2)),
    y: Number((linearY + lift).toFixed(2)),
  };
}

export function computeScruffPendulumTilt(
  velocityX: number,
  prevAngleDeg: number,
  dtSec: number
): number {
  const dt = Math.max(0.001, Math.min(dtSec, 0.25));
  const clampedTarget = Math.max(-26, Math.min(26, velocityX * 0.045));
  const blend = 1 - Math.exp(-14 * dt);
  const next = prevAngleDeg + (clampedTarget - prevAngleDeg) * blend;
  return Math.abs(next) < 0.05 ? 0 : Number(next.toFixed(2));
}

export function classifyPettingZone(
  localX: number,
  localY: number,
  width = 68,
  height = 68
): PettingZone {
  const nx = clamp01(width > 0 ? localX / width : 0.5);
  const ny = clamp01(height > 0 ? localY / height : 0.5);

  if (ny < 0.36) return 'head';
  if (ny < 0.56 && nx >= 0.45) return 'chin';
  if (ny >= 0.56 && nx >= 0.42) return 'belly';
  return 'back';
}

export function applyPettingZoneInteraction(
  drives: FelineDrives,
  zone: PettingZone
): PettingReactionResult {
  if (zone === 'belly') {
    const trusted = drives.affection >= 0.82 && drives.stimulation < 0.35;
    if (trusted) {
      const affectionDelta = 0.08;
      const stimulationDelta = 0.12;
      return {
        drives: {
          ...drives,
          affection: clamp01(drives.affection + affectionDelta),
          stimulation: clamp01(drives.stimulation + stimulationDelta),
        },
        reaction: 'purr',
        affectionDelta,
        stimulationDelta,
      };
    }
    const affectionDelta = -0.08;
    const stimulationDelta = 0.34;
    return {
      drives: {
        ...drives,
        affection: clamp01(drives.affection + affectionDelta),
        stimulation: clamp01(drives.stimulation + stimulationDelta),
      },
      reaction: 'annoyed',
      affectionDelta,
      stimulationDelta,
    };
  }

  if (zone === 'chin') {
    const affectionDelta = 0.14;
    const stimulationDelta = 0.05;
    const nextAffection = clamp01(drives.affection + affectionDelta);
    return {
      drives: {
        ...drives,
        affection: nextAffection,
        stimulation: clamp01(drives.stimulation + stimulationDelta),
      },
      reaction: nextAffection >= 0.72 ? 'heart-eyes' : 'purr',
      affectionDelta,
      stimulationDelta,
    };
  }

  const affectionDelta = 0.09;
  const stimulationDelta = 0.08;
  return {
    drives: {
      ...drives,
      affection: clamp01(drives.affection + affectionDelta),
      stimulation: clamp01(drives.stimulation + stimulationDelta),
    },
    reaction: 'purr',
    affectionDelta,
    stimulationDelta,
  };
}


export type ActiveToyMode = 'none' | 'laser' | 'yarn';

export interface LaserPursuitStepResult {
  nextPos: { x: number; y: number };
  caught: boolean;
  facing: 'left' | 'right';
}

export interface YarnBallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angleDeg: number;
  radius: number;
}

export function stepLaserPursuit(params: {
  petPos: { x: number; y: number };
  laserPos: { x: number; y: number };
  dtSec: number;
  speedPxPerSec?: number;
  catchRadiusPx?: number;
}): LaserPursuitStepResult {
  const { petPos, laserPos } = params;
  const dt = Math.max(0.001, Math.min(params.dtSec, 0.25));
  const speed = params.speedPxPerSec ?? 280;
  const catchRadius = params.catchRadiusPx ?? 24;

  const dx = laserPos.x - petPos.x;
  const dy = laserPos.y - petPos.y;
  const dist = Math.hypot(dx, dy);
  const facing: 'left' | 'right' = dx > 0 ? 'left' : 'right';

  if (dist <= catchRadius) {
    return {
      nextPos: { x: Number(petPos.x.toFixed(2)), y: Number(petPos.y.toFixed(2)) },
      caught: true,
      facing,
    };
  }

  const step = Math.min(dist, speed * dt);
  const ux = dx / dist;
  const uy = dy / dist;
  return {
    nextPos: {
      x: Number((petPos.x + ux * step).toFixed(2)),
      y: Number((petPos.y + uy * step).toFixed(2)),
    },
    caught: dist - step <= catchRadius,
    facing,
  };
}

export function stepYarnBallPhysics(
  ball: YarnBallState,
  bounds: { minX: number; maxX: number; floorY: number },
  dtSec: number
): YarnBallState {
  const dt = Math.max(0.001, Math.min(dtSec, 0.1));
  const gravity = -920;
  const restitution = 0.76;
  const airDrag = Math.pow(0.86, dt);

  let vx = ball.vx * airDrag;
  let vy = ball.vy + gravity * dt;
  let x = ball.x + vx * dt;
  let y = ball.y + vy * dt;

  if (x < bounds.minX) {
    x = bounds.minX;
    vx = Math.abs(vx) * restitution;
  } else if (x > bounds.maxX) {
    x = bounds.maxX;
    vx = -Math.abs(vx) * restitution;
  }

  if (y <= bounds.floorY) {
    y = bounds.floorY;
    if (Math.abs(vy) < 28) {
      vy = 0;
      vx *= 0.88;
    } else {
      vy = Math.abs(vy) * restitution;
    }
  }

  if (Math.abs(vx) < 1.5) vx = 0;
  const angleDeg = (ball.angleDeg - vx * dt * 2.4) % 360;

  return {
    ...ball,
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    vx: Number(vx.toFixed(2)),
    vy: Number(vy.toFixed(2)),
    angleDeg: Number(angleDeg.toFixed(2)),
  };
}

export function batYarnBall(ball: YarnBallState, direction: 'left' | 'right'): YarnBallState {
  const impulseX = direction === 'left' ? 310 : -310;
  return {
    ...ball,
    vx: impulseX,
    vy: Math.max(ball.vy, 340),
  };
}
