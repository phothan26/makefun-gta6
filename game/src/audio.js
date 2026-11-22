// Sound with no audio files: three WebAudio radio stations, an engine hum, sirens
// and spot effects, all synthesised. Audio starts only after a user gesture; if the
// browser refuses, the game plays on in silence.
import { STATIONS } from './config.js';

function midi(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// 16-step patterns, 0 = rest. Bass, lead and hat density per station.
const PATTERNS = [
  { // NB-88 SYNTHWAVE — 112 BPM, A minor.
    bpm: 112,
    bass: [33, 0, 33, 0, 36, 0, 33, 0, 38, 0, 38, 0, 40, 0, 36, 0],
    lead: [69, 0, 72, 0, 76, 0, 72, 0, 74, 0, 71, 0, 72, 0, 76, 0],
    hat: 2, bassWave: 'sawtooth', leadWave: 'square', leadGain: 0.05, bassGain: 0.09,
  },
  { // NB-102 LO-FI — 76 BPM, lazy chords.
    bpm: 76,
    bass: [45, 0, 0, 0, 43, 0, 0, 0, 41, 0, 0, 0, 43, 0, 48, 0],
    lead: [57, 0, 0, 60, 0, 0, 64, 0, 0, 0, 62, 0, 0, 0, 60, 0],
    hat: 4, bassWave: 'triangle', leadWave: 'triangle', leadGain: 0.06, bassGain: 0.1,
  },
  { // NB-96 CHASE — 140 BPM, driving eighths.
    bpm: 140,
    bass: [33, 33, 36, 33, 31, 33, 38, 36, 33, 33, 36, 33, 40, 38, 36, 33],
    lead: [69, 0, 69, 0, 72, 0, 69, 0, 74, 0, 72, 0, 76, 0, 74, 0],
    hat: 1, bassWave: 'sawtooth', leadWave: 'sawtooth', leadGain: 0.04, bassGain: 0.08,
  },
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let engine = null;
  let siren = null;
  let station = 0;
  let muted = false;
  let step = 0;
  let nextTime = 0;
  let timer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      engine = { osc1: ctx.createOscillator(), osc2: ctx.createOscillator(), gain: ctx.createGain() };
      engine.osc1.type = 'sawtooth';
      engine.osc2.type = 'square';
      engine.gain.gain.value = 0;
      engine.osc1.connect(engine.gain);
      engine.osc2.connect(engine.gain);
      engine.gain.connect(master);
      engine.osc1.start();
      engine.osc2.start();
      siren = { osc: ctx.createOscillator(), gain: ctx.createGain(), high: false, at: 0 };
      siren.osc.type = 'triangle';
      siren.osc.frequency.value = 720;
      siren.gain.gain.value = 0;
      siren.osc.connect(siren.gain);
      siren.gain.connect(master);
      siren.osc.start();
      step = 0;
      nextTime = ctx.currentTime + 0.1;
      timer = window.setInterval(schedule, 60);
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, at, dur, type, gain) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  function hat(at, gain) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(at);
    src.stop(at + 0.08);
  }

  function schedule() {
    if (!ctx) return;
    const pat = PATTERNS[station];
    const stepDur = 60 / pat.bpm / 4;
    while (nextTime < ctx.currentTime + 0.18) {
      const i = step % 16;
      const bass = pat.bass[i];
      if (bass) blip(midi(bass), nextTime, stepDur * 0.9, pat.bassWave, pat.bassGain);
      const lead = pat.lead[i];
      if (lead) blip(midi(lead), nextTime, stepDur * 0.8, pat.leadWave, pat.leadGain);
      if (i % pat.hat === 0) hat(nextTime, 0.03);
      step += 1;
      nextTime += stepDur;
    }
  }

  return {
    ensure,
    get station() {
      return station;
    },
    get stationName() {
      return STATIONS[station];
    },
    get muted() {
      return muted;
    },
    setStation(i) {
      station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
    },
    nextStation() {
      station = (station + 1) % STATIONS.length;
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = muted ? 0 : 0.9;
    },
    /** speed01 is 0..1, inCar false silences the engine. */
    setEngine(speed01, inCar) {
      if (!ctx || !engine) return;
      const f = 55 + speed01 * 170;
      engine.osc1.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
      engine.osc2.frequency.setTargetAtTime(f * 1.005 + 3, ctx.currentTime, 0.05);
      engine.gain.gain.setTargetAtTime(inCar ? 0.035 + speed01 * 0.03 : 0, ctx.currentTime, 0.1);
    },
    setSiren(on) {
      if (!ctx || !siren) return;
      siren.gain.gain.setTargetAtTime(on ? 0.03 : 0, ctx.currentTime, 0.1);
      if (on && ctx.currentTime - siren.at > 0.35) {
        siren.at = ctx.currentTime;
        siren.high = !siren.high;
        siren.osc.frequency.setTargetAtTime(siren.high ? 980 : 720, ctx.currentTime, 0.02);
      }
    },
    /** One-shot effects: pickup, crash, complete, busted. */
    sfx(kind) {
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        if (kind === 'pickup') {
          blip(660, now, 0.09, 'sine', 0.12);
          blip(990, now + 0.08, 0.12, 'sine', 0.12);
        } else if (kind === 'crash') {
          const src = ctx.createBufferSource();
          src.buffer = noiseBuf;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.25, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          src.connect(g);
          g.connect(master);
          src.start(now);
          src.stop(now + 0.3);
        } else if (kind === 'complete') {
          [523, 659, 784, 1047].forEach((f, i) => blip(f, now + i * 0.09, 0.16, 'triangle', 0.12));
        } else if (kind === 'busted') {
          [392, 330, 262].forEach((f, i) => blip(f, now + i * 0.16, 0.22, 'sawtooth', 0.08));
        }
      } catch {
        // Sound never breaks the game.
      }
    },
    stop() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    },
  };
}
