// Tile Explorer — Web Audio synthesis + BGM + ducking
// Synthesizes all SFX procedurally; loads BGM/win/fail from sound/ as decoded buffers.

import { CONFIG, encodeAssetPath } from './config.js';
import { storage } from './storage.js';

const FILE_SOURCES = {
  win:   'sound/win.wav',
  fail:  'sound/failure.wav',
  item:  'sound/SoundofUsingItems.wav',
  bomb:  'sound/bomb.wav'
};

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
      // Lazy-load BGM and SFX file buffers in background
      this._preloadFiles();
      if (this.pendingBgmStart && storage.state.settings.musicEnabled) {
        this.startBgm();
      }
    } catch (err) {
      console.warn('[audio] unlock failed', err);
    }
  }

  _preloadFiles() {
    for (const [key, url] of Object.entries(FILE_SOURCES)) {
      this._loadBuffer(key, url);
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

  // Tap: short rising sine 800→1200Hz
  tap() {
    this._osc({ type: 'sine', freq: 800, slideTo: 1200, slideTime: 0.04, attack: 0.003, decay: 0.06, peak: 0.25 });
    this._duck();
  }

  // Fly-to-slot: rising tone 400→800Hz, 200ms
  fly() {
    this._osc({ type: 'sine', freq: 400, slideTo: 800, slideTime: 0.18, attack: 0.005, decay: 0.18, peak: 0.18 });
    this._duck();
  }

  // Match (3-tile clear): C-E-G chord, comboLevel shifts up by N semitones (0,1,2,3)
  match(comboLevel = 0) {
    if (!this.unlocked || !storage.state.settings.soundEnabled) return;
    const semis = Math.min(3, Math.max(0, comboLevel - 1)); // x2→1, x3→2, x4→3
    const k = Math.pow(2, semis / 12);
    const base = [523.25, 659.25, 783.99]; // C5, E5, G5
    const t0 = this.ctx.currentTime;
    base.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f * k;
      o.connect(g);
      g.connect(this.sfxGain);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.18, t0 + 0.005 + i * 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.start(t0);
      o.stop(t0 + 0.45);
    });
    this._duck();
  }

  // Lightning (combo x5+ or meter release): noise burst + saw sweep
  lightning() {
    if (!this.unlocked || !storage.state.settings.soundEnabled) return;
    const t0 = this.ctx.currentTime;
    // Noise burst (thunder)
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.4);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.25;
    noise.connect(lp); lp.connect(ng); ng.connect(this.sfxGain);
    noise.start(t0);

    // Saw sweep (zap)
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(2000, t0);
    o.frequency.exponentialRampToValueAtTime(200, t0 + 0.4);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0, t0);
    og.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    o.connect(og); og.connect(this.sfxGain);
    o.start(t0); o.stop(t0 + 0.5);
    this._duck();
  }

  // Slot warning: alternating two-tone beep
  warning() {
    this._osc({ type: 'square', freq: 880, attack: 0.005, decay: 0.08, peak: 0.12 });
    setTimeout(() => this._osc({ type: 'square', freq: 660, attack: 0.005, decay: 0.08, peak: 0.12 }), 90);
  }

  // Shuffle: rapid clicks
  shuffle() {
    if (!this.unlocked || !storage.state.settings.soundEnabled) return;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this._osc({
        type: 'square',
        freq: 400 + Math.random() * 600,
        attack: 0.002, decay: 0.04, peak: 0.12
      }), i * 30);
    }
    this._duck();
  }

  // Undo: reverse pitch dive
  undo() {
    this._osc({ type: 'sine', freq: 600, slideTo: 300, slideTime: 0.18, attack: 0.005, decay: 0.18, peak: 0.18 });
    this._duck();
  }

  // Hint: gentle chime
  hint() {
    if (!this.unlocked || !storage.state.settings.soundEnabled) return;
    const t0 = this.ctx.currentTime;
    [880, 1320, 1760].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g); g.connect(this.sfxGain);
      g.gain.setValueAtTime(0, t0 + i * 0.06);
      g.gain.linearRampToValueAtTime(0.12, t0 + i * 0.06 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.06 + 0.4);
      o.start(t0 + i * 0.06); o.stop(t0 + i * 0.06 + 0.45);
    });
    this._duck();
  }

  // Bomb: file-based explosion sample (sound/bomb.wav)
  bomb() {
    this.playFile('bomb');
  }

  // Freeze: shimmery descending tones
  freeze() {
    if (!this.unlocked || !storage.state.settings.soundEnabled) return;
    const t0 = this.ctx.currentTime;
    [1760, 1480, 1320, 880].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      o.connect(g); g.connect(this.sfxGain);
      g.gain.setValueAtTime(0, t0 + i * 0.04);
      g.gain.linearRampToValueAtTime(0.15, t0 + i * 0.04 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.04 + 0.35);
      o.start(t0 + i * 0.04); o.stop(t0 + i * 0.04 + 0.4);
    });
    this._duck();
  }

  // Drop: thump
  drop() {
    this._osc({ type: 'sine', freq: 200, slideTo: 80, slideTime: 0.1, attack: 0.005, decay: 0.12, peak: 0.3 });
  }

  // Reveal: soft chime when a tile becomes uncovered
  reveal() {
    this._osc({ type: 'triangle', freq: 1320, slideTo: 1760, slideTime: 0.06, attack: 0.005, decay: 0.1, peak: 0.08 });
  }

  // Reward pickup
  reward() {
    if (!this.unlocked || !storage.state.settings.soundEnabled) return;
    const t0 = this.ctx.currentTime;
    [659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      o.connect(g); g.connect(this.sfxGain);
      g.gain.setValueAtTime(0, t0 + i * 0.06);
      g.gain.linearRampToValueAtTime(0.18, t0 + i * 0.06 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.06 + 0.3);
      o.start(t0 + i * 0.06); o.stop(t0 + i * 0.06 + 0.35);
    });
    this._duck();
  }

  // Aliases for file-based effects
  win()  { this.playFile('win'); }
  fail() { this.playFile('fail'); }
  itemUse() { this.playFile('item'); }
}

export const audio = new AudioEngine();
