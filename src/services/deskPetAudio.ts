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
   * Procedural Feline Meow: Generates a resonant cat meow using modulated sine wave and vocal formants.
   */
  public playMeow(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Pitch glide: 520Hz -> 840Hz -> 410Hz
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.linearRampToValueAtTime(840, now + 0.18);
      osc.frequency.exponentialRampToValueAtTime(410, now + 0.42);

      // Resonant formant filter
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100, now);
      filter.Q.setValueAtTime(2.5, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getDestination(ctx));

      osc.start(now);
      osc.stop(now + 0.48);
    } catch {
      // Ignore
    }
  }

  /**
   * Sleepy Yawn Sigh: Soft descending breathy tone.
   */
  public playYawnSigh(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.65);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.getDestination(ctx));

      osc.start(now);
      osc.stop(now + 0.72);
    } catch {
      // Ignore
    }
  }

  /**
   * Ceramic Coffee Mug Clink: High chime tap followed by soft surface thud.
   */
  public playMugClink(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      // Sharp ceramic clink (1420Hz)
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(1420, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc1.connect(gain1);
      gain1.connect(this.getDestination(ctx));
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Low surface knock
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(210, now + 0.08);
      osc2.frequency.exponentialRampToValueAtTime(80, now + 0.22);
      gain2.gain.setValueAtTime(0.12, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc2.connect(gain2);
      gain2.connect(this.getDestination(ctx));
      osc2.start(now + 0.08);
      osc2.stop(now + 0.24);
    } catch {
      // Ignore
    }
  }

  /**
   * Laser Pointer Chirp: High-frequency modulated laser dot peep.
   */
  public playLaserChirp(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(780, now);
      osc.frequency.linearRampToValueAtTime(1240, now + 0.07);
      osc.frequency.exponentialRampToValueAtTime(540, now + 0.18);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.getDestination(ctx));

      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // Ignore
    }
  }

  /**
   * Fish Treat Crunch: Crispy wooden snack munch sound.
   */
  public playTreatCrunch(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      [0, 0.09, 0.19].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(idx === 1 ? 460 : 380, now + offset);
        osc.frequency.exponentialRampToValueAtTime(120, now + offset + 0.06);

        gain.gain.setValueAtTime(0.12, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);

        osc.connect(gain);
        gain.connect(this.getDestination(ctx));

        osc.start(now + offset);
        osc.stop(now + offset + 0.07);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Cardboard Box Thud: Hollow box landing impact.
   */
  public playBoxThud(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.getDestination(ctx));

      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // Ignore
    }
  }

  /**
   * Feline Annoyed Hiss: Bandpass-filtered high-frequency white noise hiss with sharp rise.
   */
  public playHiss(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const sampleRate = ctx.sampleRate;
      const duration = 0.42;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.4;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(4200, ctx.currentTime);
      filter.Q.setValueAtTime(2.2, ctx.currentTime);

      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.getDestination(ctx));

      noise.start(now);
      noise.stop(now + duration);
    } catch {
      // Ignore
    }
  }

  /**
   * Heavy Desk Tail Thump: Low-frequency wooden desk resonance.
   */
  public playTailThump(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.16);

      gain.gain.setValueAtTime(0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(this.getDestination(ctx));

      osc.start(now);
      osc.stop(now + 0.18);
    } catch {
      // Ignore
    }
  }

  /**
   * Airborne Pounce Leap & Impact: Fast frequency sweep followed by padded paw landing.
   */
  public playPounceLeap(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Spring leap whoosh
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(540, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.28);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(this.getDestination(ctx));
      osc.start(now);
      osc.stop(now + 0.32);

      // Padded paw slam landing impact
      const landingOsc = ctx.createOscillator();
      const landingGain = ctx.createGain();
      landingOsc.type = 'sine';
      landingOsc.frequency.setValueAtTime(140, now + 0.22);
      landingOsc.frequency.exponentialRampToValueAtTime(45, now + 0.38);

      landingGain.gain.setValueAtTime(0.2, now + 0.22);
      landingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      landingOsc.connect(landingGain);
      landingGain.connect(this.getDestination(ctx));
      landingOsc.start(now + 0.22);
      landingOsc.stop(now + 0.4);
    } catch {
      // Ignore
    }
  }

  /**
   * Midnight Zoomies Whoosh: Doppler rush sound effect.
   */
  public playZoomieWhoosh(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.linearRampToValueAtTime(680, now + 0.15);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.45);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.linearRampToValueAtTime(1800, now + 0.15);
      filter.frequency.exponentialRampToValueAtTime(400, now + 0.45);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getDestination(ctx));

      osc.start(now);
      osc.stop(now + 0.48);
    } catch {
      // Ignore
    }
  }

  /**
   * Tongue Blep / Groom Slurp: Tiny playful wet chirp.
   */
  public playSlurp(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.linearRampToValueAtTime(620, now + 0.05);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.12);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.getDestination(ctx));

      osc.start(now);
      osc.stop(now + 0.14);
    } catch {
      // Ignore
    }
  }

  /**
   * Singing Bowl Harmonic Resonance for Scholar / Zen Focus Mode.
   */
  public playSingingBowl(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const freqs = [432, 864, 1296]; // Pure harmonic Pythagorean tuning

      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        const initialVol = idx === 0 ? 0.22 : idx === 1 ? 0.11 : 0.05;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(initialVol, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + 2.2);

        osc.connect(gain);
        gain.connect(this.getDestination(ctx));

        osc.start(now);
        osc.stop(now + 2.3);
      });
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

