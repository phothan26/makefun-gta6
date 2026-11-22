// The story: five jobs for Mara Voss, getaway driver of Neon Bay. A job is a list of
// steps; a step is a place to reach, a fare to carry, a car to tail, or an escape.
// The mission object owns the job state and the objective the HUD and the bot steer by.
import { LANDMARKS } from './config.js';

export const JOBS = [
  {
    title: 'THE INTERVIEW', pay: 400, startClock: 0.15,
    brief: "Dante Cole has work for a driver fresh out of prison. Meet him, then run his first errand.",
    steps: [
      { type: 'goto', x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, label: "Meet Dante at Dante's Garage" },
      { type: 'pickup', x: LANDMARKS.museum.x, y: LANDMARKS.museum.y, label: 'Pick up the package at the Neon Museum', wait: 1.5 },
      { type: 'dropoff', x: LANDMARKS.hotel.x, y: LANDMARKS.hotel.y, label: 'Deliver it to Hotel Miramar' },
    ],
  },
  {
    title: 'GOLDEN HOUR RUN', pay: 600, startClock: 0.42, timer: 150,
    brief: 'Three checkpoints across the city before the sun drops into the bay. The clock is the boss.',
    steps: [
      { type: 'goto', x: 2600, y: 600, label: 'Checkpoint 1 — North Avenue' },
      { type: 'goto', x: 600, y: 1800, label: 'Checkpoint 2 — Southside' },
      { type: 'goto', x: 3000, y: 2200, label: 'Checkpoint 3 — Beachfront' },
    ],
  },
  {
    title: 'FARE PLAY', pay: 500, startClock: 0.5,
    brief: 'Dante needs a cab for the night. Three fares, three corners of Neon Bay. Tips follow style.',
    steps: [
      { type: 'fare', px: 1000, py: 1400, dx: 2200, dy: 600, label: 'Fare 1 — pick up, then drop off' },
      { type: 'fare', px: 2200, py: 1800, dx: 600, dy: 2200, label: 'Fare 2 — pick up, then drop off' },
      { type: 'fare', px: 1800, py: 600, dx: 2600, dy: 1400, label: 'Fare 3 — pick up, then drop off' },
    ],
  },
  {
    title: 'COLD TRAIL', pay: 700, startClock: 0.62,
    brief: "A courier is moving Dante's money. Follow him for 25 seconds — close enough to see, far enough not to be seen.",
    steps: [
      { type: 'tail', label: 'Tail the courier — stay close, stay unseen', duration: 25 },
    ],
  },
  {
    title: 'SUNSET GETAWAY', pay: 1200, startClock: 0.82,
    brief: 'The last job. Grab the loot at the Pier Warehouse, then lose the whole NBPD on the way to the pier.',
    steps: [
      { type: 'pickup', x: LANDMARKS.warehouse.x, y: LANDMARKS.warehouse.y, label: 'Grab the loot at the Pier Warehouse', wait: 2, wanted: 3 },
      { type: 'escape', x: LANDMARKS.pier.x, y: LANDMARKS.pier.y, label: 'Reach the end of the pier' },
    ],
  },
];

const ARRIVE = 72;

export function createMissions(world) {
  const state = {
    jobIndex: 0, stepIndex: 0, status: 'idle', // idle | active | complete | failed | story
    timer: 0, stepTimer: 0, progress: 0, phase: 'pickup',
    lastComplete: null, courier: null,
  };

  function job() {
    return JOBS[state.jobIndex];
  }

  function step() {
    return job().steps[state.stepIndex];
  }

  function startJob(index) {
    state.jobIndex = index;
    state.stepIndex = 0;
    state.status = 'active';
    state.timer = job().timer ?? 0;
    state.stepTimer = 0;
    state.progress = 0;
    state.phase = 'pickup';
    state.courier = null;
    state.lastComplete = null;
    world.clock = job().startClock;
    if (job().steps[0].type === 'tail') state.courier = world.spawnCourier();
    world.announce(job().title);
  }

  function fail() {
    state.status = 'failed';
  }

  function completeJob() {
    const pay = Math.round(job().pay * (1 + world.player.style / 200));
    world.player.cash += pay;
    state.lastComplete = { title: job().title, pay, index: state.jobIndex };
    state.status = state.jobIndex === JOBS.length - 1 ? 'story' : 'complete';
    world.saveProgress();
    return pay;
  }

  function advanceStep() {
    state.stepIndex += 1;
    state.stepTimer = 0;
    state.progress = 0;
    state.phase = 'pickup';
    if (state.stepIndex >= job().steps.length) completeJob();
    else if (step().type === 'tail') state.courier = world.spawnCourier();
  }

  /** The current objective for the HUD arrow, the minimap and the bot. */
  function objective() {
    if (state.status !== 'active') return null;
    const s = step();
    if (s.type === 'goto' || s.type === 'pickup' || s.type === 'dropoff' || s.type === 'escape') {
      return { label: s.label, x: s.x, y: s.y };
    }
    if (s.type === 'fare') {
      return state.phase === 'pickup'
        ? { label: `${s.label} — pick up here`, x: s.px, y: s.py }
        : { label: `${s.label} — drop off here`, x: s.dx, y: s.dy };
    }
    if (s.type === 'tail' && state.courier) {
      return { label: s.label, x: state.courier.x, y: state.courier.y, moving: true };
    }
    return null;
  }

  function playerPos() {
    const p = world.player;
    return p.car ? { x: p.car.x, y: p.car.y } : { x: p.x, y: p.y };
  }

  function near(x, y, r = ARRIVE) {
    const pos = playerPos();
    const dx = pos.x - x;
    const dy = pos.y - y;
    return dx * dx + dy * dy < r * r;
  }

  function update(dt) {
    if (state.status !== 'active') return;
    if (state.timer > 0) {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.timer = 0;
        fail();
        return;
      }
    }
    const s = step();
    if (s.type === 'goto' || s.type === 'dropoff' || s.type === 'escape') {
      if (near(s.x, s.y)) advanceStep();
      return;
    }
    if (s.type === 'pickup') {
      if (near(s.x, s.y)) {
        state.stepTimer += dt;
        if (state.stepTimer >= (s.wait ?? 1.5)) {
          if (s.wanted) world.setWanted(s.wanted);
          advanceStep();
        }
      } else state.stepTimer = 0;
      return;
    }
    if (s.type === 'fare') {
      if (state.phase === 'pickup') {
        if (near(s.px, s.py)) {
          state.stepTimer += dt;
          if (state.stepTimer >= 1.5) {
            state.phase = 'dropoff';
            state.stepTimer = 0;
          }
        } else state.stepTimer = 0;
      } else if (near(s.dx, s.dy)) advanceStep();
      return;
    }
    if (s.type === 'tail') {
      const c = state.courier;
      if (!c) return;
      const pos = playerPos();
      const d = Math.hypot(c.x - pos.x, c.y - pos.y);
      if (d > 70 && d < 300) {
        state.progress += dt;
        state.stepTimer = 0;
        if (state.progress >= s.duration) advanceStep();
      } else if (d <= 70) {
        state.stepTimer += dt;
        if (state.stepTimer > 3) {
          state.progress = 0;
          state.stepTimer = 0;
          world.setWanted(Math.min(5, world.player.wanted + 1));
        }
      } else {
        state.progress = Math.max(0, state.progress - dt * 0.5);
      }
    }
  }

  return { state, job, step, startJob, fail, completeJob, objective, update };
}
