import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FELINE_DRIVES,
  extractWorkspaceLedges,
  computeParabolicJumpArc,
  computeScruffPendulumTilt,
  classifyPettingZone,
  applyPettingZoneInteraction,
} from '../../src/utils/felineEngine';

describe('Stage 22 & 23: Workspace Ledges, Parabolic Jumps, Scruff Inertia & Tactile Zones', () => {
  it('extracts walkable workspace ledges in right/bottom perch coordinates with floor fallback', () => {
    const ledges = extractWorkspaceLedges(1280, 800, [
      { id: 'editor-pane', label: 'Editor Ledge', top: 140, left: 40, right: 640, bottom: 760 },
      { id: 'too-narrow', label: 'Tiny', top: 200, left: 10, right: 80, bottom: 300 },
    ]);

    expect(ledges[0].id).toBe('viewport-floor');
    expect(ledges[0].yBottom).toBe(16);

    const editorLedge = ledges.find(l => l.id === 'editor-pane');
    expect(editorLedge).toBeDefined();
    expect(editorLedge!.yBottom).toBe(660);
    expect(editorLedge!.xMin).toBe(652);
  });

  it('computes parabolic jump arcs with smooth endpoints and apex lift', () => {
    const start = { x: 40, y: 16 };
    const target = { x: 340, y: 216 };

    expect(computeParabolicJumpArc(start, target, 0, 60)).toEqual({ x: 40, y: 16 });
    expect(computeParabolicJumpArc(start, target, 1, 60)).toEqual({ x: 340, y: 216 });

    const apex = computeParabolicJumpArc(start, target, 0.5, 60);
    expect(apex.x).toBeCloseTo(190, 1);
    expect(apex.y).toBeCloseTo(176, 1);
  });

  it('models damped scruff-drag pendulum tilt that decays cleanly back to rest', () => {
    const swung = computeScruffPendulumTilt(900, 0, 0.08);
    expect(swung).toBeGreaterThan(10);
    expect(swung).toBeLessThanOrEqual(26);

    let angle = swung;
    for (let i = 0; i < 40; i++) {
      angle = computeScruffPendulumTilt(0, angle, 0.05);
    }
    expect(angle).toBe(0);
  });

  it('classifies tactile petting zones and enforces the feline belly-rub trap', () => {
    expect(classifyPettingZone(34, 12, 68, 68)).toBe('head');
    expect(classifyPettingZone(42, 30, 68, 68)).toBe('chin');
    expect(classifyPettingZone(40, 48, 68, 68)).toBe('belly');
    expect(classifyPettingZone(16, 40, 68, 68)).toBe('back');

    const chinRes = applyPettingZoneInteraction(DEFAULT_FELINE_DRIVES, 'chin');
    expect(chinRes.reaction).toBe('heart-eyes');
    expect(chinRes.drives.affection).toBeGreaterThan(DEFAULT_FELINE_DRIVES.affection);

    const bellyTrapRes = applyPettingZoneInteraction(DEFAULT_FELINE_DRIVES, 'belly');
    expect(bellyTrapRes.reaction).toBe('annoyed');
    expect(bellyTrapRes.drives.stimulation).toBeGreaterThan(0.4);

    const trustedBellyRes = applyPettingZoneInteraction(
      { ...DEFAULT_FELINE_DRIVES, affection: 0.9, stimulation: 0.1 },
      'belly'
    );
    expect(trustedBellyRes.reaction).toBe('purr');
  });
});
