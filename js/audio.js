export class ArcadeAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmOn = true;
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.stopBgm();
    return this.muted;
  }

  playTone(freq, endFreq, duration, type = 'square', gainVal = 0.14) {
    if (this.muted || !this.ctx) return;
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
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playNoise(duration = 0.08, gainVal = 0.15, highpass = 600) {
    if (this.muted || !this.ctx) return;
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
    gain.connect(this.ctx.destination);
    src.start(now);
  }

  playWhiff() {
    this.unlock();
    this.playNoise(0.06, 0.07, 1400);
    this.playTone(320, 140, 0.06, 'triangle', 0.06);
  }

  playHit(heavy = false) {
    this.unlock();
    if (heavy) {
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
    this.playTone(680, 420, 0.07, 'triangle', 0.14);
    this.playNoise(0.05, 0.1, 2200);
  }

  playFireball() {
    this.unlock();
    this.playTone(220, 660, 0.18, 'sawtooth', 0.14);
    this.playNoise(0.16, 0.12, 1100);
  }

  playUppercut() {
    this.unlock();
    this.playTone(180, 880, 0.22, 'sawtooth', 0.16);
    this.playNoise(0.14, 0.12, 1600);
  }

  playSuper(theme = 'cyber') {
    this.unlock();
    if (theme === 'love') {
      // Shimmering Love Heartstorm arpeggio
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, freq * 1.04, 0.22, 'triangle', 0.16), i * 65);
      });
      setTimeout(() => this.playTone(261.6, 523.25, 0.35, 'sawtooth', 0.14), 120);
    } else if (theme === 'claude_code') {
      // Rapid terminal key-chirps + bass overdrive drop
      [880, 1174, 987, 1318, 1760].forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, freq, 0.05, 'square', 0.12), i * 40);
      });
      setTimeout(() => this.playTone(140, 48, 0.38, 'sawtooth', 0.22), 180);
    } else {
      this.playTone(110, 880, 0.35, 'sawtooth', 0.2);
      setTimeout(() => this.playTone(440, 1320, 0.28, 'square', 0.16), 90);
    }
  }

  playFight() {
    this.unlock();
    this.playTone(330, 330, 0.08, 'square', 0.12);
    setTimeout(() => this.playTone(440, 440, 0.08, 'square', 0.12), 80);
    setTimeout(() => this.playTone(660, 660, 0.18, 'sawtooth', 0.16), 160);
  }

  playKO() {
    this.unlock();
    this.playTone(260, 55, 0.45, 'sawtooth', 0.24);
    this.playNoise(0.35, 0.22, 420);
  }

  playClick() {
    this.unlock();
    this.playTone(540, 760, 0.05, 'square', 0.08);
  }

  startBgm() {
    if (this.muted || !this.bgmOn || this.bgmTimer) return;
    this.unlock();
    const bassLine = [110, 110, 130.8, 146.8, 110, 110, 164.8, 146.8];
    const leadLine = [440, 0, 523.2, 587.3, 659.2, 587.3, 523.2, 493.8];
    this.bgmTimer = setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const i = this.bgmStep % bassLine.length;
      this.playTone(bassLine[i], bassLine[i] * 0.98, 0.12, 'triangle', 0.045);
      if (leadLine[i] > 0 && this.bgmStep % 2 === 0) {
        this.playTone(leadLine[i], leadLine[i], 0.09, 'square', 0.025);
      }
      this.bgmStep += 1;
    }, 170);
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}
