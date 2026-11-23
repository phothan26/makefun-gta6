// MARSHLIGHT browser entry: canvas, fixed-timestep loop, menus, save,
// autopilot demo and screenshot scenes. The simulation itself lives in
// sim.js and knows nothing about the browser, so the headless bot run in
// main.ts plays the exact same game.
import { createGame, stepGame, currentJob } from './sim.js';
import { createBot, botInput } from './bot.js';
import { renderGame } from './render.js';
import { createInput } from './input.js';
import { setupShot } from './shots.js';
import {
  createAudio, ensureAudio, setStation, stationName, setMuted,
  updateFan, updateSiren, playSfx,
} from './audio.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1) || 1;
const shot = params.get('shot');
const BEST_KEY = 'marshlight-best-v1';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput();
const audio = createAudio();
const bot = createBot();

let s = createGame(seed);
let mode = 'title';
let botOn = false;
let toast = null;
let best = null;
try { best = JSON.parse(localStorage.getItem(BEST_KEY) ?? 'null'); } catch { best = null; }

if (shot) {
  mode = setupShot(s, shot, seed);
  if (mode === 'complete') saveBest();
}

function saveBest() {
  const r = s.report;
  const run = { jobs: r.jobs.length, caches: r.cachesFound, cash: r.cash, style: r.style, ticks: r.tick };
  if (!best || run.cash > best.cash) {
    best = run;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(run)); } catch { /* storage unavailable */ }
  }
}

function showToast(text) {
  toast = { text, tick: s.tick };
}

function handleEvents() {
  for (const e of s.events) {
    if (e === 'jobdone') {
      const job = s.report.jobs[s.report.jobs.length - 1];
      showToast(job ? `${job.name} complete — $${job.cash}` : 'Job complete');
      playSfx(audio, 'jobdone');
    } else if (e === 'cache' || e === 'pickup' || e === 'crate') {
      playSfx(audio, 'cash');
    } else if (e === 'bite' || e === 'gator') {
      showToast('A gator took a bite out of you!');
      playSfx(audio, 'bite');
    } else if (e === 'rammed') {
      showToast('The police rammed your boat!');
      playSfx(audio, 'rammed');
    } else if (e === 'busted') {
      showToast('BUSTED — Beau fished you out at the bait shop');
      playSfx(audio, 'busted');
    } else if (e === 'ghost') {
      showToast('Mud Ghost — the heat drops a star');
    } else if (e === 'story-done') {
      mode = 'complete';
      saveBest();
      playSfx(audio, 'jobdone');
    }
  }
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let acc = 0;
const STEP = 1000 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  const edges = input.poll();
  if (edges.has('Enter')) {
    ensureAudio(audio);
    if (mode === 'title') mode = 'playing';
    else if (mode === 'complete') { s = createGame(seed); mode = 'playing'; toast = null; }
  }
  if (edges.has('Escape') || edges.has('KeyP')) {
    if (mode === 'playing') mode = 'paused';
    else if (mode === 'paused') mode = 'playing';
  }
  if (edges.has('KeyM')) {
    setMuted(audio, !audio.muted);
  }
  if (edges.has('Digit1')) setStation(audio, 0);
  if (edges.has('Digit2')) setStation(audio, 1);
  if (edges.has('Digit3')) setStation(audio, 2);
  if (edges.has('KeyB') && mode === 'playing') {
    botOn = !botOn;
    showToast(botOn ? 'Autopilot on — sit back, Marsh is driving' : 'Autopilot off — you drive');
  }

  if (mode === 'playing') {
    acc += Math.min(100, now - last);
    while (acc >= STEP) {
      acc -= STEP;
      const inp = botOn ? botInput(s, bot) : input.input;
      stepGame(s, inp);
      handleEvents();
      if (s.complete) break;
    }
    updateFan(audio, s.player.speed, s.player.mode === 'airboat');
    updateSiren(audio, s.wanted);
  }
  last = now;
  renderGame(ctx, s, canvas.width, canvas.height, {
    mode, radio: stationName(audio), muted: audio.muted, toast,
  });
}

window.__marshlight = {
  get state() { return s; },
  get mode() { return mode; },
  best,
};
requestAnimationFrame(frame);
