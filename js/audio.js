/**
 * Arcade audio: plays real CC0 samples (assets/audio/**) through WebAudio with
 * separate master / sfx / music / voice volumes, and falls back to the original
 * WebAudio synth for any sample that is missing or fails to decode.
 */
const AUDIO_BASE = 'assets/audio/';

export const SAMPLE_FILES = {
  hit_light: 'sfx/hit_light.mp3',
  hit_heavy: 'sfx/hit_heavy.mp3',
  hit_critical: 'sfx/hit_critical.mp3',
  block: 'sfx/block.mp3',
  whiff: 'sfx/whiff.mp3',
  fireball: 'sfx/fireball.mp3',
  beam: 'sfx/beam.mp3',
  ko_impact: 'sfx/ko_impact.mp3',
  ui_select: 'sfx/ui_select.mp3',
  ui_confirm: 'sfx/ui_confirm.mp3',
  ui_back: 'sfx/ui_back.mp3',
  ann_round_1: 'announcer/round_1.mp3',
  ann_round_2: 'announcer/round_2.mp3',
  ann_round_3: 'announcer/round_3.mp3',
  ann_final_round: 'announcer/final_round.mp3',
  ann_fight: 'announcer/fight.mp3',
  ann_ko: 'announcer/ko.mp3',
  ann_double_ko: 'announcer/double_ko.mp3',
  ann_perfect: 'announcer/perfect.mp3',
  ann_winner: 'announcer/winner.mp3',
  ann_draw: 'announcer/draw.mp3',
};

export const BGM_FILES = {
  menu: 'bgm/menu.mp3',
  battle_fast: 'bgm/battle_fast.mp3',
  battle_trance: 'bgm/battle_trance.mp3',
};

const VOLUME_KEY = 'street_brawl_audio_v1';
const DEFAULT_VOLUMES = { master: 0.85, sfx: 0.9, music: 0.45, voice: 1.0 };

