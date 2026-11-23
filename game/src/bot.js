// Autopilot for MARSHLIGHT: drives the airboat through all five jobs.
// Routes come from a small hand-placed graph whose nodes sit on channel
// centres and reed beds, so a route can never cut across dry land — the
// grid pathfinder kept doing exactly that at the channel junctions. The
// bot steers node to node, brakes before sharp turns, waits out gators
// when the way is blocked, and sits still in the reeds to shake the heat.
// The player never needs the car: every job target is a dock on the water.
import { inReeds, PLACES } from './world.js';
import { currentStep, currentJob } from './sim.js';

// id, x, y — all on water or in a reed bed the airboat can enter.
const NODES = {
  M1: [380, 1750], M2: [400, 1500], M3: [330, 1200], M4: [360, 900],
  M5: [300, 600], M6: [340, 300], M7: [310, 80],
  A1: [500, 280], A2: [800, 270], A3: [1100, 310], A4: [1450, 285],
  B1: [600, 940], B2: [900, 945], B3: [1200, 930], B4: [1600, 945],
  S1: [700, 1570], S2: [1200, 1630], S3: [1700, 1610], S4: [2000, 1600],
  RX: [360, 470], R1: [470, 450],
  R3: [250, 1100], R4: [600, 1400], R5: [900, 1620],
};

const EDGES = {
  M1: ['M2'], M2: ['M1', 'M3', 'S1', 'R4'], M3: ['M2', 'M4', 'R3'],
  M4: ['M3', 'M5', 'B1'], M5: ['M4', 'M6', 'RX'], M6: ['M5', 'M7', 'A1'],
  M7: ['M6'],
  A1: ['M6', 'A2'], A2: ['A1', 'A3'], A3: ['A2', 'A4'], A4: ['A3'],
  B1: ['M4', 'B2'], B2: ['B1', 'B3'], B3: ['B2', 'B4'], B4: ['B3'],
  S1: ['M2', 'S2', 'R5'], S2: ['S1', 'S3'], S3: ['S2', 'S4'], S4: ['S3'],
  RX: ['M5', 'R1'], R1: ['RX'], R3: ['M3'], R4: ['M2'], R5: ['S1'],
};

const REED_NODES = ['R1', 'R3', 'R4', 'R5'];

function nearestNode(x, y) {
  let best = null, bd = Infinity;
  for (const [id, [nx, ny]] of Object.entries(NODES)) {
    const d = Math.hypot(x - nx, y - ny);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

// Breadth-first route between graph nodes. Returns node ids, or [].
function graphRoute(fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = { [fromId]: null };
  const queue = [fromId];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of EDGES[cur] ?? []) {
      if (prev[next] !== undefined) continue;
      prev[next] = cur;
      if (next === toId) {
        const ids = [toId];
        let c = cur;
        while (c !== null) { ids.unshift(c); c = prev[c]; }
        return ids;
      }
      queue.push(next);
    }
  }
  return [];
}

export function createBot() {
  return {
    path: [], targetKey: '', replanIn: 0,
    lastX: 0, lastY: 0, stuckIn: 0, detour: null,
    lastJob: 0, lastStep: 0, waitIn: 0,
    sampleIn: 0, reverseIn: 0, lastHeading: 0,
  };
}

