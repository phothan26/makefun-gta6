// The five story jobs. A job is a list of steps; each step names what the
// player must do and where. The simulation calls checkStep every frame:
// it returns true the moment the step is done. Steps carry their own
// progress (hold timers) so the same definition can run many times.
import { JOBS, SPOTS } from './config.js';

function step(type, x, y, r, text, extra) {
  return Object.assign({ type, x, y, r, text, vehicle: 'any', hold: 0, progress: 0 }, extra || {});
}

export function buildJobs() {
  return [
    {
      ...JOBS[0],
      steps: [
        step('goto', 2090, 900, 60, 'Pick up the package at the Fish Dock'),
        step('collect', 2090, 900, 55, 'Grab the package', { hold: 0.8 }),
        step('goto', 700, 1500, 70, 'Deliver to the garage on 15th', { vehicle: 'car' }),
      ],
    },
    {
      ...JOBS[1],
      steps: [
        step('enter', 2100, 1400, 90, 'Take a boat from the Marina', { vehicle: 'boat' }),
        step('collect', 2500, 700, 55, 'Fish out the first floating crate', { vehicle: 'boat', hold: 0.6 }),
        step('collect', 2800, 1300, 55, 'Fish out the second floating crate', { vehicle: 'boat', hold: 0.6 }),
        step('collect', 2450, 1900, 55, 'Fish out the third floating crate', { vehicle: 'boat', hold: 0.6 }),
        step('goto', SPOTS.cove.x, SPOTS.cove.y, 80, 'Deliver to the hidden cove', { vehicle: 'boat' }),
      ],
    },
    {
      ...JOBS[2],
      steps: [
        step('enter', 0, 0, 0, 'Get in a car', { vehicle: 'car' }),
        step('goto', 1500, 300, 70, 'Reach the checkpoint — it is going loud', { vehicle: 'car' }),
        step('hide', SPOTS.safehouse.x, SPOTS.safehouse.y, SPOTS.safehouse.r, 'Lose the heat — the safehouse is the only clean exit'),
      ],
    },
    {
      ...JOBS[3],
      steps: [
        step('goto', 1100, 1900, 70, 'Reach the alley off 19th', { vehicle: 'car' }),
        step('goto', 1150, 1950, 45, 'Get out and reach your driver', { vehicle: 'foot' }),
        step('goto', SPOTS.clinic.x, SPOTS.clinic.y, 70, 'Drive them to the clinic', { vehicle: 'car' }),
      ],
    },
    {
      ...JOBS[4],
      steps: [
        step('goto', 2100, 1400, 70, 'Drive to the Marina', { vehicle: 'car' }),
        step('enter', 2200, 1400, 120, 'Take the boat', { vehicle: 'boat' }),
        step('goto', SPOTS.extraction.x, SPOTS.extraction.y, 90, 'Reach the extraction point', { vehicle: 'boat' }),
      ],
    },
  ];
}

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function vehicleMatches(game, want) {
  if (want === 'any') return true;
  if (want === 'foot') return game.player.vehicle === null;
  return game.player.vehicle !== null && game.player.vehicle.kind === want;
}

// One frame of step checking. Returns 'done' when the step completes,
// 'active' otherwise. May mutate game (e.g. the checkpoint going loud).
export function checkStep(game, job, step, dt) {
  const p = game.player;
  if (step.type === 'enter') {
    if (p.vehicle !== null && p.vehicle.kind === step.vehicle) return 'done';
    return 'active';
  }
  if (step.type === 'hide') {
    // The step completes once the heat is fully gone. The safehouse is
    // the reliable way there, but any escape counts.
    if (game.wanted === 0) return 'done';
    return 'active';
  }
  // goto / collect / deliver: need to be at the marker, in the right vehicle.
  if (!vehicleMatches(game, step.vehicle)) return 'active';
  const d = dist(p.x, p.y, step.x, step.y);
  if (d > step.r) {
    step.progress = 0;
    return 'active';
  }
  if (step.type === 'goto') {
    if (job.id === 'golden-hour-run' && step.text.indexOf('checkpoint') !== -1) {
      // The pickup went loud: the moment Rook reaches the checkpoint,
      // two stars of heat land on him and the police roll in.
      if (game.wanted < 2) {
        game.wanted = 2;
        game.heat = Math.max(game.heat, 55);
        game.events.push('The pickup went loud — two stars!');
      }
    }
    return 'done';
  }
  // collect: hold still on the marker for the hold time.
  step.progress += dt;
  if (step.progress >= step.hold) {
    step.progress = 0;
    return 'done';
  }
  return 'active';
}

export function currentJob(game) {
  return game.jobs[game.jobIndex] || null;
}

export function currentStep(game) {
  const job = currentJob(game);
  if (!job) return null;
  return job.steps[game.stepIndex] || null;
}

// Advance the job tracker by one frame. Returns the name of a job that
// was just completed, or null.
export function advanceJobs(game, dt) {
  const job = currentJob(game);
  if (!job) return null;
  const s = job.steps[game.stepIndex];
  if (!s) return null;
  if (checkStep(game, job, s, dt) === 'done') {
    game.stepIndex++;
    if (game.stepIndex >= job.steps.length) {
      game.money += job.reward;
      game.jobsDone++;
      game.jobIndex++;
      game.stepIndex = 0;
      game.events.push(job.name + ' complete — $' + job.reward);
      game.banner = { text: job.name + ' COMPLETE', sub: '+$' + job.reward, t: 0, dur: 3 };
      return job.name;
    }
  }
  return null;
}
