// NEON RAIN — Midnight Courier: sound, all synthesized with WebAudio.
// Three radio stations (no audio files), engine hum, rain, sirens, crashes.
// Everything is a no-op without a browser, so the headless bot run stays
// silent and fast.

const STATIONS = [
  {
    name: 'NEON FM',
    tempo: 132, wave: 'sawtooth', bass: [45, 45, 48, 43],
    chords: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [55, 59, 63]],
  },
  {
    name: 'RAIN JAZZ',
    tempo: 96, wave: 'triangle', bass: [41, 46, 44, 48],
    chords: [[60, 63, 67], [58, 62, 65], [57, 60, 64], [59, 62, 66]],
  },
  {
    name: 'MIDNIGHT BASS',
    tempo: 148, wave: 'square', bass: [38, 38, 41, 36],
    chords: [[50, 53, 57], [48, 52, 55], [50, 53, 57], [47, 51, 55]],
  },
];

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function createAudio() {
  const api = {
    muted: false,
    station: 0,
    setStation(i) { api.station = ((i % 3) + 3) % 3; },
    toggleMute() { api.muted = !api.muted; if (api.rainGain) api.rainGain.gain.value = 0; },
    update() {},
    crash() {},
    pickup() {},
    start() {},
  };
  if (typeof window === 'undefined' || !window.AudioContext) return api;

  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let rainGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let stepTimer = null;
  let step = 0;

  function ensure() {
    if (ctx) return;
    ctx = new window.AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    // Looped rain noise.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 2400;
    rainFilter.Q.value = 0.6;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    noise.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(master);
    noise.start();
    // Two-tone siren, quiet until the heat is on.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 720;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    api.rainGain = rainGain;
  }

  function note(freq, when, dur, type, gain) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function scheduleStep() {
    if (!ctx || api.muted) return;
    const st = STATIONS[api.station];
    const stepDur = 60 / st.tempo / 2;
    const now = ctx.currentTime + 0.05;
    const bar = Math.floor(step / 8) % 4;
    const s8 = step % 8;
    // Bass on every step, chord stab on the off-beats.
    note(midiToFreq(st.bass[bar] + 12), now, stepDur * 0.9, st.wave, 0.5);
    if (s8 % 2 === 1) {
      for (const n of st.chords[bar]) note(midiToFreq(n), now, stepDur * 1.8, 'triangle', 0.12);
    }
    if (s8 === 4) note(midiToFreq(st.chords[bar][2] + 12), now, stepDur, 'sine', 0.2);
    step++;
  }

  api.start = () => {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
    if (!stepTimer) stepTimer = setInterval(scheduleStep, 60 / STATIONS[api.station].tempo * 500);
  };
  api.update = (state) => {
    if (!ctx) return;
    const p = state.player;
    const speed = Math.abs(p.speed || 0);
    engineGain.gain.value = api.muted ? 0 : (p.mode === 'foot' ? 0 : 0.02 + speed * 0.004);
    engineOsc.frequency.value = 55 + speed * 9;
    rainGain.gain.value = api.muted ? 0 : 0.02 + state.rain * 0.06;
    if (p.wanted > 0 && !api.muted) {
      sirenGain.gain.value = 0.02;
      sirenOsc.frequency.value = (Math.floor(performance.now() / 450) % 2 === 0) ? 720 : 960;
    } else {
      sirenGain.gain.value = 0;
    }
    master.gain.value = api.muted ? 0 : 0.5;
  };
  api.crash = () => {
    if (!ctx || api.muted) return;
    const len = ctx.sampleRate * 0.2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.4;
    src.connect(g);
    g.connect(master);
    src.start();
  };
  api.pickup = () => {
    if (!ctx || api.muted) return;
    const now = ctx.currentTime;
    note(660, now, 0.12, 'sine', 0.25);
    note(880, now + 0.09, 0.18, 'sine', 0.25);
  };
  return api;
}
