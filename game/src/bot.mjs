// NEON RAIN — Midnight Courier: the autopilot bot.
// Drives Juno through all five courier jobs on its own: walks to a parked
// car, follows the road graph to each pickup and dropoff, tucks in behind
// traffic to charge the Slipstream meter, and fires it to shake the police.
// Pure and deterministic: same seed, same drive, same result.

import { createGame, stepGame, objectiveOf, nearestVehicle, currentJob } from './sim.mjs';
import { bfsPath } from './city.mjs';
import { wrapAngle, clamp, dist } from './rng.mjs';

function nearestNode(graph, x, y) {
  return graph.indexOf(x, y);
}

function planRoute(state, fromX, fromY, toNode) {
  const from = nearestNode(state.graph, fromX, fromY);
  const nodes = bfsPath(state.graph, from, toNode);
  return nodes.map((n) => state.graph.nodes[n]);
}

export function createBot() {
  return {
    route: [], wp: 0, targetKind: '',
    stuckTimer: 0, lastX: 0, lastY: 0, reverseTimer: 0,
    followTraffic: null, followTimer: 0,
  };
}

// The traffic car ahead worth tucking behind, if any.
function slipTarget(state) {
  const p = state.player;
  if (p.mode === 'foot' || p.slip >= 99) return null;
  let best = null;
  let bd = 150;
  for (const t of state.traffic) {
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d >= bd || d < 20) continue;
    const dot = (dx * Math.cos(p.angle) + dy * Math.sin(p.angle)) / d;
    if (dot < 0.45) continue;
    bd = d;
    best = t;
  }
  return best;
}

