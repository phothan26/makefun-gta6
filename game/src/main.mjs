// NEON RAIN — Midnight Courier: the browser shell.
// Canvas, keyboard, the 60 Hz fixed-step loop, title / playing / complete
// screens, and a localStorage save that lets Juno pick up where she left off.

import { createGame, stepGame, serializeGame, deserializeGame } from './sim.mjs';
import { renderScene } from './render.mjs';
import { drawCommands } from './canvas.mjs';
import { createAudio } from './audio.mjs';

const SAVE_KEY = 'neon-rain-save-v1';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const audio = createAudio();
const statusEl = document.getElementById('status');

let state = null;
let screen = 'title'; // 'title' | 'playing' | 'complete'
let seed = (Math.random() * 1e9) | 0;
let lastCrashCount = 0;
let lastJobIndex = 0;

const keys = {};
const input = { up: false, down: false, left: false, right: false, enter: false, slip: false };

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = deserializeGame(raw);
    return saved;
  } catch {
    return null;
  }
}

function saveGame() {
  if (!state || state.status !== 'playing') return;
  try {
    localStorage.setItem(SAVE_KEY, serializeGame(state));
  } catch {
    // Storage full or blocked: the night goes on unsaved.
  }
}

function newNight(freshSeed) {
  seed = freshSeed ?? ((Math.random() * 1e9) | 0);
  state = createGame(seed);
  screen = 'playing';
  lastCrashCount = 0;
  lastJobIndex = 0;
  statusEl.textContent = `Night started — seed ${seed}. Five jobs. Good luck, Juno.`;
  audio.start();
}

function refreshInput() {
  input.up = !!(keys.ArrowUp || keys.KeyW);
  input.down = !!(keys.ArrowDown || keys.KeyS);
  input.left = !!(keys.ArrowLeft || keys.KeyA);
  input.right = !!(keys.ArrowRight || keys.KeyD);
  input.enter = !!keys.KeyE;
  input.slip = !!keys.Space;
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Enter') {
    if (screen === 'title') {
      const saved = loadSave();
      if (saved && saved.status === 'playing') {
        state = saved;
        screen = 'playing';
        statusEl.textContent = 'Welcome back, Juno — the night continues where you left it.';
        audio.start();
      } else {
        newNight();
      }
    } else if (screen === 'complete') {
      try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      newNight();
    }
  }
  if (e.code === 'KeyM') {
    audio.toggleMute();
    statusEl.textContent = audio.muted ? 'Sound muted.' : 'Sound on.';
  }
  if (e.code === 'Digit1') audio.setStation(0);
  if (e.code === 'Digit2') audio.setStation(1);
  if (e.code === 'Digit3') audio.setStation(2);
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

canvas.addEventListener('click', () => {
  if (screen === 'title') {
    const saved = loadSave();
    if (saved && saved.status === 'playing') {
      state = saved;
      screen = 'playing';
      audio.start();
    } else {
      newNight();
    }
  } else if (screen === 'complete') {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    newNight();
  }
});

// Attract mode behind the title: a city that lives before you press start.
state = createGame(seed);
let acc = 0;
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (screen === 'playing' && state) {
    acc += dt;
    refreshInput();
    while (acc >= 1 / 60) {
      stepGame(state, input);
      acc -= 1 / 60;
      if (state.crashes !== lastCrashCount) {
        lastCrashCount = state.crashes;
        audio.crash();
        statusEl.textContent = 'Crash! The heat is on — lose them or slipstream away.';
      }
      if (state.jobIndex !== lastJobIndex) {
        lastJobIndex = state.jobIndex;
        audio.pickup();
        statusEl.textContent = state.status === 'complete'
          ? 'Night complete — all five jobs delivered.'
          : `Job ${state.jobIndex + 1} of 5 — Mara Voss is on the line.`;
        saveGame();
      }
      if (state.status === 'complete') {
        screen = 'complete';
        try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
        break;
      }
    }
    audio.update(state);
    // Autosave every ten seconds of play.
    if (state.tick % 600 === 0) saveGame();
  } else {
    // Title screen: let the city breathe (rain moves, traffic drives).
    state.tick++;
    state.rain = 0.55 + 0.45 * Math.sin(state.tick * 0.0009 + 1.3);
  }
  const mode = screen === 'title' ? 'title' : screen === 'complete' ? 'complete' : 'game';
  drawCommands(ctx, renderScene(state, { mode }));
  requestAnimationFrame(frame);
}

const savedAtLoad = loadSave();
statusEl.textContent = savedAtLoad && savedAtLoad.status === 'playing'
  ? 'Saved night found — press ENTER to continue where Juno left off.'
  : 'Press ENTER or click to start the night.';
requestAnimationFrame(frame);
