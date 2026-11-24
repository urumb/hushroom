// timer.js — Pomodoro-style timer.
// Accuracy note: we never count ticks. While running we store the absolute
// end time (`endAt`) and compute "time left = endAt - Date.now()" on every
// tick, so throttled background tabs can't make the timer drift.

import { load, save } from './storage.js';

export const MODES = {
  focus: { label: 'Focus' },
  short: { label: 'Short break' },
  long: { label: 'Long break' },
};

export const DEFAULTS = { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, notify: false };

const LIMITS = { focus: [1, 180], short: [1, 60], long: [1, 90], longEvery: [2, 12] };

function sanitize(s) {
  const out = { ...DEFAULTS, ...s };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const n = Math.round(Number(out[k]));
    out[k] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : DEFAULTS[k];
  }
  out.autoStart = !!out.autoStart;
  out.notify = !!out.notify;
  return out;
}

export class Timer {
  /**
   * @param {{onUpdate:(t:Timer)=>void, onComplete:(mode:string, minutes:number)=>void}} callbacks
   */
  constructor(callbacks) {
    this.cb = callbacks;
    this.settings = sanitize(load('settings', {}));
    this.cycle = Math.max(0, Math.floor(Number(load('cycle', 0))) || 0); // focus sessions completed
    this.mode = 'focus';
    this.running = false;
    this.endAt = 0;
    this.remaining = this.total;
    this.interval = null;
    // Re-check immediately when the tab becomes visible again.
    document.addEventListener('visibilitychange', () => this.tick());
  }

  get total() { return this.settings[this.mode] * 60000; }
  get timeLeft() { return this.running ? Math.max(0, this.endAt - Date.now()) : this.remaining; }
  /** 0 → just started, 1 → finished */
  get progress() { return 1 - this.timeLeft / this.total; }
  /** How many dots to fill in the "sessions until long break" indicator. */
  get dotsFilled() { return this.mode === 'long' ? this.settings.longEvery : this.cycle % this.settings.longEvery; }

  emit() { this.cb.onUpdate(this); }

  start() {
    if (this.running) return;
    if (this.remaining <= 0) this.remaining = this.total;
    this.endAt = Date.now() + this.remaining;
    this.running = true;
    this.interval = setInterval(() => this.tick(), 200);
    this.emit();
  }

  pause() {
    if (!this.running) return;
    this.remaining = Math.max(0, this.endAt - Date.now());
    this.running = false;
    clearInterval(this.interval);
    this.emit();
  }

  toggle() { this.running ? this.pause() : this.start(); }

  reset() {
    this.pause();
    this.remaining = this.total;
    this.emit();
  }

  setMode(mode, autoStart = false) {
    this.pause();
    this.mode = mode;
    this.remaining = this.total;
    this.emit();
    if (autoStart) this.start();
  }

  /** Jump to the next phase without counting it as completed. */
  skip() {
    const wasRunning = this.running;
    this.setMode(this.mode === 'focus' ? 'short' : 'focus', wasRunning);
  }

  tick() {
    if (!this.running) return;
    if (this.endAt - Date.now() <= 0) this.finish();
    else this.emit();
  }

  finish() {
    const done = this.mode;
    this.running = false;
    clearInterval(this.interval);
    this.cb.onComplete(done, this.settings[done]);
    let next = 'focus';
    if (done === 'focus') {
      this.cycle += 1;
      save('cycle', this.cycle);
      next = this.cycle % this.settings.longEvery === 0 ? 'long' : 'short';
    }
    this.mode = next;
    this.remaining = this.total;
    this.emit();
    if (this.settings.autoStart) this.start();
  }

  applySettings(partial) {
    const oldTotal = this.total;
    this.settings = sanitize({ ...this.settings, ...partial });
    save('settings', this.settings);
    // Only reset the display if the user hasn't started this phase yet.
    if (!this.running && this.remaining === oldTotal) this.remaining = this.total;
    this.emit();
  }
}
