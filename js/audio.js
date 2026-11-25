// audio.js — Web Audio sound engine. Every sound is synthesised live; there
// are no audio files. Each channel builds its nodes when switched on and
// tears them down (after a short fade) when switched off, so idle channels
// cost no CPU. Noise buffers are generated once and looped.

const rand = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Static description of each channel (UI reads this too). */
export const CHANNELS = [
  { id: 'rain', label: 'Rain', base: 0.55 },
  { id: 'wind', label: 'Wind', base: 0.5 },
  { id: 'fire', label: 'Fireplace', base: 0.6 },
  { id: 'cafe', label: 'Café murmur', base: 0.55 },
  { id: 'brown', label: 'Brown noise', base: 0.4 },
  { id: 'lofi', label: 'Lo-fi pad', base: 0.35 },
];

export const PRESETS = [
  { id: 'library', label: 'Rainy library', mix: { rain: 0.6, cafe: 0.2, brown: 0.12 } },
  { id: 'cabin', label: 'Cosy cabin', mix: { fire: 0.7, rain: 0.35, wind: 0.2, lofi: 0.3 } },
  { id: 'deep', label: 'Deep focus', mix: { brown: 0.6, lofi: 0.35 } },
  { id: 'cafe', label: 'Café study', mix: { cafe: 0.6, lofi: 0.4, rain: 0.2 } },
];

export class SoundEngine {
  constructor() {
    this.AC = window.AudioContext || window.webkitAudioContext;
    this.supported = !!this.AC;
    this.ctx = null;
    this.master = null;
    this.masterVol = 0.7;
    this.muted = false;
    this.buffers = null;
    // Desired state, kept even before the AudioContext exists.
    this.state = Object.fromEntries(CHANNELS.map((c) => [c.id, { on: false, vol: 0.5 }]));
    this.live = {}; // id -> running channel handle
  }

  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  /** Create / resume the context. Must be called from a user gesture. */
  ensure() {
    if (!this.supported) return false;
    if (!this.ctx) {
      try {
        this.ctx = new this.AC();
      } catch {
        this.supported = false;
        return false;
      }
      const comp = this.ctx.createDynamicsCompressor(); // keeps layered sounds from clipping
      this.master = this.ctx.createGain();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.buffers = this.makeBuffers();
      this.applyMaster(true);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    for (const c of CHANNELS) this.sync(c.id);
    return true;
  }

  // ---------- noise buffers (generated once) ----------
  makeBuffers() {
    const sr = this.ctx.sampleRate;
    const len = sr * 4;
    const make = (fn) => {
      const buf = this.ctx.createBuffer(1, len, sr);
      fn(buf.getChannelData(0));
      return buf;
    };
    const white = make((d) => { for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; });
    const pink = make((d) => { // Paul Kellet's economical pink-noise filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    });
    const brown = make((d) => { // integrated white noise
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    });
    return { white, pink, brown };
  }

  // ---------- public controls ----------
  setChannel(id, patch) {
    Object.assign(this.state[id], patch);
    if (this.state[id].on) this.ensure(); // toggling is a user gesture: create/resume + sync
    else this.sync(id);
  }

  applyPreset(mix) {
    for (const c of CHANNELS) {
      const vol = mix[c.id];
      this.state[c.id] = { on: vol !== undefined, vol: vol !== undefined ? vol : this.state[c.id].vol };
    }
    if (Object.values(this.state).some((s) => s.on) && !this.ctx) this.ensure();
    else for (const c of CHANNELS) this.sync(c.id);
  }

  setMaster(v) { this.masterVol = v; this.applyMaster(); }
  setMuted(m) { this.muted = m; this.applyMaster(); }

  applyMaster(instant = false) {
    if (!this.master) return;
    const target = this.muted ? 0 : this.masterVol * this.masterVol;
    const t = this.ctx.currentTime;
    if (instant) this.master.gain.setValueAtTime(target, t);
    else this.master.gain.setTargetAtTime(target, t, 0.05);
  }

  /** Make the live graph match this.state for one channel. */
  sync(id) {
    if (!this.ctx) return;
    const want = this.state[id];
    const def = CHANNELS.find((c) => c.id === id);
    let ch = this.live[id];
    if (want.on) {
      if (ch && ch.fading) { ch.cleanup(); ch = null; }
      if (!ch) {
        const out = this.ctx.createGain();
        out.gain.value = 0;
        out.connect(this.master);
        const handle = BUILDERS[id](this.ctx, out, this.buffers);
        ch = this.live[id] = { out, ...handle, fading: false };
        ch.cleanup = () => { handle.stop(); out.disconnect(); if (this.live[id] === ch) delete this.live[id]; clearTimeout(ch.timer); };
      }
      ch.out.gain.setTargetAtTime(def.base * Math.pow(want.vol, 1.5), this.ctx.currentTime, 0.12);
    } else if (ch && !ch.fading) {
      ch.fading = true;
      ch.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      ch.timer = setTimeout(() => ch.cleanup(), 900);
    }
  }

  /** Soft end-of-session chime (three sine bells). */
  chime() {
    if (!this.ensure() || this.muted) return;
    const t0 = this.ctx.currentTime + 0.05;
    [659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = t0 + i * 0.22;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 1.8);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 1.9);
    });
  }
}

