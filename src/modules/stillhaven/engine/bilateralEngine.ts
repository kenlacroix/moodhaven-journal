/**
 * BilateralEngine — Web Audio API bilateral stimulation engine.
 *
 * Audio graph: Oscillator(sine) → BiquadFilter(lowpass 800Hz) →
 *              EnvelopeGain → StereoPanner → MasterGain → destination
 *
 * Timing: lookahead scheduler (Chris Wilson pattern). setInterval(25ms)
 * pre-schedules pan + gain events 100ms ahead via AudioParam automation,
 * so UI-thread jitter never reaches the audio clock.
 *
 * Lifecycle rules (D3):
 *   - AudioContext created lazily in start() — MUST be called inside a
 *     synchronous user-gesture handler so resume() succeeds on all browsers.
 *   - visibilitychange: pauses scheduler on hidden; resumes or emits pause
 *     event on visible depending on AudioContext state.
 *   - statechange: emits pause event when AudioContext suspends mid-session.
 */

export type Side = 'L' | 'R';

export interface BilateralEvent {
  side: Side;
  t: number; // AudioContext.currentTime of the beat
}

export interface EngineConfig {
  speedHz: number;    // 0.5–2.0; default 1.0 (1 L + 1 R per second)
  toneHz: number;     // sine frequency; default 200
  volumeDb: number;   // master gain in dBFS; default -18
  envelopeMs: number; // attack/release ramp; default 30
}

export const ENGINE_DEFAULTS: EngineConfig = {
  speedHz: 1.0,
  toneHz: 200,
  volumeDb: -18,
  envelopeMs: 30,
};

