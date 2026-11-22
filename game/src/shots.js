// The autopilot: a simple driver that follows the road graph to the current objective,
// steals a car when it needs one, and backs out when it gets stuck. The screenshot
// scenes and the bot playthrough both steer with it, so a staged frame is always a
// frame a real game could reach.
import { findRoute, nearestNode } from './city.js';
import { currentObjective, startJob } from './missions.js';
import { STEP } from './config.js';

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Pure pursuit along the road graph: the route is a polyline from the player to
 * the target, and the pilot steers at a point a lookahead distance ahead of the
 * car's projection onto it. Steering at a single waypoint makes the car orbit
 * the point forever (its turning circle is wider than the capture radius);
 * steering at a moving point on the line cuts corners and never orbits.
 */
function pursuitTarget(world, target, lookahead) {
  const bot = world.bot;
  const player = world.player;
  const key = `${Math.round(target.x / 50)},${Math.round(target.y / 50)}`;
  if (bot.key !== key) {
    bot.key = key;
    bot.polyline = [{ x: player.x, y: player.y }, ...findRoute({ x: player.x, y: player.y }, target), { x: target.x, y: target.y }];
  }
  const line = bot.polyline;
  let best = { dist: Infinity, seg: 0, t: 0, point: line[0] };
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i];
    const b = line[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1;
    let t = ((player.x - a.x) * abx + (player.y - a.y) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + abx * t;
    const py = a.y + aby * t;
    const d = Math.hypot(player.x - px, player.y - py);
    if (d < best.dist) best = { dist: d, seg: i, t, point: { x: px, y: py } };
  }
  let remaining = lookahead;
  let seg = best.seg;
  let t = best.t;
  let point = best.point;
  while (remaining > 0 && seg < line.length - 1) {
    const a = line[seg];
    const b = line[seg + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const along = t * segLen;
    const left = segLen - along;
    if (remaining <= left) {
      const nt = (along + remaining) / segLen;
      point = { x: a.x + (b.x - a.x) * nt, y: a.y + (b.y - a.y) * nt };
      remaining = 0;
    } else {
      remaining -= left;
      seg += 1;
      t = 0;
      point = b;
    }
  }
  return point;
}

function nearestCar(world, maxDist) {
  // Parked cars first: they stay where they are. A moving car is a target that
  // runs away from a player on foot.
  let best = null;
  let bestD = maxDist;
  for (const car of world.parked) {
    const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (best) return best;
  for (const car of world.traffic) {
    const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/**
 * One frame of autopilot input. `bot` is world.bot: the route cache and the
 * stuck detector the pilot keeps between frames.
 */
export function autopilot(world) {
  const bot = world.bot;
  const player = world.player;
  const objective = currentObjective(world);
  const input = { up: false, down: false, left: false, right: false, handbrake: false, run: true, enterCar: false, punch: false };
  const px = player.x;
  const py = player.y;

  // Pick a destination: the objective, a car to steal, or a drive around the block.
  let target = null;
  let needCar = false;
  if (objective) {
    target = { x: objective.x, y: objective.y };
    needCar = !player.car
      && (world.missions.status !== 'active'
        || objective.label.includes('Drive')
        || objective.label.includes('Deliver')
        || objective.label.includes('Drop off')
        || objective.label.includes('Reach'));
    if (!player.car && objective.label.startsWith('Steal')) needCar = true;
    if (!player.car && Math.hypot(target.x - px, target.y - py) > 320) needCar = true;
  }
  if (needCar && !player.car) {
    const car = nearestCar(world, 900);
    if (car) {
      target = { x: car.x, y: car.y };
      if (Math.hypot(car.x - px, car.y - py) < 42) {
        input.enterCar = true;
        return input;
      }
    }
  }
  // Self-preservation: on foot with a wanted level, steal a car before anything
  // else — on foot the police catch you, and a job with no objective (like
  // losing the heat) gives the pilot no other destination.
  if (!player.car && world.player.wanted > 0 && !needCar) {
    const car = nearestCar(world, 900);
    if (car) {
      target = { x: car.x, y: car.y };
      if (Math.hypot(car.x - px, car.y - py) < 42) {
        input.enterCar = true;
        return input;
      }
    }
  }
  if (!target) {
    // Free roam with no objective: cruise to the pier and back.
    target = { x: 60, y: 1250 };
  }

  // Stuck detector: barely moving while trying is a wall or a corner.
  const moved = Math.hypot(px - bot.lastX, py - bot.lastY);
  bot.lastX = px;
  bot.lastY = py;
  if (moved < (player.car ? 0.4 : 0.15)) {
    bot.stuck += 1;
  } else {
    bot.stuck = 0;
  }
  if (bot.stuck > 80) {
    bot.stuck = 0;
    bot.reverse = player.car ? 50 : 25;
  }

  // Steer at the pursuit point: a lookahead along the route for a car, a short
  // one on foot. While reversing out of a jam, keep steering at the same point.
  const dest = pursuitTarget(world, target, player.car ? 140 : 60);
  const dx = dest.x - px;
  const dy = dest.y - py;
  const distToTarget = Math.hypot(target.x - px, target.y - py);
  if (bot.reverse > 0) {
    bot.reverse -= 1;
    if (player.car) {
      const want = Math.atan2(dy, dx);
      const diff = angleDiff(want, player.car.angle);
      input.left = diff < -0.1;
      input.right = diff > 0.1;
      input.down = true;
    } else {
      input.down = true;
      input.left = bot.reverse % 60 < 30;
      input.right = !input.left;
    }
    return input;
  }
  if (player.car) {
    const want = Math.atan2(dy, dx);
    const diff = angleDiff(want, player.car.angle);
    input.left = diff < -0.1;
    input.right = diff > 0.1;
    // Speed follows the corner: slow for a sharp turn, full speed on a straight.
    const targetSpeed = Math.abs(diff) > 1.0 ? 130 : Math.abs(diff) > 0.5 ? 240 : 560;
    input.up = player.car.speed < targetSpeed && distToTarget > 40;
    input.down = player.car.speed > targetSpeed + 60 || (distToTarget < 60 && player.car.speed > 120);
  } else {
    // On foot the controls are absolute (up is north, left is west), not
    // relative to the heading the way driving is: walk toward the point.
    input.up = dy < -8;
    input.down = dy > 8;
    input.left = dx < -8;
    input.right = dx > 8;
    if (Math.hypot(dx, dy) < 12) {
      input.up = input.down = input.left = input.right = false;
    }
  }
  return input;
}

/** Run the world forward with the autopilot for `seconds` of sim time. */
export function runAutopilot(world, step, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    step(autopilot(world));
    if (world.missions.status === 'complete' || world.missions.status === 'failed') break;
  }
}

/**
 * Stage a screenshot scene: set the world to a deterministic state and play the real
 * rules forward, then return the screen to draw. The seed fixes every roll.
 */
export function stageShot(name, world, step) {
  const missions = world.missions;
  if (name === 'play') {
    // FARE PLAY runs long enough that the frame is still mid-job, with the
    // objective banner, a passenger and the HUD all visible.
    startJob(world, 2);
    missions.status = 'active';
    runAutopilot(world, step, 12);
    return 'play';
  }
  if (name === 'chase') {
    startJob(world, 4);
    missions.status = 'active';
    world.time = 0.62 * 360;
    runAutopilot(world, step, 16);
    return 'play';
  }
  if (name === 'end') {
    startJob(world, 0);
    missions.status = 'active';
    runAutopilot(world, step, 120);
    return missions.status === 'complete' ? 'complete' : 'play';
  }
  // start: the title screen over the city at golden hour.
  world.time = 0.3 * 360;
  return 'title';
}
