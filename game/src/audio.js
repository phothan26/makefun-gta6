// All sound is synthesised with WebAudio: no audio files, no network. Engine hum,
// sirens, effects and three radio stations (synthwave, lo-fi, chase) built from a
// small step sequencer. Everything is guarded: no AudioContext, no sound, no crash.
const STATIONS = [
  { name: 'SUNSET FM', kind: 'synthwave', bpm: 96 },
  { name: 'BAY LO-FI', kind: 'lofi', bpm: 72 },
  { name: 'CHASE 104', kind: 'chase', bpm: 132 },
];

// Minor-key arpeggio figures per station, as semitone offsets from a root.
const PATTERNS = {
  synthwave: { root: 45, seq: [0, 3, 7, 10, 12, 10, 7, 3], bass: [0, 0, 5, 3] },
  lofi: { root: 48, seq: [0, 7, 12, 10, 7, 3, 0, 5], bass: [0, 5, 3, 3] },
  chase: { root: 40, seq: [0, 0, 12, 0, 10, 0, 7, 12], bass: [0, 0, 0, 5] },
};

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    station: 0,
    radioOn: true,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenTimer: 0,
    step: 0,
    nextStepTime: 0,
    started: false,
  };

  function ensure() {
    if (audio.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(audio.ctx.destination);
      // Engine: two detuned saws through a low-pass, pitch follows speed.
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 60;
      audio.engineOsc2 = audio.ctx.createOscillator();
      audio.engineOsc2.type = 'square';
      audio.engineOsc2.frequency.value = 90;
      const g2 = audio.ctx.createGain();
      g2.gain.value = 0.4;
      audio.engineOsc.connect(filter);
      audio.engineOsc2.connect(g2);
      g2.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      audio.engineOsc2.start();
      // Siren: one sine, its pitch flipped by the update loop.
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'sine';
      audio.sirenOsc.frequency.value = 750;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      audio.started = true;
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!audio.ctx) return;
    try {
      const t = audio.ctx.currentTime + when;
      const o = audio.ctx.createOscillator();
      const g = audio.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(audio.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch { /* sound is decoration; never fail the game */ }
  }

  function noise(dur, vol, freq = 800) {
    if (!audio.ctx) return;
    try {
      const t = audio.ctx.currentTime;
      const len = Math.floor(audio.ctx.sampleRate * dur);
      const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audio.ctx.createBufferSource();
      src.buffer = buf;
      const f = audio.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = audio.ctx.createGain();
      g.gain.value = vol;
      src.connect(f);
      f.connect(g);
      g.connect(audio.master);
      src.start(t);
    } catch { /* ignore */ }
  }

  return {
    /** Call on the first user gesture: browsers only allow audio after one. */
    unlock() {
      if (ensure() && audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
    },
    toggleMute() {
      audio.muted = !audio.muted;
      if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
      return audio.muted;
    },
    nextStation() {
      audio.station = (audio.station + 1) % STATIONS.length;
      return STATIONS[audio.station].name;
    },
    stationName() {
      return STATIONS[audio.station].name;
    },
    sfx(name) {
      if (!audio.ctx || audio.muted) return;
      if (name === 'crash') noise(0.25, 0.5, 500);
      else if (name === 'pickup') { blip(660, 0.09, 'sine', 0.25); blip(990, 0.12, 'sine', 0.25, 0.08); }
      else if (name === 'cash') { blip(523, 0.08, 'triangle', 0.25); blip(659, 0.08, 'triangle', 0.25, 0.07); blip(784, 0.14, 'triangle', 0.25, 0.14); }
      else if (name === 'punch') noise(0.12, 0.4, 300);
      else if (name === 'busted') { blip(220, 0.3, 'sawtooth', 0.2); blip(165, 0.4, 'sawtooth', 0.2, 0.25); }
      else if (name === 'enter') blip(330, 0.08, 'triangle', 0.2);
      else if (name === 'horn') { blip(370, 0.18, 'square', 0.12); blip(466, 0.18, 'square', 0.12); }
    },
    /** Called every frame with the driving state: engine, siren and the radio sequencer. */
    update(dt, { driving, speed, maxSpeed, wanted }) {
      if (!audio.ctx || audio.muted) return;
      try {
        const now = audio.ctx.currentTime;
        if (audio.engineGain) {
          const target = driving ? 0.05 + 0.09 * Math.abs(speed / maxSpeed) : 0;
          audio.engineGain.gain.setTargetAtTime(target, now, 0.1);
          const f = 55 + Math.abs(speed / maxSpeed) * 140;
          audio.engineOsc.frequency.setTargetAtTime(f, now, 0.08);
          audio.engineOsc2.frequency.setTargetAtTime(f * 1.5, now, 0.08);
        }
        if (audio.sirenGain) {
          audio.sirenTimer += dt;
          const on = wanted > 0;
          audio.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, now, 0.2);
          if (on) audio.sirenOsc.frequency.setTargetAtTime(Math.floor(audio.sirenTimer * 1.6) % 2 === 0 ? 720 : 950, now, 0.05);
        }
        // Radio: one 8th-note step per beat slice, only while the radio is on.
        if (!audio.radioOn) return;
        const station = STATIONS[audio.station];
        const pattern = PATTERNS[station.kind];
        const stepDur = 60 / station.bpm / 2;
        if (now >= audio.nextStepTime) {
          const stepIndex = audio.step % 8;
          const note = pattern.seq[stepIndex] + pattern.root + 12;
          const bass = pattern.bass[Math.floor(audio.step / 2) % 4] + pattern.root;
          blip(midiToFreq(note), stepDur * 0.9, station.kind === 'chase' ? 'square' : 'triangle', 0.07);
          if (stepIndex % 2 === 0) blip(midiToFreq(bass), stepDur * 1.8, 'sine', 0.12);
          if (station.kind === 'chase' && stepIndex % 2 === 1) noise(0.03, 0.05, 4000);
          audio.step += 1;
          audio.nextStepTime = now + stepDur;
        }
      } catch { /* ignore */ }
    },
  };
}
