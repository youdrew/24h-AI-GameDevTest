// Tile Explorer — Web Audio synthesis + BGM + ducking
// Synthesizes all SFX procedurally; loads BGM/win/fail from assets/sounds/ as
// decoded buffers. All SFX parameters live in js/sfx-config.js (editable);
// SFX_FALLBACK below is a hardcoded "保险" copy used when a user-edited
// field in the config table is missing or has the wrong type.

import { CONFIG, encodeAssetPath } from './config.js';
import { storage } from './storage.js';
import { SFX, COMBO_CHORDS } from './sfx-config.js';

// ─────────────────────────────────────────────────────────────────────────────
// SFX_FALLBACK — internal "原始默认" snapshot. Mirrors sfx-config.js verbatim;
// the resolve() helper below pulls a field from here whenever the user-editable
// config value is missing or fails its type check, so a typo in sfx-config.js
// never silences the game. If you intentionally tune defaults in sfx-config.js
// and want the safety net to follow, update the corresponding field here too.
// ─────────────────────────────────────────────────────────────────────────────
const SFX_FALLBACK = {
  tap:    { wave: 'sine',     freqStart: 800,  freqEnd: 1200, slideTime: 0.04, attack: 0.003, decay: 0.06, peak: 0.25 },
  fly:    { wave: 'sine',     freqStart: 400,  freqEnd: 800,  slideTime: 0.18, attack: 0.005, decay: 0.18, peak: 0.18 },
  undo:   { wave: 'sine',     freqStart: 600,  freqEnd: 300,  slideTime: 0.18, attack: 0.005, decay: 0.18, peak: 0.18 },
  drop:   { wave: 'sine',     freqStart: 200,  freqEnd: 80,   slideTime: 0.10, attack: 0.005, decay: 0.12, peak: 0.30 },
  reveal: { wave: 'triangle', freqStart: 1320, freqEnd: 1760, slideTime: 0.06, attack: 0.005, decay: 0.10, peak: 0.08 },
  plainMatch: { wave: 'triangle', freq: 523.25, attack: 0.005, decay: 0.18, peak: 0.16 },
  warning: { wave: 'square', freq1: 880, freq2: 660, gap: 0.090, attack: 0.005, decay: 0.08, peak: 0.12 },
  shuffle: { wave: 'square', count: 6, freqMin: 400, freqMax: 1000, stagger: 0.030, attack: 0.002, decay: 0.04, peak: 0.12 },
  hint:   { wave: 'sine',     freqs: [880, 1320, 1760],            stagger: 0.06, attack: 0.01, decay: 0.40, peak: 0.12 },
  freeze: { wave: 'triangle', freqs: [1760, 1480, 1320, 880],      stagger: 0.04, attack: 0.01, decay: 0.35, peak: 0.15 },
  reward: { wave: 'triangle', freqs: [659.25, 783.99, 1046.5, 1318.5], stagger: 0.06, attack: 0.01, decay: 0.30, peak: 0.18 },
  lightning: {
    noiseDuration: 0.50, noiseLowpass: 600, noisePeak: 0.25,
    sawFreqStart: 2000, sawFreqEnd: 200, sawDuration: 0.40,
    sawAttack: 0.02, sawDecay: 0.43, sawTotal: 0.50, sawPeak: 0.18
  },
  bomb:    { file: 'assets/sounds/bomb.wav' },
  win:     { file: 'assets/sounds/win.wav' },
  fail:    { file: 'assets/sounds/failure.wav' },
  itemUse: { file: 'assets/sounds/SoundofUsingItems.wav' }
};

const COMBO_CHORDS_FALLBACK = [
  { freqs: [523.25, 659.25, 783.99],             wave: 'triangle', peak: 0.18 },
  { freqs: [587.33, 698.46, 880.00],             wave: 'triangle', peak: 0.18 },
  { freqs: [659.25, 783.99, 987.77],             wave: 'triangle', peak: 0.19 },
  { freqs: [698.46, 880.00, 1046.50],            wave: 'triangle', peak: 0.19 },
  { freqs: [783.99, 987.77, 1174.66],            wave: 'triangle', peak: 0.20 },
  { freqs: [880.00, 1046.50, 1318.51],           wave: 'sawtooth', peak: 0.16 },
  { freqs: [987.77, 1174.66, 1479.98],           wave: 'sawtooth', peak: 0.16 },
  { freqs: [1046.50, 1318.51, 1567.98],          wave: 'sawtooth', peak: 0.17 },
  { freqs: [1174.66, 1396.91, 1760.00],          wave: 'sawtooth', peak: 0.17 },
  { freqs: [1318.51, 1567.98, 1975.53, 2637.02], wave: 'sawtooth', peak: 0.18 }
];

