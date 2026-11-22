// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. The game moves between screens — title,
// how-to, briefing, play, paused, complete, failed and busted — and a save in
// localStorage carries progress between visits.
//
// ?seed=N fixes the city and every roll. ?shot=start|play|chase|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. ?bot=1&job=N plays job N with the autopilot
// and reports window.__botResult when it finishes or times out.
import { createRandom } from './random.js';
import { buildCity } from './city.js';
import { createAudio } from './audio.js';
import { CAR, PALETTE, STEP, TIME, WORLD } from './config.js';
import { createCar, separateCars, updateCops, updateTraffic } from './vehicles.js';
import { createPed, updateFootCops, updatePeds } from './pedestrians.js';
import { createPlayer, penalise, updatePlayer } from './player.js';
import {
  JOBS, continueAfterJob, createMissions, currentObjective, failJob,
  startJob, updateMissions, updatePolicePresence,
} from './missions.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_JOB, ACTION_MUTE, ACTION_PAUSE,
  ACTION_PUNCH, ACTION_RADIO, createInput,
} from './input.js';
import { createRenderer, SCREEN_BRIEF, SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_FAILED, SCREEN_HOWTO, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, nightFactor } from './render.js';
import { createSave } from './save.js';
import { autopilot, runAutopilot, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const botParam = params.get('bot');
const botJob = Number.parseInt(params.get('job') ?? '0', 10);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const save = createSave();
const audio = createAudio();
// Restore the player's sound preferences from the save.
if (save.muted) audio.toggleMute();
for (let i = 0; i < (save.radio || 0); i += 1) audio.nextStation();

function createWorld(seedValue) {
  const rng = createRandom(seedValue);
  const city = buildCity(rng);
  const world = {
    rng,
    city,
    seed: seedValue,
    time: 0.1 * TIME.cycleSeconds,
    dayT: 0.1,
    nightFactor: 0,
    player: createPlayer(city.spawn),
    traffic: [],
    parked: [],
    cops: [],
    footCops: [],
    peds: [],
    missions: createMissions(),
    particles: [],
    popups: [],
    events: [],
    objective: null,
    camera: { x: city.spawn.x, y: city.spawn.y, zoom: 1 },
    shake: 0,
    shakeX: 0,
    shakeY: 0,
    audio,
    save,
    bot: { polyline: [], key: '', stuck: 0, reverse: 0, lastX: city.spawn.x, lastY: city.spawn.y },
  };
  // Traffic on the roads, parked cars at the kerb, people on the pavements.
  for (let i = 0; i < 10; i += 1) {
    const node = rng.pick(city.nodes);
    const car = createCar({
      x: node.x + rng.range(-30, 30), y: node.y + rng.range(-30, 30),
      angle: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
      kind: 'sedan', owner: 'traffic',
    });
    car.route = [];
    world.traffic.push(car);
  }
  for (const spot of city.parkedSpots) {
    const kind = rng.chance(0.14) ? 'taxi' : rng.pick(['sedan', 'sedan', 'sports', 'van']);
    const car = createCar({
      x: spot.x, y: spot.y, angle: spot.angle, kind,
      color: kind === 'taxi' ? PALETTE.taxi : null, owner: 'parked',
    });
    world.parked.push(car);
  }
  for (let i = 0; i < 24; i += 1) world.peds.push(createPed(rng, city));
  // Restore progress: cash, collected packages, best style.
  world.player.cash = save.cash;
  world.player.styleBest = save.bestStyle;
  for (const id of save.packages) {
    if (city.packages[id]) city.packages[id].taken = true;
  }
  return world;
}

const world = createWorld(seed);
const renderer = createRenderer(canvas);

/** One fixed step of the simulation, driven by `input`. */
function stepWorld(input) {
  world.time += STEP;
  world.dayT = (world.time / TIME.cycleSeconds) % 1;
  world.nightFactor = nightFactor(world.dayT);
  updatePlayer(world, input, STEP);
  updateTraffic(world, STEP);
  updateCops(world, STEP);
  updatePeds(world, STEP);
  updateFootCops(world, STEP);
  updatePolicePresence(world, STEP);
  updateMissions(world, STEP);
  separateCars(world.traffic.concat(world.cops, world.parked, world.player.car ? [world.player.car] : []));
  world.objective = currentObjective(world);
  // Particles and popups age out.
  for (const p of world.particles) p.life -= STEP * 2;
  world.particles = world.particles.filter((p) => p.life > 0);
  for (const p of world.popups) { p.life -= STEP * 0.7; p.y -= 22 * STEP; }
  world.popups = world.popups.filter((p) => p.life > 0);
  // Camera follows the player, pulling back as the car goes faster.
  const targetZoom = world.player.car ? 0.92 - Math.min(0.14, Math.abs(world.player.car.speed) / 4000) : 1;
  world.camera.zoom += (targetZoom - world.camera.zoom) * 0.04;
  world.camera.x += (world.player.x - world.camera.x) * 0.08;
  world.camera.y += (world.player.y - world.camera.y) * 0.08;
  world.shake = Math.max(0, world.shake - STEP * 2.2);
  world.shakeX = world.shake > 0 ? (world.rng.next() - 0.5) * world.shake * 14 : 0;
  world.shakeY = world.shake > 0 ? (world.rng.next() - 0.5) * world.shake * 14 : 0;
  handleEvents();
}

function popup(text, color) {
  world.popups.push({ x: world.player.x, y: world.player.y - 40, text, life: 1.6, color });
}

/** Turn the simulation's events into sound, popups and camera shake. */
function handleEvents() {
  let busted = false;
  for (const event of world.events) {
    if (event.type === 'crash') {
      world.shake = event.hard ? 1 : 0.5;
      audio.sfx('crash');
    } else if (event.type === 'rammed') {
      world.shake = 0.7;
      world.player.health = Math.max(0, world.player.health - 2);
    } else if (event.type === 'hitPed') {
      audio.sfx('crash');
      popup('PEDESTRIAN DOWN  +1★', '#ff3b30');
    } else if (event.type === 'carjack') {
      popup('CARJACKED  +1★', '#ff3b30');
    } else if (event.type === 'swap') {
      popup('SWAP & VANISH  −1★', '#2ecc71');
    } else if (event.type === 'nearmiss') {
      popup('NEAR MISS  +10', '#ffe600');
    } else if (event.type === 'stunt') {
      popup('STUNT  +25', '#ff2e88');
    } else if (event.type === 'ramp') {
      popup('AIR!', '#ff6b35');
    } else if (event.type === 'package') {
      audio.sfx('pickup');
      popup('+$50  NEON PACKAGE', '#ff2e88');
      if (typeof event.id === 'number' && !world.save.packages.includes(event.id)) {
        world.save.packages.push(event.id);
        world.save.write();
      }
    } else if (event.type === 'fare') {
      popup('FARE PICKED UP', '#ffd60a');
    } else if (event.type === 'fareDone') {
      popup('FARE PAID', '#ffd60a');
    } else if (event.type === 'punch') {
      audio.sfx('punch');
    } else if (event.type === 'enter' || event.type === 'exit') {
      audio.sfx('enter');
    } else if (event.type === 'cooldown') {
      popup('HEAT COOLING  −1★', '#2ecc71');
    } else if (event.type === 'busted') {
      // A foot cop held the player long enough: one bust per frame, at most.
      busted = true;
    }
  }
  world.events = [];
  if (busted) {
    const lost = penalise(world);
    world.save.cash = world.player.cash;
    world.save.write();
    if (world.missions.status === 'active') failJob(world, 'Busted by the NBPD. The job is over.');
    showBusted('BUSTED', 'The NBPD caught up with you.', lost);
  }
  if (world.player.health <= 0) {
    const lost = penalise(world);
    world.save.cash = world.player.cash;
    world.save.write();
    if (world.missions.status === 'active') failJob(world, 'Wasted. The job is over.');
    showBusted('WASTED', 'You woke up at St. Marina with a headache and a bill.', lost);
  }
}

// ---- Screens and menus ----------------------------------------------------

let screen = SCREEN_TITLE;
let selected = 0;
let briefJob = 0;
let bustedInfo = { title: 'BUSTED', line: '', lost: 0 };
let buttons = [];

function announce(message) {
  status.textContent = message;
}

function showBusted(title, line, lost) {
  bustedInfo = { title, line, lost };
  screen = SCREEN_BUSTED;
  selected = 0;
  announce(`${title}. ${line}`);
}

function titleLabels() {
  const labels = [];
  if (save.unlockedJob > 0 || save.cash > 0) labels.push('CONTINUE');
  labels.push('NEW GAME');
  if (save.unlockedJob > 0) labels.push(`JOBS — ${save.unlockedJob} of ${JOBS.length} done`);
  labels.push('HOW TO PLAY');
  return labels;
}

function titleAction(label) {
  if (label === 'CONTINUE') {
    screen = SCREEN_PLAY;
    announce('Free roam. Press J for the next job.');
  } else if (label === 'NEW GAME') {
    save.clear();
    world.player.cash = 0;
    world.player.styleBest = 0;
    for (const pkg of world.city.packages) pkg.taken = false;
    briefJob = 0;
    screen = SCREEN_BRIEF;
    selected = 0;
    startJob(world, 0);
  } else if (label.startsWith('JOBS')) {
    briefJob = Math.min(save.unlockedJob, JOBS.length - 1);
    screen = SCREEN_BRIEF;
    selected = 0;
    startJob(world, briefJob);
  } else if (label === 'HOW TO PLAY') {
    screen = SCREEN_HOWTO;
    selected = 0;
  }
}

function startJobFromBrief() {
  world.missions.status = 'active';
  screen = SCREEN_PLAY;
  announce(`${JOBS[briefJob].title}. ${currentObjective(world)?.label ?? ''}`);
}

function handleMenuKeys(actions, labels, onPick) {
  if (actions & ACTION_CONFIRM) {
    onPick(labels[selected]);
    return true;
  }
  return false;
}

function moveSelection(actions, count) {
  // Edge-triggered: holding a key scrolls once, not every frame.
  const down = lastInput.down && !prevDir.down;
  const up = lastInput.up && !prevDir.up;
  if (down) selected = (selected + 1) % count;
  if (up) selected = (selected - 1 + count) % count;
  void actions;
}

let lastInput = { up: false, down: false, left: false, right: false, handbrake: false, run: false };
let prevDir = { up: false, down: false };

function runGame() {
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dtFrame = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += dtFrame;
    const dir = input.direction();
    prevDir = { up: lastInput.up, down: lastInput.down };
    lastInput = dir;
    const actions = input.takeActions();
    const click = input.takeClick();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      save.muted = muted;
      save.write();
    }
    if (actions & ACTION_RADIO) {
      const station = audio.nextStation();
      save.radio = STATIONS.indexOf(station);
      save.write();
    }

    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        selected = 0;
        announce('Paused.');
      } else if (actions & ACTION_JOB && world.missions.status !== 'active' && save.unlockedJob < JOBS.length) {
        briefJob = save.unlockedJob;
        screen = SCREEN_BRIEF;
        selected = 0;
        startJob(world, briefJob);
      } else {
        while (accumulator >= STEP) {
          stepWorld({
            up: dir.up, down: dir.down, left: dir.left, right: dir.right,
            handbrake: dir.handbrake, run: dir.run,
            enterCar: !!(actions & ACTION_ENTER),
            punch: !!(actions & ACTION_PUNCH),
          });
          accumulator -= STEP;
          if (world.missions.status === 'complete') {
            screen = SCREEN_COMPLETE;
            selected = 0;
            announce(`Job complete. Payout $${world.missions.lastPayout}.`);
            break;
          }
          if (world.missions.status === 'failed') {
            screen = SCREEN_FAILED;
            selected = 0;
            announce('Job failed.');
            break;
          }
          if (screen === SCREEN_BUSTED) break;
        }
        audio.update(STEP, {
          driving: !!world.player.car,
          speed: world.player.car ? world.player.car.speed : 0,
          maxSpeed: CAR.maxSpeed,
          wanted: world.player.wanted,
        });
      }
    } else if (screen === SCREEN_TITLE) {
      // The title screen's city keeps panning: advance time, not the sim.
      world.time += dtFrame * 2;
      world.dayT = (world.time / TIME.cycleSeconds) % 1;
      world.nightFactor = nightFactor(world.dayT);
      const labels = titleLabels();
      moveSelection(actions, labels.length);
      handleMenuKeys(actions, labels, titleAction);
      if (click.clicked) {
        for (let i = 0; i < buttons.length; i += 1) {
          const b = buttons[i];
          if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
            titleAction(b.id);
            break;
          }
        }
      }
    } else {
      // Menu screens: up/down to move, Enter or click to pick.
      accumulator = 0;
      const labels = menuLabels();
      moveSelection(actions, labels.length);
      if (actions & ACTION_CONFIRM) pickMenu(labels[selected]);
      if (click.clicked) {
        for (let i = 0; i < buttons.length; i += 1) {
          const b = buttons[i];
          if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
            pickMenu(b.id);
            break;
          }
        }
      }
      if (screen === SCREEN_PAUSED && (actions & ACTION_PAUSE)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }

    const ui = {
      selected,
      jobIndex: briefJob,
      hasSave: save.unlockedJob > 0 || save.cash > 0,
      unlockedJob: save.unlockedJob,
      bestStyle: Math.max(save.bestStyle, Math.floor(world.player.styleBest)),
      cash: world.player.cash,
      radio: audio.stationName(),
      muted: save.muted,
      bustedTitle: bustedInfo.title,
      bustedLine: bustedInfo.line,
      bustedLost: bustedInfo.lost,
    };
    buttons = renderer.draw(world, screen, ui);
    // Keep the save's best style honest.
    if (Math.floor(world.player.styleBest) > save.bestStyle) {
      save.bestStyle = Math.floor(world.player.styleBest);
      save.write();
    }
  }

  function menuLabels() {
    if (screen === SCREEN_BRIEF) return ['START JOB', 'BACK'];
    if (screen === SCREEN_COMPLETE) return ['CONTINUE'];
    if (screen === SCREEN_FAILED) return ['RETRY JOB', 'FREE ROAM'];
    if (screen === SCREEN_BUSTED) return ['BACK TO THE STREETS'];
    if (screen === SCREEN_PAUSED) return ['RESUME', 'RESTART JOB', 'QUIT TO TITLE'];
    if (screen === SCREEN_HOWTO) return ['BACK'];
    return [];
  }

  function pickMenu(label) {
    if (label === 'START JOB') startJobFromBrief();
    else if (label === 'BACK') { screen = SCREEN_TITLE; selected = 0; }
    else if (label === 'CONTINUE') {
      continueAfterJob(world, true);
      screen = SCREEN_PLAY;
      announce('Free roam. Press J for the next job.');
    } else if (label === 'RETRY JOB') {
      startJob(world, briefJob);
      world.missions.status = 'active';
      screen = SCREEN_PLAY;
    } else if (label === 'FREE ROAM') {
      continueAfterJob(world, false);
      screen = SCREEN_PLAY;
    } else if (label === 'BACK TO THE STREETS') {
      if (world.missions.status === 'failed') screen = SCREEN_FAILED;
      else screen = SCREEN_PLAY;
      selected = 0;
    } else if (label === 'RESUME') screen = SCREEN_PLAY;
    else if (label === 'RESTART JOB') {
      if (world.missions.status === 'active' || world.missions.jobIndex >= 0) {
        startJob(world, world.missions.jobIndex);
        world.missions.status = 'active';
      }
      screen = SCREEN_PLAY;
    } else if (label === 'QUIT TO TITLE') {
      screen = SCREEN_TITLE;
      selected = 0;
    }
  }

  // Leaving the tab pauses a running game.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      selected = 0;
      announce('Paused.');
    }
  });

  announce('Neon Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

// ---- Screenshot and bot modes ---------------------------------------------

function runShot(name) {
  const scene = stageShot(name, world, (input) => stepWorld(input));
  screen = scene;
  let painted = 0;
  function paint() {
    const ui = {
      selected: 0,
      jobIndex: briefJob,
      hasSave: false,
      unlockedJob: save.unlockedJob,
      bestStyle: 0,
      cash: world.player.cash,
      radio: audio.stationName(),
      muted: true,
    };
    buttons = renderer.draw(world, screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runBot() {
  const job = Number.isInteger(botJob) && botJob >= 0 && botJob < JOBS.length ? botJob : 0;
  startJob(world, job);
  world.missions.status = 'active';
  const startedAt = world.time;
  let steps = 0;
  const maxSteps = Math.floor(260 / STEP);
  function chunk() {
    const end = Math.min(steps + 600, maxSteps);
    while (steps < end) {
      stepWorld(autopilot(world));
      steps += 1;
      if (world.missions.status === 'complete' || world.missions.status === 'failed') break;
    }
    if (world.missions.status === 'complete' || world.missions.status === 'failed' || steps >= maxSteps) {
      window.__botResult = {
        job,
        status: world.missions.status,
        simSeconds: Math.round((world.time - startedAt) * 10) / 10,
        steps,
        cash: world.player.cash,
        wanted: world.player.wanted,
        health: Math.round(world.player.health),
        x: Math.round(world.player.x),
        y: Math.round(world.player.y),
      };
      return;
    }
    setTimeout(chunk, 0);
  }
  chunk();
}

const STATIONS = ['SUNSET FM', 'BAY LO-FI', 'CHASE 104'];

// Debug handle for the playtest harness: the live world and screen.
window.__game = { world, get screen() { return screen; } };

if (shot) runShot(shot);
else if (botParam) runBot();
else runGame();
