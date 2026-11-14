export type FelineAudioCue = 'purr' | 'chirp' | 'trill' | 'meow';

const MUTE_STORAGE_KEY = 'teeex.texcat.muted';
let memoryMutedFallback = false;

export function isFelineAudioMuted(): boolean {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    }
  } catch {
    // Fall back to in-memory flag
  }
  return memoryMutedFallback;
}

export function setFelineAudioMuted(muted: boolean): boolean {
  memoryMutedFallback = muted;
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
    }
  } catch {
    // Ignore storage quota / privacy errors
  }
  return muted;
}

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new Ctor();
  }
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

export function playFelineCue(cue: FelineAudioCue, forceUnmuted = false): boolean {
  if (!forceUnmuted && isFelineAudioMuted()) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);

  if (cue === 'purr') {
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(26, now);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(24, now);
    lfoGain.gain.setValueAtTime(0.035, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);

    master.gain.setValueAtTime(0.001, now);
    master.gain.linearRampToValueAtTime(0.06, now + 0.08);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    osc.connect(filter);
    filter.connect(master);

    osc.start(now);
    lfo.start(now);
    osc.stop(now + 0.56);
    lfo.stop(now + 0.56);
    return true;
  }

  if (cue === 'chirp') {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(1380, now + 0.065);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.13);

    master.gain.setValueAtTime(0.001, now);
    master.gain.linearRampToValueAtTime(0.075, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(master);
    osc.start(now);
    osc.stop(now + 0.15);
    return true;
  }

  if (cue === 'trill') {
    const osc = ctx.createOscillator();
    const vibrato = ctx.createOscillator();
    const vibGain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.22);

    vibrato.type = 'sine';
    vibrato.frequency.setValueAtTime(34, now);
    vibGain.gain.setValueAtTime(28, now);

    master.gain.setValueAtTime(0.001, now);
    master.gain.linearRampToValueAtTime(0.07, now + 0.03);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    vibrato.connect(vibGain);
    vibGain.connect(osc.frequency);
    osc.connect(master);

    osc.start(now);
    vibrato.start(now);
    osc.stop(now + 0.26);
    vibrato.stop(now + 0.26);
    return true;
  }

  // 'meow'
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(650, now + 0.12);
  osc.frequency.exponentialRampToValueAtTime(380, now + 0.34);

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(880, now);
  filter.Q.setValueAtTime(2.2, now);

  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.08, now + 0.04);
  master.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

  osc.connect(filter);
  filter.connect(master);
  osc.start(now);
  osc.stop(now + 0.37);
  return true;
}
