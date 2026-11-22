// Autopilot bot for Vice Harbor. Runs the simulation headlessly in Node
// (no DOM, no canvas) and plays all five jobs with a seek-steering
// driver. On land it routes along the road grid (a BFS over the street
// intersections) instead of bee-lining through buildings; on the water it
// steers straight, sliding along the shore. It picks the vehicle each
// step needs, uses Ghost Mode in the fog and the safehouse to lose the
// heat, and reports whether every job completed.
// Run: node game/src/bot.js [seed]
import { createGame, stepGame, playerKind, nearestVehicle, policeCanSee } from './world.js';
import { currentStep } from './missions.js';
import { isWater, inFog, inSafehouse } from './city.js';
import { makeInput } from './input.js';
import { SPOTS } from './config.js';

const DT = 1 / 60;
const MAX_TIME = 900; // seconds of simulated play

// The street grid: intersections the bot routes through.
const GRID = [300, 700, 1100, 1500, 1900];

function angTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function nearestIntersection(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const gx of GRID) {
    for (const gy of GRID) {
      const d = dist(gx, gy, x, y);
      if (d < bestD) {
        bestD = d;
        best = { x: gx, y: gy };
      }
    }
  }
  return best;
}

// Breadth-first route over the street grid, from the intersection
// nearest `from` to the one nearest `to`. Returns the intersections in
// order, not including the start.
function findPath(from, to) {
  const a = nearestIntersection(from.x, from.y);
  const b = nearestIntersection(to.x, to.y);
  const key = (p) => GRID.indexOf(p.x) + ',' + GRID.indexOf(p.y);
  const start = key(a);
  const goal = key(b);
  const prev = new Map([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === goal) break;
    const [cx, cy] = cur.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > GRID.length - 1 || ny < 0 || ny > GRID.length - 1) continue;
      const nk = nx + ',' + ny;
      if (!prev.has(nk)) {
        prev.set(nk, cur);
        queue.push(nk);
      }
    }
  }
  const path = [];
  let cur = goal;
  while (cur && cur !== start) {
    const [cx, cy] = cur.split(',').map(Number);
    path.unshift({ x: GRID[cx], y: GRID[cy] });
    cur = prev.get(cur);
  }
  return path;
}

// Board a vehicle of this kind: the simulation's E only opens the door
// of the named kind, so a car parked nearer the door cannot steal the
// boarding. Returns true when a ride of that kind is in reach.
function wantEnter(game, kind) {
  const want = nearestVehicle(game, kind);
  return !!want && want.d <= 60;
}

