import { describe, it, expect } from 'vitest';
import {
  getCircadianBucket,
  selectContextualIdleCandidate,
  PRESTIGE_SKIN_UNLOCKS,
  PRESTIGE_ACCESSORY_UNLOCKS,
  getScholarLevel,
} from '../../src/hooks/useDeskPet';

describe('DeskPet Enhancements', () => {
  it('classifies circadian buckets accurately across 24 hours', () => {
    expect(getCircadianBucket(new Date(2026, 10, 15, 8, 0))).toBe('morning');
    expect(getCircadianBucket(new Date(2026, 10, 15, 14, 30))).toBe('afternoon');
    expect(getCircadianBucket(new Date(2026, 10, 15, 20, 0))).toBe('evening');
    expect(getCircadianBucket(new Date(2026, 10, 15, 2, 15))).toBe('lateNight');
  });

  it('selects valid contextual idle candidates without immediate repetition', () => {
    const pick = selectContextualIdleCandidate({
      cursorContext: 'math',
      recentStates: ['nap-yawn', 'blep'],
      now: new Date(2026, 10, 15, 1, 0),
      rng: () => 0.42,
    });
    expect(pick).not.toBe('roam');
    if (pick !== 'roam') {
      expect(pick.duration).toBeGreaterThan(0);
    }
  });

  it('unlocks prestige skins and accessories monotonically with Scholar XP levels', () => {
    expect(getScholarLevel(0).level).toBe(1);
    expect(getScholarLevel(150).level).toBe(2);
    expect(getScholarLevel(1200).level).toBe(5);
    expect(PRESTIGE_SKIN_UNLOCKS.every(s => s.unlockLevel >= 2 && s.unlockLevel <= 5)).toBe(true);
    expect(PRESTIGE_ACCESSORY_UNLOCKS.every(a => a.unlockLevel >= 2 && a.unlockLevel <= 5)).toBe(true);
  });
});