// Field-level fallback helpers. resolve(name) returns a fully-populated object
// where every field is either the user's valid value or the fallback default.
function num(v, fb) { return (typeof v === 'number' && Number.isFinite(v)) ? v : fb; }
function str(v, fb) { return (typeof v === 'string' && v.length > 0) ? v : fb; }
function freqArr(v, fb) {
  if (!Array.isArray(v) || v.length === 0) return fb;
  return v.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0) ? v : fb;
}

function resolve(name) {
  const user = (SFX && SFX[name]) || {};
  const fb = SFX_FALLBACK[name] || {};
  const out = {};
  for (const k of Object.keys(fb)) {
    const fv = fb[k];
    const uv = user[k];
    if (typeof fv === 'number')        out[k] = num(uv, fv);
    else if (typeof fv === 'string')   out[k] = str(uv, fv);
    else if (Array.isArray(fv))        out[k] = freqArr(uv, fv);
    else                               out[k] = (uv !== undefined ? uv : fv);
  }
  return out;
}

function resolveChord(idx) {
  const list = Array.isArray(COMBO_CHORDS) ? COMBO_CHORDS : COMBO_CHORDS_FALLBACK;
  const user = list[idx] || {};
  const fb = COMBO_CHORDS_FALLBACK[idx] || COMBO_CHORDS_FALLBACK[COMBO_CHORDS_FALLBACK.length - 1];
  return {
    freqs: freqArr(user.freqs, fb.freqs),
    wave:  str(user.wave, fb.wave),
    peak:  num(user.peak, fb.peak)
  };
}

const COMBO_LIST_LEN = (Array.isArray(COMBO_CHORDS) ? COMBO_CHORDS.length : 0) || COMBO_CHORDS_FALLBACK.length;