// Drive the current step. Returns a status string for the log.
export function runBot(seed) {
  const game = createGame(seed);
  const input = makeInput();
  const log = [];
  let t = 0;
  let lastX = 0;
  let lastY = 0;
  let lastMoveT = 0;
  let unstuckUntil = 0;
  let unstuckDir = 1;
  let reverseUntil = 0;
  let lastStepKey = '';
  let lastJob = -1;
  // Cached road route for the current destination.
  let route = null;

  function note(msg) {
    log.push('[' + t.toFixed(1) + 's] ' + msg);
  }

  while (t < MAX_TIME && !game.allDone) {
    const step = currentStep(game);
    if (!step) break;
    const job = game.jobs[game.jobIndex];
    const stepKey = job.id + ':' + game.stepIndex;
    if (stepKey !== lastStepKey) {
      note('JOB ' + (game.jobIndex + 1) + ' ' + job.name + ' — ' + step.text);
      lastStepKey = stepKey;
      lastX = game.player.x;
      lastY = game.player.y;
      lastMoveT = t;
      route = null;
    }
    if (game.jobIndex !== lastJob) {
      lastJob = game.jobIndex;
    }

    // --- Decide what to do this frame. ---
    const p = game.player;
    const kind = playerKind(game);
    const targetInWater = step.type !== 'enter' && step.x !== undefined && isWater(step.x, step.y);

    // Reset the frame's inputs.
    input.up = false;
    input.down = false;
    input.left = false;
    input.right = false;
    input.enter = false;
    input.enterKind = null;
    input.ghost = false;

    // Ghost Mode: if wanted and standing in fog, vanish.
    if (game.wanted > 0 && inFog(p.x, p.y) && game.ghostCooldown <= 0 && !game.ghost) {
      input.ghost = true;
    }

    let tx;
    let ty;
    let needVehicle = null;

    if (step.type === 'enter') {
      needVehicle = step.vehicle;
      const near = nearestVehicle(game, step.vehicle);
      if (near) {
        tx = near.v.x;
        ty = near.v.y;
        if (wantEnter(game, step.vehicle)) {
          input.enter = true;
          input.enterKind = step.vehicle;
        }
      } else {
        tx = step.x || SPOTS.playerStart.x;
        ty = step.y || SPOTS.playerStart.y;
      }
    } else if (step.type === 'hide') {
      // Lose the heat: get to the safehouse and sit there.
      tx = SPOTS.safehouse.x;
      ty = SPOTS.safehouse.y;
    } else {
      tx = step.x;
      ty = step.y;
      if (step.vehicle && step.vehicle !== 'any') {
        needVehicle = step.vehicle;
      } else if (targetInWater && kind !== 'boat') {
        needVehicle = 'boat';
      } else if (!targetInWater && kind === 'boat') {
        needVehicle = 'land';
      }
    }

    // --- Vehicle management. ---
    // The bot changes rides the way a player would: it drives or sails to
    // the ride it needs, gets out of the one it has, and boards the new
    // one. A boat cannot pick up a car and a car cannot pick up a boat,
    // so switching from water to land (or back) goes through the Marina.
    if (needVehicle === 'boat' && kind !== 'boat') {
      if (kind === 'car') {
        // Drive the car to the water's edge, get out, then board.
        // The car can only reach the shore, which sits further from a
        // boat than the 60px enter range — so get out once the car is
        // close (150px) and let the foot branch walk the last stretch
        // along the shore into enter range. Waiting for enter range
        // while still in the car strands the driver at the water's edge.
        const near = nearestVehicle(game, 'boat');
        if (near) {
          tx = near.v.x;
          ty = near.v.y;
          if (near.d < 150) input.enter = true;
        } else {
          tx = 2100;
          ty = 1400;
        }
      } else {
        // On foot: walk to the nearest boat and get in.
        const near = nearestVehicle(game, 'boat');
        if (near) {
          tx = near.v.x;
          ty = near.v.y;
          if (wantEnter(game, 'boat')) {
            input.enter = true;
            input.enterKind = 'boat';
          }
        } else {
          tx = 2100;
          ty = 1400;
        }
      }
    } else if (needVehicle === 'car' && kind !== 'car') {
      if (kind === 'boat') {
        // Sail to the Marina, get out on dry land, then take a car.
        // The boat steers for a point in the water off the Marina
        // (2180,1400), not the dock itself — the dock is on land and a
        // boat that aims straight at it just pushes into the shore.
        const dockD = dist(p.x, p.y, 2100, 1400);
        if (dockD > 90) {
          tx = 2180;
          ty = 1400;
        } else {
          input.enter = true;
          tx = step.x;
          ty = step.y;
        }
      } else {
        // On foot: walk to the nearest car and get in.
        const near = nearestVehicle(game, 'car');
        if (near) {
          tx = near.v.x;
          ty = near.v.y;
          if (wantEnter(game, 'car')) {
            input.enter = true;
            input.enterKind = 'car';
          }
        } else {
          tx = p.x;
          ty = p.y;
        }
      }
    } else if (needVehicle === 'foot' && kind !== 'foot') {
      // Get out where we stand (the step target is on foot).
      input.enter = true;
      tx = step.x;
      ty = step.y;
    } else if (needVehicle === 'land' && kind === 'boat') {
      // Sail to the Marina, then get out on dry land. Aim for the water
      // off the Marina, not the dock itself (see above).
      const dockD = dist(p.x, p.y, 2100, 1400);
      if (dockD > 80) {
        tx = 2180;
        ty = 1400;
      } else {
        input.enter = true;
        tx = step.x;
        ty = step.y;
      }
    }

    // --- Route: on land, steer through the street grid; on the water,
    // steer straight at the target (the shore slide does the rest). ---
    let sx = tx;
    let sy = ty;
    const destInWater = isWater(tx, ty);
    if (kind === 'boat') {
      // A boat in the south bay that needs to leave it must not aim
      // straight at a target to the north: it would grind along the
      // bay's north edge pushing into the shore. Route via the harbor
      // mouth instead, then turn north once it is in open water.
      const inBay = p.y > 2050 && p.x < 2160;
      const targetInBay = ty > 2050 && tx < 2160;
      if (inBay && !targetInBay) {
        sx = 2400;
        sy = 1950;
      }
      route = null;
    } else if (!destInWater) {
      if (!route || dist(route.dest.x, route.dest.y, tx, ty) > 150 || route.idx >= route.points.length) {
        const pts = findPath({ x: p.x, y: p.y }, { x: tx, y: ty });
        route = { dest: { x: tx, y: ty }, points: pts, idx: 0 };
      }
      if (route.idx < route.points.length) {
        sx = route.points[route.idx].x;
        sy = route.points[route.idx].y;
        if (dist(p.x, p.y, sx, sy) < 80) route.idx++;
      }
    } else {
      route = null;
    }

    // --- Steering toward (sx, sy). ---
    const d = dist(p.x, p.y, sx, sy);
    const want = angTo(p.x, p.y, sx, sy);
    const diff = angDiff(want, p.angle);

    // Unstuck: a driver is stuck only when it stops moving, not when the
    // distance to the target stops shrinking — a boat sliding along the
    // shore toward the harbor mouth is making progress even while the
    // straight-line distance barely changes. When it does stick, forget
    // the route as well: it was planned from a position Rook no longer
    // occupies, and re-planning from here (nearest intersection first)
    // is what gets a car out of a building's pocket instead of back
    // into its wall.
    const moved = Math.hypot(p.x - lastX, p.y - lastY);
    if (moved > 20) {
      lastX = p.x;
      lastY = p.y;
      lastMoveT = t;
    } else if (t - lastMoveT > 3 && d > 40 && t > unstuckUntil) {
      unstuckDir = -unstuckDir;
      reverseUntil = t + 1.5;
      route = null;
      lastMoveT = t;
      lastX = p.x;
      lastY = p.y;
      note('stuck at ' + Math.round(d) + 'm — reversing');
    }

    if (t < reverseUntil) {
      // Back straight out: the nose is what is wedged against the
      // wall, so reversing straight is directly away from it. Steering
      // while reversing just swings the nose further into the wall.
      input.down = true;
    } else if (kind === 'foot') {
      // 8-way walk toward the target.
      const c = Math.cos(want);
      const s = Math.sin(want);
      if (d > 12) {
        if (c > 0.3) input.right = true;
        if (c < -0.3) input.left = true;
        if (s > 0.3) input.down = true;
        if (s < -0.3) input.up = true;
      }
    } else {
      // Vehicle: throttle unless we are on top of the target, steer
      // toward it, and brake hard if we are about to overshoot it.
      // Sharp turns are taken slowly: a car that arrives at a corner
      // at full speed overshoots the road and meets a building.
      if (d > 30) {
        input.up = true;
        if (Math.abs(diff) > 0.7 && Math.abs(p.speed) > 140) {
          input.up = false;
          input.down = true;
        } else if (Math.abs(diff) > 1.2) {
          input.up = false;
        }
      } else if (Math.abs(p.speed) > 60) {
        input.down = true;
      }
      if (diff < -0.1) input.left = true;
      else if (diff > 0.1) input.right = true;
      // If we are flying past the target, cut the throttle.
      if (d < 60 && Math.abs(p.speed) > 200) input.up = false;
    }

    // --- Step the world. ---
    const beforeJobs = game.jobsDone;
    stepGame(game, input, DT);
    if (game.jobsDone > beforeJobs) {
      note('JOB COMPLETE: ' + game.jobs[game.jobsDone - 1].name + ' — $' + game.money + ' total');
    }
    t += DT;
  }

  const ok = game.allDone;
  const report = {
    seed,
    ok,
    jobsDone: game.jobsDone,
    money: game.money,
    crates: game.cratesGot,
    time: t,
    wanted: game.wanted,
    heat: Math.round(game.heat),
    style: Math.round(game.style),
    distance: Math.round(game.stats.distance),
    nearMisses: game.stats.nearMisses,
    jumps: game.stats.jumps,
    busted: game.stats.busted,
    log,
    errors: 0,
  };
  if (!ok) {
    const step = currentStep(game);
    report.stuckAt = step
      ? game.jobs[game.jobIndex].name + ' — ' + step.text + ' (job ' + (game.jobIndex + 1) + ', step ' + game.stepIndex + ')'
      : 'no current step';
    report.playerAt = { x: Math.round(game.player.x), y: Math.round(game.player.y), kind: playerKind(game) };
    report.seen = policeCanSee(game);
  }
  return report;
}

