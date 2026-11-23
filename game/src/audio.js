// MARSHLIGHT audio: three WebAudio radio stations and a handful of
// sound effects, all synthesized in code — no audio files, no network.
// The sequencer schedules notes a little ahead of time so the groove
// stays steady even when the frame rate wobbles.
const STATIONS = [
  {
    name: 'Swamp Blues',
    bpm: 72,
    bass: [40, 0, 40, 0, 43, 0, 40, 0, 45, 0, 43, 0, 40, 0, 38, 0],
    lead: [64, 0, 0, 67, 0, 0, 69, 0, 67, 0, 64, 0, 62, 0, 0, 0],
    wave: 'triangle',
  },
  {
    name: 'Bayou Funk',
    bpm: 104,
    bass: [38, 38, 0, 41, 0, 38, 0, 0, 43, 0, 41, 0, 38, 0, 36, 0],
    lead: [62, 0, 65, 0, 62, 0, 0, 69, 0, 67, 0, 65, 0, 62, 0, 0],
    wave: 'sawtooth',
  },
  {
    name: 'Night Drive',
    bpm: 92,
    bass: [33, 0, 0, 0, 36, 0, 0, 0, 38, 0, 0, 0, 41, 0, 36, 0],
    lead: [69, 72, 0, 76, 0, 72, 0, 69, 0, 67, 0, 72, 0, 69, 0, 0],
    wave: 'sine',
  },
];

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function createAudio() {
  return {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    station: 0, muted: false, step: 0, nextTime: 0, timer: null,
    sirenOsc: null, sirenGain: null, fanSrc: null, fanGain: null,
  };
}

export function ensureAudio(a) {
  if (a.ctx) {
    if (a.ctx.state === 'suspended') a.ctx.resume();
    return;
  }
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctx) return;
  a.ctx = new Ctx();
  a.master = a.ctx.createGain();
  a.master.gain.value = a.muted ? 0 : 0.5;
  a.master.connect(a.ctx.destination);
  a.musicGain = a.ctx.createGain();
  a.musicGain.gain.value = 0.5;
  a.musicGain.connect(a.master);
  a.sfxGain = a.ctx.createGain();
  a.sfxGain.gain.value = 0.9;
  a.sfxGain.connect(a.master);
  a.nextTime = a.ctx.currentTime + 0.1;
  a.timer = setInterval(() => scheduleMusic(a), 90);
  // Airboat fan: looped noise through a lowpass, gain follows speed.
  const len = a.ctx.sampleRate;
  const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  a.fanSrc = a.ctx.createBufferSource();
  a.fanSrc.buffer = buf;
  a.fanSrc.loop = true;
  const filter = a.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 320;
  a.fanGain = a.ctx.createGain();
  a.fanGain.gain.value = 0;
  a.fanSrc.connect(filter);
  filter.connect(a.fanGain);
  a.fanGain.connect(a.master);
  a.fanSrc.start();
}

function scheduleMusic(a) {
  if (!a.ctx || a.muted) return;
  const st = STATIONS[a.station];
  const stepDur = 60 / st.bpm / 2;
  while (a.nextTime < a.ctx.currentTime + 0.25) {
    const i = a.step % 16;
    const bass = st.bass[i];
    if (bass) playNote(a, midiToFreq(bass), a.nextTime, stepDur * 1.8, st.wave, 0.16, a.musicGain);
    const lead = st.lead[i];
    if (lead) playNote(a, midiToFreq(lead), a.nextTime, stepDur * 0.9, 'square', 0.05, a.musicGain);
    if (i % 4 === 2) playNoise(a, a.nextTime, 0.03, 6000, 0.05, a.musicGain);
    a.step++;
    a.nextTime += stepDur;
  }
}

function playNote(a, freq, when, dur, wave, vol, dest) {
  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  o.type = wave;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(vol, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  o.connect(g);
  g.connect(dest);
  o.start(when);
  o.stop(when + dur + 0.05);
}

function playNoise(a, when, dur, freq, vol, dest) {
  const len = Math.max(1, Math.floor(a.ctx.sampleRate * dur));
  const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const f = a.ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = a.ctx.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(when);
}

export function setStation(a, i) {
  a.station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
  a.step = 0;
  if (a.ctx) a.nextTime = a.ctx.currentTime + 0.05;
}

export function stationName(a) {
  return STATIONS[a.station].name;
}

export function setMuted(a, muted) {
  a.muted = muted;
  if (a.master) a.master.gain.value = muted ? 0 : 0.5;
}

export function updateFan(a, speed, inBoat) {
  if (!a.ctx || !a.fanGain) return;
  const target = inBoat ? Math.min(0.12, speed * 0.02) : 0;
  a.fanGain.gain.setTargetAtTime(target, a.ctx.currentTime, 0.1);
}

export function updateSiren(a, wanted) {
  if (!a.ctx) return;
  if (wanted > 0 && !a.sirenOsc) {
    a.sirenOsc = a.ctx.createOscillator();
    a.sirenOsc.type = 'sine';
    a.sirenOsc.frequency.value = 750;
    a.sirenGain = a.ctx.createGain();
    a.sirenGain.gain.value = 0.03;
    const lfo = a.ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const lfoGain = a.ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(a.sirenOsc.frequency);
    a.sirenOsc.connect(a.sirenGain);
    a.sirenGain.connect(a.master);
    a.sirenOsc.start();
    lfo.start();
    a.sirenLfo = lfo;
  } else if (wanted === 0 && a.sirenOsc) {
    try { a.sirenOsc.stop(); a.sirenLfo.stop(); } catch { /* already stopped */ }
    a.sirenOsc = null;
    a.sirenLfo = null;
  }
}

export function playSfx(a, name) {
  if (!a.ctx || a.muted) return;
  const t = a.ctx.currentTime;
  if (name === 'cash' || name === 'pickup') {
    playNote(a, 880, t, 0.12, 'sine', 0.2, a.sfxGain);
    playNote(a, 1318, t + 0.09, 0.18, 'sine', 0.2, a.sfxGain);
  } else if (name === 'jobdone') {
    playNote(a, 523, t, 0.15, 'triangle', 0.22, a.sfxGain);
    playNote(a, 659, t + 0.12, 0.15, 'triangle', 0.22, a.sfxGain);
    playNote(a, 784, t + 0.24, 0.3, 'triangle', 0.22, a.sfxGain);
  } else if (name === 'bite' || name === 'gator') {
    playNoise(a, t, 0.25, 900, 0.3, a.sfxGain);
  } else if (name === 'rammed' || name === 'busted') {
    playNoise(a, t, 0.3, 300, 0.35, a.sfxGain);
    playNote(a, 110, t, 0.3, 'sawtooth', 0.2, a.sfxGain);
  } else if (name === 'splash') {
    playNoise(a, t, 0.2, 1200, 0.12, a.sfxGain);
  }
}
