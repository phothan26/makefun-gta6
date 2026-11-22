// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. The game moves between screens:
// title, play, paused, busted, wrecked, failed, complete and story.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|complete (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
// ?bot=1&job=N plays job N with the autopilot and sets window.__botResult.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_FAILED, EVENT_JOB, EVENT_PACKAGE, EVENT_STORY, EVENT_WRECKED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_RADIO, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createBot } from './bot.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_FAILED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE, SCREEN_WRECKED } from './render.js';
import { stageShot } from './shots.js';
import { readSave, writeSave } from './save.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;
/** In bot mode the sim runs this many times faster than real time. */
const BOT_SPEED = 8;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const botMode = params.get('bot') === '1';
const botJob = Math.max(0, Math.min(4, Number.parseInt(params.get('job') ?? '0', 10) || 0));
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const saveData = readSave();
const world = createWorld(createRandom(seed), saveData);
world.onSave = (data) => writeSave(data);
const renderer = createRenderer(canvas);
const audio = createAudio();
const bot = createBot(world);

// What the debug harness and the screenshot runner read.
window.__game = { world, bot };

function ui() {
  return {
    best: saveData ? saveData.best : 0,
    savedJobs: world.jobsDone,
    station: audio.stationName,
    muted: audio.muted,
  };
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, ui());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runBot() {
  world.reset(botJob);
  let screen = SCREEN_PLAY;
  let steps = 0;
  let done = false;
  let lastHealth = world.player.health;

  function finish(status) {
    if (done) return;
    done = true;
    const p = world.player;
    window.__botResult = {
      status,
      simSeconds: Math.round(world.time * 10) / 10,
      steps,
      cash: p.cash,
      wanted: p.wanted,
      health: Math.round(p.health),
      x: Math.round(p.car ? p.car.x : p.x),
      y: Math.round(p.car ? p.car.y : p.y),
    };
  }

  function frame() {
    requestAnimationFrame(frame);
    if (done) {
      renderer.draw(world, screen, ui());
      return;
    }
    for (let i = 0; i < BOT_SPEED; i += 1) {
      const events = world.step(STEP, bot.update(STEP));
      steps += 1;
      if (events & EVENT_JOB) {
        screen = (events & EVENT_STORY) ? SCREEN_STORY : SCREEN_COMPLETE;
        audio.sfx('complete');
        finish((events & EVENT_STORY) ? 'story' : 'complete');
        break;
      }
      if (events & EVENT_BUSTED) {
        screen = SCREEN_BUSTED;
        finish('busted');
        break;
      }
      if (events & EVENT_WRECKED) {
        screen = SCREEN_WRECKED;
        finish('wrecked');
        break;
      }
      if (events & EVENT_FAILED) {
        finish('failed');
        break;
      }
      if (world.time > 300) {
        finish('timeout');
        break;
      }
    }
    if (world.player.health < lastHealth) audio.sfx('crash');
    lastHealth = world.player.health;
    renderer.draw(world, screen, ui());
  }
  requestAnimationFrame(frame);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let lastHealth = world.player.health;

  function announce(message) {
    status.textContent = message;
  }

  function startJob(index) {
    world.reset(index);
    screen = SCREEN_PLAY;
    announce(`Job ${index + 1} of 5: ${world.missionsApi.job().title}.`);
  }

  function nextJobOrRoam() {
    if (world.jobsDone < 5) startJob(world.jobsDone);
    else {
      world.reset();
      screen = SCREEN_PLAY;
      announce('Free roam. Neon Bay is yours.');
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    input.enter = !!(actions & ACTION_ENTER);
    if (actions & ACTION_RADIO) audio.nextStation();
    if (actions & ACTION_MUTE) audio.setMuted(!audio.muted);
    if (actions & ACTION_CONFIRM) {
      audio.ensure();
      if (screen === SCREEN_TITLE) nextJobOrRoam();
      else if (screen === SCREEN_BUSTED || screen === SCREEN_WRECKED || screen === SCREEN_FAILED) {
        startJob(world.missions.jobIndex);
      } else if (screen === SCREEN_COMPLETE) nextJobOrRoam();
      else if (screen === SCREEN_STORY) {
        world.reset();
        screen = SCREEN_PLAY;
      } else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    const events = world.step(STEP, input);
    if (world.player.health < lastHealth) audio.sfx('crash');
    lastHealth = world.player.health;
    if (events & EVENT_PACKAGE) audio.sfx('pickup');
    if (events & EVENT_JOB) {
      audio.sfx('complete');
      screen = (events & EVENT_STORY) ? SCREEN_STORY : SCREEN_COMPLETE;
    } else if (events & EVENT_BUSTED) {
      audio.sfx('busted');
      screen = SCREEN_BUSTED;
    } else if (events & EVENT_WRECKED) {
      audio.sfx('crash');
      screen = SCREEN_WRECKED;
    } else if (events & EVENT_FAILED) {
      screen = SCREEN_FAILED;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    const p = world.player;
    audio.setEngine(p.car ? Math.abs(p.car.speed) / 545 : 0, !!p.car);
    audio.setSiren(world.cops.length > 0 && p.wanted > 0);
    renderer.draw(world, screen, ui());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Bay, Sunset Getaway. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else if (botMode) runBot();
else runGame();