// ---------- channel builders ----------
// Each takes (ctx, out, buffers) and returns { stop() } that cancels timers
// and stops oscillators/sources. Nodes are garbage-collected after stop.

function loopSrc(ctx, buffer) {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.start(0, Math.random() * buffer.duration); // random start so layers don't phase-lock
  return s;
}

function biquad(ctx, type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** Fire a short filtered noise burst — the basis of rain drops and fire crackles. */
function burst(ctx, out, buffer, { freq, q, peak, decay, hp }) {
  const t = ctx.currentTime;
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  const f = biquad(ctx, hp ? 'highpass' : 'bandpass', freq, q);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  let tail = g;
  s.connect(f); f.connect(g);
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = rand(-0.8, 0.8);
    g.connect(p);
    tail = p;
  }
  tail.connect(out);
  s.start(t, rand(0, 3), decay + 0.02);
}

const BUILDERS = {
  rain(ctx, out, b) {
    const wash = loopSrc(ctx, b.white);
    const hp = biquad(ctx, 'highpass', 500);
    const lp = biquad(ctx, 'lowpass', 8500);
    const g = ctx.createGain();
    g.gain.value = 0.45;
    wash.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out);
    let timer, dead = false;
    const drop = () => {
      if (dead) return;
      burst(ctx, out, b.white, { freq: rand(1500, 5500), q: 3, peak: rand(0.05, 0.22), decay: rand(0.03, 0.07) });
      timer = setTimeout(drop, rand(45, 170));
    };
    drop();
    return { stop() { dead = true; clearTimeout(timer); wash.stop(); } };
  },

  wind(ctx, out, b) {
    const src = loopSrc(ctx, b.pink);
    const bp = biquad(ctx, 'bandpass', 450, 0.6);
    const g = ctx.createGain();
    g.gain.value = 0.7;
    src.connect(bp); bp.connect(g); g.connect(out);
    // Two slow LFOs: one sweeps the filter, one gusts the volume.
    const l1 = ctx.createOscillator(); l1.frequency.value = 0.07;
    const l1g = ctx.createGain(); l1g.gain.value = 280;
    l1.connect(l1g); l1g.connect(bp.frequency);
    const l2 = ctx.createOscillator(); l2.frequency.value = 0.13;
    const l2g = ctx.createGain(); l2g.gain.value = 0.35;
    l2.connect(l2g); l2g.connect(g.gain);
    l1.start(); l2.start();
    return { stop() { src.stop(); l1.stop(); l2.stop(); } };
  },

  fire(ctx, out, b) {
    const rumble = loopSrc(ctx, b.brown);
    const lp = biquad(ctx, 'lowpass', 420);
    const g = ctx.createGain();
    g.gain.value = 1.1;
    rumble.connect(lp); lp.connect(g); g.connect(out);
    const hiss = loopSrc(ctx, b.white);
    const hb = biquad(ctx, 'bandpass', 3200, 0.5);
    const hg = ctx.createGain();
    hg.gain.value = 0.03;
    hiss.connect(hb); hb.connect(hg); hg.connect(out);
    let timer, dead = false;
    const pop = () => {
      if (dead) return;
      const n = Math.random() < 0.25 ? 3 : 1; // occasional small cluster
      for (let i = 0; i < n; i++) {
        setTimeout(() => !dead && burst(ctx, out, b.white, {
          freq: rand(900, 2600), q: 1, hp: true, peak: rand(0.1, 0.5), decay: rand(0.01, 0.06),
        }), i * rand(10, 60));
      }
      timer = setTimeout(pop, rand(90, 800));
    };
    pop();
    return { stop() { dead = true; clearTimeout(timer); rumble.stop(); hiss.stop(); } };
  },

  cafe(ctx, out, b) {
    // Soft "chatter": several band-limited noise layers whose loudness
    // wanders at random, which our ear reads as distant conversation.
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const lp = biquad(ctx, 'lowpass', 2600);
    master.connect(lp); lp.connect(out);
    const layers = [380, 700, 1150, 1700].map((f) => {
      const s = loopSrc(ctx, b.pink);
      const bp = biquad(ctx, 'bandpass', f * rand(0.95, 1.05), 1.4);
      s.detune.value = rand(-200, 200);
      const g = ctx.createGain();
      g.gain.value = rand(0.2, 0.8);
      s.connect(bp); bp.connect(g); g.connect(master);
      return { s, g };
    });
    const wander = () => layers.forEach(({ g }) => g.gain.setTargetAtTime(rand(0.08, 1), ctx.currentTime, 0.3));
    const iv = setInterval(wander, 700);
    return { stop() { clearInterval(iv); layers.forEach(({ s }) => s.stop()); } };
  },

  brown(ctx, out, b) {
    const s = loopSrc(ctx, b.brown);
    const lp = biquad(ctx, 'lowpass', 1000);
    s.connect(lp); lp.connect(out);
    return { stop() { s.stop(); } };
  },

  lofi(ctx, out) {
    // A slow, gentle four-chord loop (Cmaj7 – Am7 – Fmaj7 – G6) of detuned
    // triangle voices through a low-pass, with the occasional soft bell note.
    const chords = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 52]];
    const scale = [72, 74, 76, 79, 81, 84]; // C major pentatonic fits every chord
    const lp = biquad(ctx, 'lowpass', 1000, 0.5);
    const wob = ctx.createOscillator(); wob.frequency.value = 0.06;
    const wobG = ctx.createGain(); wobG.gain.value = 250;
    wob.connect(wobG); wobG.connect(lp.frequency); wob.start();
    lp.connect(out);
    const CH = 7; // seconds per chord
    let i = 0, timer, dead = false;
    const voices = new Set();

    const voice = (freq, t, dur, peak, type) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = rand(-8, 8);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 1.8);
      g.gain.setValueAtTime(peak, t + dur - 0.6);
      g.gain.linearRampToValueAtTime(0, t + dur + 2);
      o.connect(g); g.connect(lp);
      o.start(t); o.stop(t + dur + 2.1);
      voices.add(o);
      o.onended = () => voices.delete(o);
    };
    const bell = (m, t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = mtof(m);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 2.2);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + 2.3);
      voices.add(o);
      o.onended = () => voices.delete(o);
    };
    const next = () => {
      if (dead) return;
      const t = ctx.currentTime + 0.05;
      chords[i % chords.length].forEach((m) => {
        voice(mtof(m), t, CH, 0.06, 'triangle');
        voice(mtof(m) * 1.003, t, CH, 0.03, 'sine');
      });
      voice(mtof(chords[i % chords.length][0] - 12), t, CH, 0.08, 'sine'); // bass root
      const notes = Math.floor(rand(1, 3.5));
      for (let n = 0; n < notes; n++) bell(scale[Math.floor(Math.random() * scale.length)], t + rand(1.5, CH - 1));
      i++;
      timer = setTimeout(next, CH * 1000 - 200);
    };
    next();
    return { stop() { dead = true; clearTimeout(timer); wob.stop(); voices.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } }); } };
  },
};
