// Browser entry for Vice Harbor. Wires the simulation, the renderer, the
// keyboard, the radio and the save together, and runs the game loop.
// Also supports ?shot=start|drive|chase|complete, which stages one of the
// four deterministic screenshot states and pauses the simulation there.
import { createGame, stepGame } from './world.js';
import { render } from './render.js';
import { makeInput, attachKeyboard, clearEdges } from './input.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave } from './save.js';
import { isWater } from './city.js';

function params() {
  const out = {};
  if (typeof location === 'undefined') return out;
  for (const [k, v] of new URLSearchParams(location.search)) out[k] = v;
  return out;
}

// Stage one of the four screenshot states. Each is built from a fixed
// seed and a fixed number of simulation steps, so the frame is identical
// every time it is staged.
function stageShot(game, shot) {
  const dt = 1 / 60;
  const input = makeInput();
  if (shot === 'start') {
    // Fresh game: Rook on foot at the Marina, golden hour, job one up.
    return;
  }
  if (shot === 'drive') {
    const car = game.city.cars[0];
    car.taken = true;
    game.player.vehicle = car;
    car.x = 700;
    car.y = 700;
    car.angle = 0;
    car.speed = 300;
    game.player.x = car.x;
    game.player.y = car.y;
    game.player.angle = 0;
    game.time = 170; // dusk
    game.dayT = 170 / 480;
    input.up = true;
    for (let i = 0; i < 60; i++) stepGame(game, input, dt);
    return;
  }
  if (shot === 'chase') {
    const car = game.city.cars[1];
    car.taken = true;
    game.player.vehicle = car;
    car.x = 1100;
    car.y = 1100;
    car.angle = Math.PI / 2;
    car.speed = 340;
    game.player.x = car.x;
    game.player.y = car.y;
    game.player.angle = Math.PI / 2;
    game.wanted = 2;
    game.heat = 60;
    game.time = 340; // night falling
    game.dayT = 340 / 480;
    game.police.push(
      { x: 900, y: 900, angle: 0.6, speed: 300, kind: 'car', lastX: 1100, lastY: 1100, searchT: 0, nearMissAt: -10 },
      { x: 1300, y: 1300, angle: -2.2, speed: 300, kind: 'car', lastX: 1100, lastY: 1100, searchT: 0, nearMissAt: -10 },
    );
    input.up = true;
    input.right = true;
    for (let i = 0; i < 90; i++) stepGame(game, input, dt);
    return;
  }
  if (shot === 'complete') {
    const boat = game.city.boats[0];
    boat.taken = true;
    game.player.vehicle = boat;
    boat.x = 2950;
    boat.y = 400;
    boat.angle = 0;
    boat.speed = 0;
    game.player.x = boat.x;
    game.player.y = boat.y;
    game.player.angle = 0;
    game.jobsDone = 5;
    game.jobIndex = game.jobs.length;
    game.stepIndex = 0;
    game.money = 5750;
    game.cratesGot = 12;
    game.allDone = true;
    game.over = true;
    game.banner = { text: 'ALL JOBS COMPLETE', sub: 'Vice Harbor is yours — $5750', t: 0, dur: 6 };
    game.time = 420; // night
    game.dayT = 420 / 480;
    return;
  }
}

export function boot(canvas) {
  const q = params();
  const seed = q.seed ? parseInt(q.seed, 10) || 7 : 7;
  const game = createGame(seed);
  const shot = q.shot || null;
  if (shot) stageShot(game, shot);

  // Resume a previous run unless this is a staged shot.
  if (!shot) {
    const save = loadSave();
    if (save && typeof save.money === 'number') {
      game.money = save.money;
      game.cratesGot = save.cratesGot || 0;
    }
  }

  const input = makeInput();
  const detach = attachKeyboard(input, typeof window !== 'undefined' ? window : null);
  const audio = createAudio();
  const ctx = canvas.getContext('2d');

  let last = 0;
  let acc = 0;
  let saveTimer = 0;
  const STEP = 1 / 60;

  function frame(ts) {
    const now = ts / 1000;
    if (!last) last = now;
    let dt = now - last;
    last = now;
    if (dt > 0.25) dt = 0.25;

    if (!shot) {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 5) {
        if (input.radio >= 0) {
          audio.start();
          audio.setStation(input.radio);
        }
        if (input.mute) audio.toggleMute();
        stepGame(game, input, STEP);
        clearEdges(input);
        acc -= STEP;
        n++;
      }
      // Audio follows the game, not the wall clock.
      const speedFrac = Math.abs(game.player.speed) / 430;
      audio.engine(speedFrac, isWater(game.player.x, game.player.y));
      let near = 1;
      for (const u of game.police) {
        const d = Math.hypot(u.x - game.player.x, u.y - game.player.y);
        near = Math.min(near, d / 600);
      }
      audio.siren(game.wanted > 0 ? near : 1);
      saveTimer += dt;
      if (saveTimer > 10) {
        saveTimer = 0;
        writeSave(game);
      }
    }

    render(ctx, game, { w: canvas.width, h: canvas.height });
    if (!shot) requestAnimationFrame(frame);
  }

  if (shot) {
    render(ctx, game, { w: canvas.width, h: canvas.height });
  } else {
    requestAnimationFrame(frame);
  }

  // The shots harness drives and inspects the game through this handle.
  const handle = { game, input, audio, canvas, detach };
  if (typeof window !== 'undefined') window.__game = handle;
  return handle;
}

if (typeof document !== 'undefined') {
  const canvas = document.getElementById('game');
  if (canvas) boot(canvas);
}