// File buffers are keyed by short name; map each to its config slot so the
// loader respects user-overridden paths from sfx-config.js.
const FILE_TO_CONFIG = { win: 'win', fail: 'fail', item: 'itemUse', bomb: 'bomb' };

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.duckGain = null;          // applied to musicGain to duck during SFX
    this.buffers = {};             // decoded file samples
    this.bgmSource = null;         // AudioBufferSourceNode for BGM (looping)
    this.unlocked = false;
    this.duckTimer = null;
    this.pendingBgmStart = false;
    this.currentBgmUrl = null;     // raw (un-encoded) URL of current theme BGM
    this.bgmCache = new Map();     // url → AudioBuffer
  }

  // Browsers require a user gesture before resuming AudioContext
  async unlock() {
    if (this.unlocked) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = storage.state.settings.soundEnabled ? CONFIG.SFX_VOLUME : 0;
      this.sfxGain.connect(this.master);

      this.duckGain = this.ctx.createGain();
      this.duckGain.gain.value = 1;
      this.duckGain.connect(this.master);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = storage.state.settings.musicEnabled ? CONFIG.BGM_VOLUME : 0;
      this.musicGain.connect(this.duckGain);

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this.unlocked = true;
      // Eager-load the small file SFX (win/fail/item/bomb) in background. BGM
      // is loaded lazily on the first setTheme() — see _playBgmUrl().
      this._preloadFiles();
      if (this.pendingBgmStart && storage.state.settings.musicEnabled) {
        this.startBgm();
      }
    } catch (err) {
      console.warn('[audio] unlock failed', err);
    }
  }

  _preloadFiles() {
    for (const key of Object.keys(FILE_TO_CONFIG)) {
      const c = resolve(FILE_TO_CONFIG[key]);
      this._loadBuffer(key, c.file);
    }
  }

  async _loadBuffer(key, url) {
    if (this.buffers[key]) return this.buffers[key];
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(arr);
      this.buffers[key] = buf;
      return buf;
    } catch (err) {
      console.warn(`[audio] failed to load ${key} (${url})`, err);
      return null;
    }
  }

  setSfxEnabled(enabled) {
    storage.setSetting('soundEnabled', enabled);
    if (this.sfxGain) {
      this.sfxGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.sfxGain.gain.linearRampToValueAtTime(enabled ? CONFIG.SFX_VOLUME : 0, this.ctx.currentTime + 0.08);
    }
  }

  setMusicEnabled(enabled) {
    storage.setSetting('musicEnabled', enabled);
    if (this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.linearRampToValueAtTime(enabled ? CONFIG.BGM_VOLUME : 0, this.ctx.currentTime + 0.15);
    }
    if (enabled && this.unlocked) this.startBgm();
    else this.stopBgm();
  }

  // ---- Ducking --------------------------------------------------------------

  _duck() {
    if (!this.duckGain) return;
    const factor = Math.pow(10, CONFIG.DUCK_DB / 20); // -6dB ≈ 0.5
    const t = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.linearRampToValueAtTime(factor, t + 0.02);
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => {
      const t2 = this.ctx.currentTime;
      this.duckGain.gain.cancelScheduledValues(t2);
      this.duckGain.gain.linearRampToValueAtTime(1, t2 + 0.12);
    }, CONFIG.DUCK_RESTORE_MS);
  }

  // ---- BGM ------------------------------------------------------------------

  // Switch the BGM track to the given theme. Loads the file once (cached),
  // stops the current track, and starts the new one (if music is enabled and
  // audio is unlocked). Safe to call before unlock — we'll resume on unlock.
  async setTheme(theme) {
    if (!theme || !theme.bgm) return;
    if (this.currentBgmUrl === theme.bgm && this.bgmSource) return;
    this.currentBgmUrl = theme.bgm;
    if (!this.unlocked) {
      this.pendingBgmStart = true;
      return;
    }
    if (!storage.state.settings.musicEnabled) {
      // Stash for later; toggling music on will pick this up.
      return;
    }
    await this._playBgmUrl(theme.bgm);
  }

  async startBgm() {
    if (!this.unlocked) {
      this.pendingBgmStart = true;
      return;
    }
    if (!storage.state.settings.musicEnabled) return;
    if (!this.currentBgmUrl) return;          // no theme set yet
    if (this.bgmSource) return;               // already playing
    await this._playBgmUrl(this.currentBgmUrl);
  }

  async _playBgmUrl(url) {
    let buf = this.bgmCache.get(url);
    if (!buf) {
      try {
        const res = await fetch(encodeAssetPath(url));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arr = await res.arrayBuffer();
        buf = await this.ctx.decodeAudioData(arr);
        this.bgmCache.set(url, buf);
      } catch (err) {
        console.warn('[audio] bgm load failed', url, err);
        return;
      }
    }
    // Replace current source
    this.stopBgm();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.musicGain);
    src.start(0);
    this.bgmSource = src;
  }

  stopBgm() {
    if (this.bgmSource) {
      try { this.bgmSource.stop(); } catch {}
      this.bgmSource = null;
    }
  }

  // ---- File-based SFX (win / fail / item) -----------------------------------

  playFile(key) {
    if (!this.unlocked || !storage.state.settings.soundEnabled) return;
    const buf = this.buffers[key];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxGain);
    src.start(0);
    this._duck();
  }

  // ---- Procedural SFX -------------------------------------------------------

  _envelope(node, peak, attack, decay) {
    const t = this.ctx.currentTime;
    const g = node.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _osc({ type = 'sine', freq, peak = 0.4, attack = 0.005, decay = 0.18, slideTo = null, slideTime = 0.05 }) {
    if (!this.unlocked || !storage.state.settings.soundEnabled) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo !== null) {
      o.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + slideTime);
    }
    o.connect(g);
    g.connect(this.sfxGain);
    this._envelope(g, peak, attack, decay);
    o.start();
    o.stop(this.ctx.currentTime + attack + decay + 0.02);
  }

  // Render a "slide" SFX (single oscillator with optional pitch slide).
  _playSlideFromConfig(name) {
    const c = resolve(name);
    this._osc({
      type: c.wave,
      freq: c.freqStart,
      slideTo: c.freqEnd,
      slideTime: c.slideTime,
      attack: c.attack,
      decay: c.decay,
      peak: c.peak
    });
  }

  // Render a chime (a sequence of single notes with a constant stagger).
  _playChimeFromConfig(name) {
    if (!this.unlocked || !storage.state.settings.soundEnabled) return;
    const c = resolve(name);
    const t0 = this.ctx.currentTime;
    c.freqs.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = c.wave;
      o.frequency.value = f;
      o.connect(g); g.connect(this.sfxGain);
      const start = t0 + i * c.stagger;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(c.peak, start + c.attack);
      g.gain.exponentialRampToValueAtTime(0.0001, start + c.attack + c.decay);
      o.start(start);
      o.stop(start + c.attack + c.decay + 0.02);
    });
  }

  // Tap: short rising tone. Per sfx-config.js → tap.
  tap() {
    this._playSlideFromConfig('tap');
    this._duck();
  }

  // Fly-to-slot: rising tone. Per sfx-config.js → fly.
  fly() {
    this._playSlideFromConfig('fly');
    this._duck();
  }

  // Match (3-tile clear). comboLevel 0 plays a soft single note (plainMatch);
  // 1..N looks up COMBO_CHORDS for a richer chord.
  match(comboLevel = 0) {
    if (!this.unlocked || !storage.state.settings.soundEnabled) return;
    const t0 = this.ctx.currentTime;
    if (comboLevel <= 0) {
      const c = resolve('plainMatch');
      this._osc({ type: c.wave, freq: c.freq, attack: c.attack, decay: c.decay, peak: c.peak });
      this._duck();
      return;
    }
    const idx = Math.min(COMBO_LIST_LEN - 1, comboLevel - 1);
    const chord = resolveChord(idx);
    chord.freqs.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = chord.wave;
      o.frequency.value = f;
      o.connect(g);
      g.connect(this.sfxGain);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(chord.peak, t0 + 0.005 + i * 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      o.start(t0);
      o.stop(t0 + 0.48);
    });
    this._duck();
  }

  // Lightning: noise burst + saw sweep. Per sfx-config.js → lightning.
  lightning() {
    if (!this.unlocked || !storage.state.settings.soundEnabled) return;
    const c = resolve('lightning');
    const t0 = this.ctx.currentTime;

    // Noise burst (thunder)
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * c.noiseDuration));
    const noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.4);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = c.noiseLowpass;
    const ng = this.ctx.createGain();
    ng.gain.value = c.noisePeak;
    noise.connect(lp); lp.connect(ng); ng.connect(this.sfxGain);
    noise.start(t0);

    // Saw sweep (zap)
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(c.sawFreqStart, t0);
    o.frequency.exponentialRampToValueAtTime(c.sawFreqEnd, t0 + c.sawDuration);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0, t0);
    og.gain.linearRampToValueAtTime(c.sawPeak, t0 + c.sawAttack);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + c.sawAttack + c.sawDecay);
    o.connect(og); og.connect(this.sfxGain);
    o.start(t0); o.stop(t0 + c.sawTotal);
    this._duck();
  }

  // Slot warning: alternating two-tone beep. Per sfx-config.js → warning.
  warning() {
    const c = resolve('warning');
    this._osc({ type: c.wave, freq: c.freq1, attack: c.attack, decay: c.decay, peak: c.peak });
    setTimeout(() => {
      this._osc({ type: c.wave, freq: c.freq2, attack: c.attack, decay: c.decay, peak: c.peak });
    }, c.gap * 1000);
  }

  // Shuffle: rapid clicks. Per sfx-config.js → shuffle.
  shuffle() {
    if (!this.unlocked || !storage.state.settings.soundEnabled) return;
    const c = resolve('shuffle');
    const range = Math.max(1, c.freqMax - c.freqMin);
    for (let i = 0; i < c.count; i++) {
      setTimeout(() => this._osc({
        type: c.wave,
        freq: c.freqMin + Math.random() * range,
        attack: c.attack,
        decay: c.decay,
        peak: c.peak
      }), i * c.stagger * 1000);
    }
    this._duck();
  }

  // Undo: reverse pitch dive. Per sfx-config.js → undo.
  undo() {
    this._playSlideFromConfig('undo');
    this._duck();
  }

  // Hint: gentle chime. Per sfx-config.js → hint.
  hint() {
    this._playChimeFromConfig('hint');
    this._duck();
  }

  // Bomb: file-based explosion sample.
  bomb() {
    this.playFile('bomb');
  }

  // Freeze: shimmery descending tones. Per sfx-config.js → freeze.
  freeze() {
    this._playChimeFromConfig('freeze');
    this._duck();
  }

  // Drop: thump. Per sfx-config.js → drop.
  drop() {
    this._playSlideFromConfig('drop');
  }

  // Reveal: soft chime when a tile becomes uncovered. Per sfx-config.js → reveal.
  reveal() {
    this._playSlideFromConfig('reveal');
  }

  // Reward pickup. Per sfx-config.js → reward.
  reward() {
    this._playChimeFromConfig('reward');
    this._duck();
  }

  // Aliases for file-based effects
  win()  { this.playFile('win'); }
  fail() { this.playFile('fail'); }
  itemUse() { this.playFile('item'); }
}

export const audio = new AudioEngine();