const LOOKAHEAD_S = 0.1;        // pre-schedule 100ms ahead
const SCHEDULE_INTERVAL_MS = 25; // scheduler fires every 25ms
const STARTUP_OFFSET_S = 0.05;   // small gap before first beat

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export class BilateralEngine {
  private cfg: EngineConfig;

  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private envGain: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private masterGain: GainNode | null = null;

  private scheduleTimer: ReturnType<typeof setInterval> | null = null;
  private nextBeatTime = 0;
  private nextSide: Side = 'L';

  private _isRunning = false;

  private tickHandlers = new Set<(e: BilateralEvent) => void>();
  private pauseHandlers = new Set<() => void>();

  // Bound so they can be removed
  private readonly _onVisibility: () => void;
  private readonly _onStateChange: () => void;

  constructor(config: Partial<EngineConfig> = {}) {
    this.cfg = { ...ENGINE_DEFAULTS, ...config };

    this._onVisibility = () => {
      if (!this.ctx) return;
      if (document.hidden) {
        this._pauseScheduler();
      } else if (this._isRunning) {
        if (this.ctx.state === 'running') {
          this._resumeScheduler();
        } else {
          this._emitPause();
        }
      }
    };

    this._onStateChange = () => {
      if (!this.ctx || !this._isRunning) return;
      const s = this.ctx.state;
      if (s === 'suspended' || (s as string) === 'interrupted') {
        this._emitPause();
      }
    };
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Call synchronously inside a user-gesture handler. */
  start(): void {
    if (this._isRunning) return;

    if (!this.ctx) {
      this.ctx = new AudioContext();
      this._buildGraph();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this._isRunning = true;
    this.nextSide = 'L';
    this.nextBeatTime = this.ctx.currentTime + STARTUP_OFFSET_S;

    document.addEventListener('visibilitychange', this._onVisibility);
    this.ctx.addEventListener('statechange', this._onStateChange);

    this._startScheduler();
  }

  stop(): void {
    if (!this._isRunning && !this.ctx) return;
    this._isRunning = false;
    this._stopScheduler();
    document.removeEventListener('visibilitychange', this._onVisibility);
    if (this.ctx) {
      this.ctx.removeEventListener('statechange', this._onStateChange);
      void this.ctx.suspend();
    }
  }

  /** Call synchronously inside a user-gesture handler (tap-to-resume button). */
  resume(): void {
    if (!this.ctx || !this._isRunning) return;
    void this.ctx.resume().then(() => {
      this.nextBeatTime = this.ctx!.currentTime + STARTUP_OFFSET_S;
      this._startScheduler();
    });
  }

  setSpeed(hz: number): void {
    this.cfg = { ...this.cfg, speedHz: Math.max(0.5, Math.min(2.0, hz)) };
  }

  setVolume(db: number): void {
    this.cfg = { ...this.cfg, volumeDb: db };
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        dbToLinear(db),
        this.ctx.currentTime,
        0.01,
      );
    }
  }

  /** Subscribe to per-beat UI tick events. Returns an unsubscribe function. */
  onTick(handler: (e: BilateralEvent) => void): () => void {
    this.tickHandlers.add(handler);
    return () => this.tickHandlers.delete(handler);
  }

  /** Subscribe to pause events (AudioContext suspended mid-session). */
  onPause(handler: () => void): () => void {
    this.pauseHandlers.add(handler);
    return () => this.pauseHandlers.delete(handler);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private _buildGraph(): void {
    const ctx = this.ctx!;

    this.osc = ctx.createOscillator();
    this.osc.type = 'sine';
    this.osc.frequency.value = this.cfg.toneHz;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 800;
    this.filter.Q.value = 0.5;

    this.envGain = ctx.createGain();
    this.envGain.gain.value = 0;

    this.panner = ctx.createStereoPanner();
    this.panner.pan.value = 0;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = dbToLinear(this.cfg.volumeDb);

    this.osc.connect(this.filter);
    this.filter.connect(this.envGain);
    this.envGain.connect(this.panner);
    this.panner.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    this.osc.start();
  }

  private _startScheduler(): void {
    if (this.scheduleTimer !== null) return;
    this._schedule();
    this.scheduleTimer = setInterval(() => this._schedule(), SCHEDULE_INTERVAL_MS);
  }

  private _stopScheduler(): void {
    if (this.scheduleTimer !== null) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

  private _pauseScheduler(): void {
    this._stopScheduler();
  }

  private _resumeScheduler(): void {
    if (!this.ctx) return;
    this.nextBeatTime = this.ctx.currentTime + STARTUP_OFFSET_S;
    this._startScheduler();
  }

  private _schedule(): void {
    const ctx = this.ctx;
    const envGain = this.envGain;
    const panner = this.panner;
    if (!ctx || !envGain || !panner) return;

    const { speedHz, envelopeMs, volumeDb } = this.cfg;
    const beatPeriod = 1 / (2 * speedHz);
    const envS = envelopeMs / 1000;
    const peak = dbToLinear(volumeDb);
    const horizon = ctx.currentTime + LOOKAHEAD_S;

    while (this.nextBeatTime < horizon) {
      const t = this.nextBeatTime;
      const side = this.nextSide;

      // Pan: hard left (-1) or hard right (+1), set at beat start
      panner.pan.setValueAtTime(side === 'L' ? -1 : 1, t);

      // Gain envelope: 0 → peak (attack) → peak (sustain) → 0 (release)
      envGain.gain.setValueAtTime(0, t);
      envGain.gain.linearRampToValueAtTime(peak, t + envS);

      const sustainEnd = t + beatPeriod - envS;
      if (sustainEnd > t + envS) {
        envGain.gain.setValueAtTime(peak, sustainEnd);
      }
      envGain.gain.linearRampToValueAtTime(0, t + beatPeriod);

      // Notify UI thread at beat time (approximate)
      const delayMs = Math.max(0, (t - ctx.currentTime) * 1000);
      const ev: BilateralEvent = { side, t };
      setTimeout(() => {
        if (!this._isRunning) return;
        this.tickHandlers.forEach((h) => h(ev));
      }, delayMs);

      this.nextBeatTime += beatPeriod;
      this.nextSide = side === 'L' ? 'R' : 'L';
    }
  }

  private _emitPause(): void {
    this._pauseScheduler();
    this.pauseHandlers.forEach((h) => h());
  }
}
