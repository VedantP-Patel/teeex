/**
 * Procedural Web Audio Engine for TeXCat Desk Companion.
 * Generates synthetic purr rumble, success chimes, warning chimes,
 * mechanical switch typing thocks, and playful sound effects.
 * Zero external audio files / MP3s required (< 2 KB footprint).
 * Strictly MUTED by default.
 */

export class DeskPetAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true;
  private volume: number = 0.6;
  private masterGain: GainNode | null = null;
  private activePurrStop: (() => void) | null = null;

  constructor(isMuted: boolean = true, volume: number = 0.6) {
    this.isMuted = isMuted;
    this.volume = Math.max(0, Math.min(1, volume));
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

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  private ensureContext(): AudioContext | null {
    if (this.isMuted || typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
          this.masterGain.connect(this.ctx.destination);
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

  private getDestination(ctx: AudioContext): AudioNode {
    if (this.masterGain) {
      return this.masterGain;
    }
    return ctx.destination;
  }

  /**
   * Cat Purr: Generates a deep 28Hz modulated filtered white noise rumble with harmonic chest resonance.
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

      // Heavy low-pass filter (chest resonance around 75Hz)
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
      gainNode.connect(this.getDestination(ctx));

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
        gain.connect(this.getDestination(ctx));

        osc.start(startTime);
        osc.stop(endTime);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Warning Chime: Soft two-tone marimba chime (D5 587Hz -> A4 440Hz) for warning-only builds.
   */
  public playWarningChime(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [587.33, 440.00]; // D5, A4

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = idx === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        const startTime = now + idx * 0.12;
        const endTime = startTime + 0.45;

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.16, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, endTime);

        osc.connect(gain);
        gain.connect(this.getDestination(ctx));

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
      gain.connect(this.getDestination(ctx));

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Ignore
    }
  }

  /**
   * Mechanical Keyboard Switch Thock / Clack for Bongo Cat typing mode.
   */
  public playKeyClick(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Mechanical switch thock pitch contour
      const randomPitch = 240 + Math.random() * 60;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(randomPitch, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.045);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      osc.connect(gain);
      gain.connect(this.getDestination(ctx));

      osc.start(now);
      osc.stop(now + 0.05);
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
      gain.connect(this.getDestination(ctx));

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {
      // Ignore
    }
  }

  /**
   * Soft yarn bounce tap when physics yarn ball hits the ledge.
   */
  public playYarnBounce(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.06);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.getDestination(ctx));

      osc.start(now);
      osc.stop(now + 0.07);
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