function nearestReeds(s) {
  let best = null, bd = Infinity;
  for (const id of REED_NODES) {
    const [x, y] = NODES[id];
    const d = Math.hypot(s.player.x - x, s.player.y - y);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}

export function botInput(s, bot) {
  const input = { up: false, down: false, left: false, right: false, enter: false, brake: false };
  const step = currentStep(s);
  const job = currentJob(s);
  if (!step || !job || s.complete) return input;

  // A job or step just finished: look for a cache worth a short detour.
  if (job.id !== bot.lastJob || s.stepIndex !== bot.lastStep) {
    bot.lastJob = job.id; bot.lastStep = s.stepIndex;
    bot.detour = null;
    let best = null, bd = 500;
    for (const c of s.world.caches) {
      if (c.found) continue;
      const d = Math.hypot(s.player.x - c.x, s.player.y - c.y);
      if (d >= bd) continue;
      // Only detour to a cache the boat can actually reach: it must sit
      // near a graph node, or the straight final leg crosses dry land.
      let nd = Infinity;
      for (const [nx, ny] of Object.values(NODES)) {
        nd = Math.min(nd, Math.hypot(c.x - nx, c.y - ny));
      }
      if (nd > 150) continue;
      bd = d; best = c;
    }
    if (best) bot.detour = { x: best.x, y: best.y };
  }
  if (bot.detour) {
    const c = s.world.caches.find((cc) => cc.x === bot.detour.x && cc.y === bot.detour.y);
    if (!c || c.found) bot.detour = null;
  }

  let target;
  if (step.kind === 'hide') {
    // Sit still in the reeds until the heat is gone.
    if (inReeds(s.player.x, s.player.y)) {
      if (s.player.speed < 0.5) return input;
      input.down = true; // still drifting: brake gently
      return input;
    }
    target = nearestReeds(s);
  } else if (bot.detour) {
    target = bot.detour;
  } else {
    target = PLACES[step.at];
  }
  if (!target) return input;

  const key = `${Math.round(target.x)},${Math.round(target.y)}`;
  if (key !== bot.targetKey || bot.path.length === 0) {
    bot.targetKey = key;
    const fromId = nearestNode(s.player.x, s.player.y);
    const toId = nearestNode(target.x, target.y);
    const ids = graphRoute(fromId, toId);
    // The boat may already sit between two route nodes: skip a first
    // node the boat is closer to passing than to reaching, or the route
    // keeps sending it back the way it came.
    while (ids.length > 1) {
      const d0 = Math.hypot(s.player.x - NODES[ids[0]][0], s.player.y - NODES[ids[0]][1]);
      const d1 = Math.hypot(s.player.x - NODES[ids[1]][0], s.player.y - NODES[ids[1]][1]);
      if (d1 < d0) ids.shift();
      else break;
    }
    bot.path = ids.map((id) => ({ x: NODES[id][0], y: NODES[id][1] }));
    bot.path.push({ x: target.x, y: target.y });
  }

  // Stuck? Measure movement over a 30-tick window — but a boat that is
  // turning in place is not stuck, so require a steady heading too.
  bot.sampleIn--;
  if (bot.sampleIn <= 0) {
    const moved = Math.hypot(s.player.x - bot.lastX, s.player.y - bot.lastY);
    const turned = Math.abs(s.player.heading - bot.lastHeading);
    if (moved < 20 && turned < 0.2) {
      bot.stuckIn++;
      if (bot.stuckIn === 1) {
        bot.reverseIn = 40;
        bot.path = [];
        bot.replanIn = 0;
      }
    } else bot.stuckIn = 0;
    bot.lastX = s.player.x; bot.lastY = s.player.y;
    bot.lastHeading = s.player.heading;
    bot.sampleIn = 30;
  }
  if (bot.reverseIn > 0) {
    bot.reverseIn--;
    input.down = true;
    return input;
  }

  // Drop waypoints already reached. Never drop one for being "behind"
  // the boat: after a pickup the boat often has to turn around, and
  // dropping the whole route then leaves it with nowhere to go.
  while (bot.path.length > 0) {
    const w = bot.path[0];
    if (Math.hypot(s.player.x - w.x, s.player.y - w.y) < 45) bot.path.shift();
    else break;
  }
  if (bot.path.length === 0) return input;

  const wp = bot.path[0];
  const next = bot.path[1] ?? wp;
  // Brake before a sharp turn: the airboat slides wide at full speed.
  const turn = angleBetween(s, wp, next);
  if (Math.abs(turn) > 1.0 && s.player.speed > 2) {
    input.down = true;
    steerToward(s, input, wp.x, wp.y, true);
    return input;
  }
  steerToward(s, input, wp.x, wp.y, false);
  return input;
}

function angleBetween(s, a, b) {
  const h1 = Math.atan2(a.y - s.player.y, a.x - s.player.x);
  const h2 = Math.atan2(b.y - a.y, b.x - a.x);
  let d = h2 - h1;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function steerToward(s, input, tx, ty, turningOnly) {
  const p = s.player;
  // Gator evasion: only a gator close ahead matters. Sidestep it — turn
  // to the side it is not on — instead of turning away, which in a
  // 100 px channel just bounces the boat between the gator and the bank.
  let want = Math.atan2(ty - p.y, tx - p.x);
  for (const g of s.world.gators) {
    const dx = g.x - p.x, dy = g.y - p.y;
    const d = Math.hypot(dx, dy);
    const ahead = dx * Math.cos(p.heading) + dy * Math.sin(p.heading);
    if (d < 60 && ahead > 0) {
      const cross = Math.cos(p.heading) * dy - Math.sin(p.heading) * dx;
      want = p.heading + (cross > 0 ? -1.0 : 1.0);
      break;
    }
  }
  let d = want - p.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > 0.08) input.right = true;
  else if (d < -0.08) input.left = true;
  // Only open the throttle when roughly lined up: the airboat drifts
  // wide, and full speed through a turn beaches it on the bank.
  if (!turningOnly && Math.abs(d) < 0.3) input.up = true;
}