export function botInput(state, bot) {
  const p = state.player;
  const input = { up: false, down: false, left: false, right: false, enter: false, slip: false };
  if (state.status === 'complete') return input;

  // Fire a full Slipstream meter: it ghosts the police when the heat is on,
  // and it is a free burst of speed even when the streets are quiet.
  if (p.slip >= 99 && p.mode !== 'foot') {
    input.slip = true;
    return input;
  }

  const obj = objectiveOf(state);
  let tx;
  let ty;
  let targetKind = 'objective';

  if (p.mode === 'foot') {
    // Walk to the nearest parked car (a bike only when no car is near).
    const car = nearestVehicle(state, p.x, p.y, 1e9);
    const bike = state.vehicles.find((v) => v.parked && v.kind === 'bike');
    let v = car;
    if ((!car || dist(p.x, p.y, car.x, car.y) > 800) && bike) {
      const bd = bike ? dist(p.x, p.y, bike.x, bike.y) : 1e9;
      const cd = car ? dist(p.x, p.y, car.x, car.y) : 1e9;
      if (bd + 300 < cd) v = bike;
    }
    if (v) {
      tx = v.x; ty = v.y; targetKind = 'vehicle';
      if (dist(p.x, p.y, v.x, v.y) < 46) { input.enter = true; return input; }
    } else if (obj) {
      tx = obj.x; ty = obj.y;
    } else {
      return input;
    }
  } else if (obj) {
    tx = obj.x; ty = obj.y;
  } else {
    return input;
  }

  // Re-plan the road route when the target changed or the route ran out.
  const key = `${targetKind}:${Math.round(tx)},${Math.round(ty)}`;
  if (bot.targetKind !== key || bot.wp >= bot.route.length) {
    bot.targetKind = key;
    const toNode = nearestNode(state.graph, tx, ty);
    bot.route = planRoute(state, p.x, p.y, toNode);
    bot.wp = 0;
  }

  // Follow the route; the last waypoint is the target itself. Advance past a
  // waypoint when we reach it — or when the next one is already closer, so
  // a wide turn never leaves the courier orbiting one intersection.
  let wx = tx;
  let wy = ty;
  if (bot.wp < bot.route.length) {
    wx = bot.route[bot.wp].x;
    wy = bot.route[bot.wp].y;
    let advance = dist(p.x, p.y, wx, wy) < 46;
    if (!advance && bot.wp + 1 < bot.route.length) {
      const n2 = bot.route[bot.wp + 1];
      if (dist(p.x, p.y, n2.x, n2.y) < dist(p.x, p.y, wx, wy) - 10) advance = true;
    }
    if (advance) {
      bot.wp++;
      if (bot.wp < bot.route.length) {
        wx = bot.route[bot.wp].x;
        wy = bot.route[bot.wp].y;
      }
    }
  }

  // Opportunistic slipstream: tuck behind traffic heading our way when the
  // job is not urgent and the heat is on.
  if (bot.followTimer > 0) {
    bot.followTimer--;
    const t = bot.followTraffic;
    if (t && p.mode !== 'foot') {
      wx = t.x - Math.cos(t.angle) * 70;
      wy = t.y - Math.sin(t.angle) * 70;
      if (p.slip >= 99 || dist(p.x, p.y, t.x, t.y) > 150) bot.followTimer = 0;
    } else {
      bot.followTimer = 0;
    }
  } else if ((p.wanted >= 2 || p.slip >= 90) && p.slip < 99 && obj && (obj.timeLeft === null || obj.timeLeft > 0.25 * (obj.job?.limit ?? 1))) {
    const t = slipTarget(state);
    // Only tuck behind traffic that is itself heading toward our waypoint,
    // so charging the meter never drags the courier off course.
    if (t) {
      const toWx = wx - p.x;
      const toWy = wy - p.y;
      const tl = Math.hypot(toWx, toWy) || 1;
      const along = (toWx * Math.cos(t.angle) + toWy * Math.sin(t.angle)) / tl;
      if (along > 0.7) {
        bot.followTraffic = t;
        bot.followTimer = 90;
        wx = t.x - Math.cos(t.angle) * 70;
        wy = t.y - Math.sin(t.angle) * 70;
      }
    }
  }

  // Stuck? Back up a little, then re-plan.
  if (bot.reverseTimer > 0) {
    bot.reverseTimer--;
    input.down = true;
    input.left = bot.stuckSteer > 0;
    input.right = bot.stuckSteer <= 0;
    return input;
  }
  bot.stuckTimer++;
  if (bot.stuckTimer >= 60) {
    bot.stuckTimer = 0;
    const moved = dist(p.x, p.y, bot.lastX, bot.lastY);
    const trying = p.mode === 'foot' || Math.abs(p.speed) < 2;
    if (moved < 7 && trying) {
      bot.reverseTimer = 22;
      bot.stuckSteer = Math.sign(wrapAngle(Math.atan2(wy - p.y, wx - p.x) - p.angle)) || 1;
      bot.targetKind = '';
      input.down = true;
      return input;
    }
    bot.lastX = p.x;
    bot.lastY = p.y;
  }

  const dx = wx - p.x;
  const dy = wy - p.y;
  const d = Math.hypot(dx, dy);
  if (p.mode === 'foot') {
    if (Math.abs(dx) > 6) { if (dx > 0) input.right = true; else input.left = true; }
    if (Math.abs(dy) > 6) { if (dy > 0) input.down = true; else input.up = true; }
    return input;
  }

  // Driving: steer toward the waypoint, ease off on sharp turns, and give
  // traffic a wide berth instead of ramming through it.
  const want = Math.atan2(dy, dx);
  const diff = wrapAngle(want - p.angle);
  // Nudge the waypoint sideways when traffic sits on the line ahead.
  for (const t of state.traffic) {
    const tdx = t.x - p.x;
    const tdy = t.y - p.y;
    const td = Math.hypot(tdx, tdy);
    if (td < 95 && td > 12) {
      const ahead = (tdx * Math.cos(p.angle) + tdy * Math.sin(p.angle)) / td;
      const side = -tdx * Math.sin(p.angle) + tdy * Math.cos(p.angle);
      if (ahead > 0.55 && Math.abs(side) < 42) {
        const s = side >= 0 ? -1 : 1;
        wx += -Math.sin(p.angle) * 46 * s;
        wy += Math.cos(p.angle) * 46 * s;
        break;
      }
    }
  }
  const want2 = Math.atan2(wy - p.y, wx - p.x);
  const diff2 = wrapAngle(want2 - p.angle);
  const ad = Math.abs(diff2);
  // Target speed: slow for the waypoint itself and for a sharp turn onto
  // the next leg, so the turning circle stays inside the intersection.
  // Never brake down to a crawl: braking only while fast keeps the courier
  // out of the reverse-steering spiral.
  let targetSpeed = p.mode === 'bike' ? 8.5 : 7.6;
  if (d < 170) targetSpeed = Math.min(targetSpeed, 4.6);
  if (bot.wp + 1 < bot.route.length) {
    const n2 = bot.route[bot.wp + 1];
    const turn = Math.abs(wrapAngle(Math.atan2(n2.y - wy, n2.x - wx) - Math.atan2(wy - p.y, wx - p.x)));
    if (turn > 0.6 && d < 280) targetSpeed = Math.min(targetSpeed, 4.0);
  }
  if (ad > 1.2) targetSpeed = Math.min(targetSpeed, 2.5);
  // While slipstreaming behind traffic, match its speed: close gently to
  // the tuck point and hold it, instead of ramming the car ahead.
  if (bot.followTimer > 0 && bot.followTraffic) {
    const fd = dist(p.x, p.y, wx, wy);
    targetSpeed = Math.min(targetSpeed, bot.followTraffic.speed + clamp((fd - 70) * 0.05, -1.5, 2.5));
  }
  if (p.speed > targetSpeed + 1.0 && p.speed > 3.5) input.down = true;
  else if (p.speed < targetSpeed) input.up = true;
  if (diff2 > 0.06) input.right = true;
  else if (diff2 < -0.06) input.left = true;
  // Slow down when the waypoint is the target itself and we are close.
  if (bot.wp >= bot.route.length && d < 110 && p.mode === 'car') {
    input.up = Math.abs(p.speed) < 4.5;
    input.down = Math.abs(p.speed) >= 4.5;
  }
  return input;
}

// Run the bot headless until the night is done (or the tick cap hits).
// Returns a plain report: jobs done, ticks, money, packages, errors.
export function runBot(seed, maxTicks = 30000) {
  const state = createGame(seed);
  const bot = createBot();
  const errors = [];
  let steps = 0;
  while (state.status !== 'complete' && steps < maxTicks) {
    const input = botInput(state, bot);
    stepGame(state, input);
    steps++;
    const job = currentJob(state);
    if (job && state.events.some((e) => e.type === 'job_failed' && e.t === state.tick)) {
      errors.push(`job ${job.id} missed its deadline at tick ${state.tick}`);
    }
  }
  if (state.status !== 'complete') {
    errors.push(`night not complete after ${steps} ticks (job ${state.jobIndex + 1}/5)`);
  }
  return {
    seed,
    jobs: state.jobIndex,
    complete: state.status === 'complete',
    ticks: state.tick,
    money: state.money,
    packages: state.packagesTaken,
    crashes: state.crashes,
    rammed: state.busted,
    distance: Math.round(state.distance),
    errors,
    events: state.events.length,
  };
}
