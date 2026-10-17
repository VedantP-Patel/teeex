/**
 * Procedural Web Audio Engine for TeXCat Desk Companion.
 * Generates synthetic purr rumble, success chimes, and tactile audio.
 * Zero external audio files / MP3s required (< 1 KB footprint).
 * Strictly MUTED by default.
 */

export class DeskPetAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true;
  private activePurrStop: (() => void) | null = null;

  constructor(isMuted: boolean = true) {
    this.isMuted = isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.stopPurr();
      if (this.ctx && this.ctx.state === 'running') {
        void this.ctx.suspend();
      }
    } else {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  private ensureContext(): AudioContext | null {
    if (this.isMuted || typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Cat Purr: Generates a deep 28Hz modulated filtered white noise rumble.
   */
  public playPurr(durationMs = 1400): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    this.stopPurr();

    try {
      const sampleRate = ctx.sampleRate;
      const bufferSize = Math.floor(sampleRate * (durationMs / 1000));
      const noiseBuffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = noiseBuffer.getChannelData(0);

      // Generate soft pink/brownish noise
      let b0 = 0, b1 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.95 * b1 + white * 0.08;
        data[i] = (b0 + b1) * 0.5;
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      // Heavy low-pass filter (chest resonance around 80Hz)
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(75, ctx.currentTime);

      // LFO modulation to pulse volume at 26Hz (cat vocal chord flutter)
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(26, ctx.currentTime);

      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(35, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      // Main volume envelope
      const gainNode = ctx.createGain();
      const now = ctx.currentTime;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.35, now + 0.15);
      gainNode.gain.linearRampToValueAtTime(0.35, now + (durationMs / 1000) - 0.2);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + (durationMs / 1000));

      noiseSource.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      noiseSource.start(now);
      lfo.start(now);

      const stopTime = now + (durationMs / 1000);
      noiseSource.stop(stopTime);
      lfo.stop(stopTime);

      this.activePurrStop = () => {
        try {
          noiseSource.stop();
          lfo.stop();
        } catch {
          // Ignore
        }
      };
    } catch {
      // Ignore audio synthesis errors
    }
  }

  public stopPurr(): void {
    if (this.activePurrStop) {
      this.activePurrStop();
      this.activePurrStop = null;
    }
  }

  /**
   * Success Chime: Ascending major triad chord (C5 523Hz -> E5 659Hz -> G5 784Hz).
   */
  public playSuccessChime(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        const startTime = now + idx * 0.08;
        const endTime = startTime + 0.9;

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, endTime);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(endTime);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Alert Boop: Soft rounded wooden blip on compile error diagnostics.
   */
  public playAlertBoop(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.22);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Ignore
    }
  }

  /**
   * Yarn Pounce Chirp: Playful high chirp when batting yarn.
   */
  public playYarnChirp(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.linearRampToValueAtTime(980, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.2);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {
      // Ignore
    }
  }

  /**
   * Suspend context on tab backgrounding.
   */
  public handleVisibilityChange(hidden: boolean): void {
    if (hidden) {
      this.stopPurr();
      if (this.ctx && this.ctx.state === 'running') {
        void this.ctx.suspend();
      }
    }
  }
}