function main() {
  // One seed, or a comma-separated list (node game/src/bot.js 7,11,23):
  // the bot plays each seed and reports them all, so a lucky seed cannot
  // hide a navigation bug that other seeds would hit.
  const arg = process.argv[2] || '7';
  const seeds = arg.split(',').map((s) => parseInt(s, 10) || 7);
  let allOk = true;
  for (const seed of seeds) {
    const r = runBot(seed);
    if (seeds.length > 1) {
      for (const line of r.log) {
        if (line.indexOf('JOB COMPLETE') !== -1 || line.indexOf('stuck') !== -1) console.log(line);
      }
    } else {
      for (const line of r.log) console.log(line);
    }
    console.log('---');
    console.log('BOT seed=' + r.seed + ' ok=' + r.ok + ' jobs=' + r.jobsDone + '/5 money=$' + r.money +
      ' crates=' + r.crates + '/12 time=' + r.time.toFixed(1) + 's wanted=' + r.wanted +
      ' heat=' + r.heat + ' style=' + r.style + ' dist=' + r.distance + 'm jumps=' + r.jumps +
      ' nearMisses=' + r.nearMisses + ' busted=' + r.busted);
    if (!r.ok) {
      console.log('STUCK AT: ' + r.stuckAt);
      console.log('player: ' + JSON.stringify(r.playerAt) + ' seen=' + r.seen);
      allOk = false;
    }
  }
  process.exit(allOk ? 0 : 1);
}

main();
