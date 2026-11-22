// Synthesized sound for Vice Harbor. Everything is WebAudio oscillators
// and scheduled notes — no audio files, no network. In Node (the bot)
// there is no AudioContext, so every method is a safe no-op.
import { RADIO } from './config.js';

// Minor-scale step patterns, one per station. Each entry is a scale degree
// (0 = root). The sequencer walks the pattern and plays the note.
const PATTERNS = {
  vh88: { steps: [0, 0, 3, 5, 7, 5, 3, 2, 0, 0, 7, 5, 3, 5, 7, 10], bass: [0, 0, 0, 0, 5, 5, 3, 3] },
  vh102: { steps: [0, 2, 4, 7, 9, 7, 4, 2, 0, 4, 7, 9, 11, 9, 7, 4], bass: [0, 3, 4, 3] },
  vh96: { steps: [0, 0, 0, 7, 0, 5, 0, 3, 0, 0, 7, 5, 3, 2, 0, 0], bass: [0, 0, 5, 3] },
};

const MINOR = [0, 2, 3, 5, 7, 8, 10];

function degreeToFreq(root, degree) {
  const oct = Math.floor(degree / MINOR.length);
  const step = MINOR[((degree % MINOR.length) + MINOR.length) % MINOR.length];
  return root * Math.pow(2, oct + step / 12);
}

export function createAudio() {
  const api = {
    ctx: null,
    master: null,
    musicGain: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    station: 0,
    muted: false,
    step: 0,
    timer: null,
    started: false,

    start() {
      if (this.started) return;
      if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;
      const AC = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext;
      try {
        this.ctx = new AC();
      } catch (e) {
        return;
      }
      this.started = true;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);

      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();

      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();

      const station = RADIO[this.station];
      const stepMs = 60000 / station.bpm / 2;
      this.timer = setInterval(() => this.scheduleStep(), stepMs);
    },

    scheduleStep() {
      if (!this.ctx || this.muted) {
        this.step++;
        return;
      }
      const station = RADIO[this.station];
      const pat = PATTERNS[station.id];
      const now = this.ctx.currentTime;
      const idx = this.step % pat.steps.length;
      const note = pat.steps[idx];
      const bassNote = pat.bass[Math.floor(this.step / 2) % pat.bass.length];
      this.blip(degreeToFreq(station.root * 4, note), now, 0.22, station.wave, 0.5);
      if (this.step % 2 === 0) {
        this.blip(degreeToFreq(station.root, bassNote), now, 0.4, 'sine', 0.8);
      }
      this.step++;
    },

    blip(freq, when, dur, wave, vol) {
      const osc = this.ctx.createOscillator();
      osc.type = wave;
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    },

    setStation(i) {
      this.station = ((i % RADIO.length) + RADIO.length) % RADIO.length;
      this.step = 0;
    },

    stationName() {
      return RADIO[this.station].name;
    },

    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
      return this.muted;
    },

    // speed 0..1, onWater true when the player is in a boat.
    engine(speed, onWater) {
      if (!this.ctx || this.muted) return;
      const base = onWater ? 42 : 55;
      this.engineOsc.frequency.setTargetAtTime(base + speed * 130, this.ctx.currentTime, 0.1);
      this.engineGain.gain.setTargetAtTime(speed > 0.03 ? 0.05 + speed * 0.05 : 0, this.ctx.currentTime, 0.1);
    },

    // distance 0..1 to the nearest police unit (1 = far away / none).
    siren(near) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const tone = Math.floor(t * 2) % 2 === 0 ? 700 : 950;
      this.sirenOsc.frequency.setTargetAtTime(tone, t, 0.05);
      this.sirenGain.gain.setTargetAtTime(near < 1 ? 0.04 * (1 - near) : 0, t, 0.2);
    },

    stop() {
      if (this.timer) clearInterval(this.timer);
      if (this.ctx) this.ctx.close().catch(() => {});
      this.started = false;
    },
  };
  return api;
}