export class ArcadeAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volumes = { ...DEFAULT_VOLUMES };
    this.buses = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.bgmSource = null;
    this.bgmKey = null;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.voiceCache = new Map();
    this.lastVoiceAt = new Map();
    this.loadSettings();
  }

  loadSettings() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(VOLUME_KEY) : null;
      if (!raw) return;
      const saved = JSON.parse(raw);
      for (const k of Object.keys(DEFAULT_VOLUMES)) {
        if (typeof saved[k] === 'number') this.volumes[k] = Math.max(0, Math.min(1, saved[k]));
      }
      this.muted = Boolean(saved.muted);
    } catch {
      // Storage can be unavailable (private mode); defaults are fine
    }
  }

  saveSettings() {
    try {
      localStorage.setItem(VOLUME_KEY, JSON.stringify({ ...this.volumes, muted: this.muted }));
    } catch {
      // Ignore storage failures
    }
  }

  unlock() {
    if (!this.ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      this.ctx = new AC();
      const master = this.ctx.createGain();
      master.connect(this.ctx.destination);
      const mk = () => {
        const g = this.ctx.createGain();
        g.connect(master);
        return g;
      };
      this.buses = { master, sfx: mk(), music: mk() };
      this.applyVolumes();
      this.preloadAll();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  applyVolumes() {
    if (!this.buses) return;
    this.buses.master.gain.value = this.muted ? 0 : this.volumes.master;
    this.buses.sfx.gain.value = this.volumes.sfx;
    this.buses.music.gain.value = this.volumes.music;
  }

  setVolume(kind, value) {
    if (!(kind in this.volumes)) return;
    this.volumes[kind] = Math.max(0, Math.min(1, Number(value)));
    this.applyVolumes();
    this.saveSettings();
  }

  getVolume(kind) {
    return this.volumes[kind];
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyVolumes();
    this.saveSettings();
    return this.muted;
  }

  preloadAll() {
    for (const key of Object.keys(SAMPLE_FILES)) this.load(key, SAMPLE_FILES[key]);
  }

  load(key, path) {
    if (!this.ctx) return Promise.resolve(null);
    if (this.buffers.has(key)) return Promise.resolve(this.buffers.get(key));
    if (this.loading.has(key)) return this.loading.get(key);
    const p = fetch(AUDIO_BASE + path)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((data) => new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject)))
      .then((buf) => {
        this.buffers.set(key, buf);
        return buf;
      })
      .catch(() => {
        // Leave it unset: callers fall back to the synth version
        this.buffers.set(key, null);
        return null;
      })
      .finally(() => this.loading.delete(key));
    this.loading.set(key, p);
    return p;
  }

  /** Plays a decoded sample; returns false when unavailable so the caller can synthesize instead. */
  playSample(key, { gain = 1, rate = 1, bus = 'sfx' } = {}) {
    if (!this.ctx || !this.buses) return false;
    const buf = this.buffers.get(key);
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.buses[bus]);
    src.start();
    return true;
  }

  // --- WebAudio synth fallbacks -------------------------------------------------

  playTone(freq, endFreq, duration, type = 'square', gainVal = 0.14) {
    if (!this.ctx || !this.buses) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.buses.sfx);
    osc.start(now);
    osc.stop(now + duration);
  }

  playNoise(duration = 0.08, gainVal = 0.15, highpass = 600) {
    if (!this.ctx || !this.buses) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = highpass;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.buses.sfx);
    src.start(now);
  }

  // --- Game sounds ---------------------------------------------------------------

  playWhiff() {
    this.unlock();
    if (this.playSample('whiff', { gain: 0.55 })) return;
    this.playNoise(0.06, 0.07, 1400);
    this.playTone(320, 140, 0.06, 'triangle', 0.06);
  }

  playHit(heavy = false, critical = false) {
    this.unlock();
    const key = critical ? 'hit_critical' : heavy ? 'hit_heavy' : 'hit_light';
    if (this.playSample(key, { gain: critical ? 1.1 : 0.9 })) return;
    if (heavy || critical) {
      this.playNoise(0.14, 0.24, 500);
      this.playTone(170, 42, 0.16, 'sawtooth', 0.22);
      this.playTone(90, 35, 0.18, 'square', 0.16);
    } else {
      this.playNoise(0.08, 0.16, 900);
      this.playTone(220, 75, 0.09, 'square', 0.14);
    }
  }

  playBlock() {
    this.unlock();
    if (this.playSample('block', { gain: 0.8 })) return;
    this.playTone(680, 420, 0.07, 'triangle', 0.14);
    this.playNoise(0.05, 0.1, 2200);
  }

  playFireball(isSuper = false) {
    this.unlock();
    if (this.playSample(isSuper ? 'beam' : 'fireball', { gain: 0.75 })) return;
    this.playTone(220, 660, 0.18, 'sawtooth', 0.14);
    this.playNoise(0.16, 0.12, 1100);
  }

  playUppercut() {
    this.unlock();
    if (this.playSample('whiff', { gain: 0.8, rate: 0.75 })) return;
    this.playTone(180, 880, 0.22, 'sawtooth', 0.16);
    this.playNoise(0.14, 0.12, 1600);
  }

  /** Themed jingles stay synthesized: they are each fighter's signature motif. */
  playSuper(theme = 'cyber') {
    this.unlock();
    this.playSample('beam', { gain: 0.6, rate: 0.8 });
    if (theme === 'love') {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, freq * 1.04, 0.22, 'triangle', 0.16), i * 65);
      });
      setTimeout(() => this.playTone(261.6, 523.25, 0.35, 'sawtooth', 0.14), 120);
    } else if (theme === 'claude_code') {
      [880, 1174, 987, 1318, 1760].forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, freq, 0.05, 'square', 0.12), i * 40);
      });
      setTimeout(() => this.playTone(140, 48, 0.38, 'sawtooth', 0.22), 180);
    } else if (theme === 'pembangunan') {
      // Construction "clang-clang" + rising brass-like fanfare
      [0, 110, 220].forEach((d) => setTimeout(() => this.playTone(1240, 980, 0.08, 'square', 0.12), d));
      setTimeout(() => this.playTone(196, 392, 0.4, 'sawtooth', 0.18), 300);
    } else {
      this.playTone(110, 880, 0.35, 'sawtooth', 0.2);
      setTimeout(() => this.playTone(440, 1320, 0.28, 'square', 0.16), 90);
    }
  }

  playRush(theme = 'cyber') {
    this.unlock();
    this.playSample('whiff', { gain: 0.9, rate: 1.3 });
    if (theme === 'love') {
      [784, 988, 1175].forEach((f, i) => setTimeout(() => this.playTone(f, f * 1.03, 0.1, 'triangle', 0.13), i * 45));
    } else if (theme === 'claude_code') {
      [1318, 1568, 1760, 2093].forEach((f, i) => setTimeout(() => this.playTone(f, f, 0.035, 'square', 0.1), i * 30));
    } else if (theme === 'pembangunan') {
      [880, 1100].forEach((f, i) => setTimeout(() => this.playTone(f, f * 0.9, 0.06, 'square', 0.12), i * 70));
    } else {
      this.playTone(330, 990, 0.16, 'sawtooth', 0.14);
    }
  }

  playAnnouncer(key) {
    this.unlock();
    return this.playSample(`ann_${key}`, { gain: 1.25 * this.volumes.voice, bus: 'sfx' });
  }

  playRoundCall(round, isFinal) {
    const key = isFinal ? 'final_round' : `round_${Math.min(3, round)}`;
    this.playAnnouncer(key);
  }

  playFight() {
    this.unlock();
    if (this.playAnnouncer('fight')) return;
    this.playTone(330, 330, 0.08, 'square', 0.12);
    setTimeout(() => this.playTone(440, 440, 0.08, 'square', 0.12), 80);
    setTimeout(() => this.playTone(660, 660, 0.18, 'sawtooth', 0.16), 160);
  }

  playKO({ perfect = false, double = false } = {}) {
    this.unlock();
    const hadImpact = this.playSample('ko_impact', { gain: 1 });
    if (!hadImpact) {
      this.playTone(260, 55, 0.45, 'sawtooth', 0.24);
      this.playNoise(0.35, 0.22, 420);
    }
    this.playAnnouncer(double ? 'double_ko' : 'ko');
    if (perfect) setTimeout(() => this.playAnnouncer('perfect'), 1300);
  }

  playClick() {
    this.unlock();
    if (this.playSample('ui_select', { gain: 0.7 })) return;
    this.playTone(540, 760, 0.05, 'square', 0.08);
  }

  playConfirm() {
    this.unlock();
    if (this.playSample('ui_confirm', { gain: 0.8 })) return;
    this.playTone(660, 990, 0.09, 'square', 0.1);
  }

  // --- Music ---------------------------------------------------------------------

  async startBgm(key = 'battle_fast') {
    this.unlock();
    if (!this.ctx) return;
    if (this.bgmKey === key && (this.bgmSource || this.bgmTimer)) return;
    this.stopBgm();
    this.bgmKey = key;
    const buf = await this.load(`bgm_${key}`, BGM_FILES[key] || BGM_FILES.battle_fast);
    if (this.bgmKey !== key) return; // switched or stopped while loading
    if (!buf) {
      this.startSynthBgm();
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.buses.music);
    src.start();
    this.bgmSource = src;
  }

  startSynthBgm() {
    const bassLine = [110, 110, 130.8, 146.8, 110, 110, 164.8, 146.8];
    const leadLine = [440, 0, 523.2, 587.3, 659.2, 587.3, 523.2, 493.8];
    this.bgmTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const i = this.bgmStep % bassLine.length;
      this.playTone(bassLine[i], bassLine[i] * 0.98, 0.12, 'triangle', 0.045 * this.volumes.music * 2);
      if (leadLine[i] > 0 && this.bgmStep % 2 === 0) {
        this.playTone(leadLine[i], leadLine[i], 0.09, 'square', 0.025 * this.volumes.music * 2);
      }
      this.bgmStep += 1;
    }, 170);
  }

  stopBgm() {
    this.bgmKey = null;
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
      } catch {
        // Already stopped
      }
      this.bgmSource = null;
    }
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  // --- Character voice clips -----------------------------------------------------

  /**
   * Plays a short character voice clip (e.g. assets/audio/owi/lawan.mp3).
   * Throttled per channel so rapid hits don't stack the same voice.
   */
  playVoice(src, channel = src, minGapMs = 1200) {
    if (this.muted || !src || typeof Audio === 'undefined') return;
    const now = Date.now();
    if (now - (this.lastVoiceAt.get(channel) || 0) < minGapMs) return;
    this.lastVoiceAt.set(channel, now);
    let base = this.voiceCache.get(src);
    if (!base) {
      base = new Audio(src);
      base.preload = 'auto';
      this.voiceCache.set(src, base);
    }
    const clip = base.cloneNode();
    clip.volume = Math.min(1, this.volumes.master * this.volumes.voice);
    clip.play().catch(() => {});
  }

  preloadVoices(fighter) {
    if (!fighter?.voice || typeof Audio === 'undefined') return;
    for (const src of Object.values(fighter.voice)) {
      if (src && !this.voiceCache.has(src)) {
        const a = new Audio(src);
        a.preload = 'auto';
        this.voiceCache.set(src, a);
      }
    }
  }
}
