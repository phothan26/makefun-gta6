// NEON RAIN — Midnight Courier: the simulation.
// One fixed step per tick (60 ticks a second). Everything here is pure and
// deterministic: the only randomness is the seeded RNG in state, the rain is
// a function of the tick, and there is no clock or Math.random anywhere.

import { makeRng, hash01, clamp, wrapAngle, dist } from './rng.mjs';
import { generateCity, cityGraph, bfsPath, WORLD_W, WORLD_H, ROAD_XS, ROAD_YS } from './city.mjs';

export const TICK_RATE = 60;
export const JOB_REWARDS = [150, 200, 250, 300, 400];
// Five chained courier jobs: [pickup landmark, dropoff landmark].
const JOB_PATHS = [[0, 3], [5, 1], [2, 7], [6, 4], [3, 0]];
const TRAFFIC_COLORS = ['#c94f6d', '#4d7ea8', '#8a6fc0', '#b8a13a', '#5da87a', '#a85d7a'];
const WANTED_COOLDOWN = 300; // ticks between wanted gains from crashes

function rainAt(tick) {
  const base = 0.55 + 0.45 * Math.sin(tick * 0.0009 + 1.3);
  const jitter = (hash01(tick, 7) - 0.5) * 0.12;
  return clamp(base + jitter, 0.12, 1);
}

export function policeSightRange(rain) {
  return 430 - 195 * rain;
}

export function createGame(seed) {
  const city = generateCity(seed);
  const graph = cityGraph(city);
  const rng = makeRng((seed ^ 0x9e3779b9) >>> 0);
  const start = city.landmarks[0];
  const state = {
    seed,
    tick: 0,
    status: 'playing', // 'playing' | 'complete'
    rain: rainAt(0),
    money: 40,
    rngS: rng.s,
    city,
    graph,
    player: {
      x: start.x - 90, y: start.y + 60, angle: -Math.PI / 2, speed: 0,
      mode: 'foot', vehicleId: null, slip: 0, slipActive: 0,
      wanted: 0, wantedCooldown: 0, hiddenTimer: 0, wrecked: 0,
    },
    vehicles: city.parking.map((p, i) => ({
      id: i, kind: p.kind, x: p.x, y: p.y, angle: p.angle, speed: 0, parked: true,
    })),
    traffic: [],
    police: [],
    heli: { active: false, angle: 0, x: 0, y: 0, spotTicks: 0, cooldown: 0 },
    peds: [],
    jobs: JOB_PATHS.map(([from, to], i) => ({
      id: i, from, to, reward: JOB_REWARDS[i],
      state: i === 0 ? 'pickup' : 'pending',
      deadline: 0, limit: 0,
    })),
    jobIndex: 0,
    packagesTaken: 0,
    busted: 0,
    crashes: 0,
    distance: 0,
    events: [],
  };
  for (let i = 0; i < 8; i++) {
    const a = Math.floor(rng.next() * 48);
    const b = Math.floor(rng.next() * 48);
    state.traffic.push({
      id: i, x: graph.nodes[a].x, y: graph.nodes[a].y, angle: 0,
      speed: 4.2 + rng.next() * 0.8, from: a, to: b === a ? (a + 1) % 48 : b,
      color: TRAFFIC_COLORS[i % TRAFFIC_COLORS.length],
    });
  }
  for (let i = 0; i < 14; i++) {
    const vertical = rng.chance(0.5);
    state.peds.push({
      vertical,
      fixed: vertical ? ROAD_XS[Math.floor(rng.next() * ROAD_XS.length)] + (rng.chance(0.5) ? 40 : -40)
        : ROAD_YS[Math.floor(rng.next() * ROAD_YS.length)] + (rng.chance(0.5) ? 40 : -40),
      pos: rng.range(80, vertical ? WORLD_H - 80 : WORLD_W - 80),
      dir: rng.chance(0.5) ? 1 : -1,
      speed: 1.0 + rng.next() * 0.5,
      hue: rng.pick(['#ffd166', '#7ee0ff', '#ff8fb0', '#c9f27a']),
    });
  }
  state.rngS = rng.s;
  return state;
}

export function currentJob(state) {
  return state.jobIndex < state.jobs.length ? state.jobs[state.jobIndex] : null;
}

export function objectiveOf(state) {
  const job = currentJob(state);
  if (!job) return null;
  if (job.state === 'pickup') {
    const l = state.city.landmarks[job.from];
    return { kind: 'pickup', x: l.x, y: l.y, name: l.name, timeLeft: null, job };
  }
  const l = state.city.landmarks[job.to];
  return {
    kind: 'deliver', x: l.x, y: l.y, name: l.name,
    timeLeft: Math.max(0, job.deadline - state.tick), job,
  };
}

export function nearestVehicle(state, x, y, maxDist) {
  let best = null;
  let bd = maxDist;
  for (const v of state.vehicles) {
    if (!v.parked) continue;
    const d = dist(x, y, v.x, v.y);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function logEvent(state, type, detail) {
  if (state.events.length < 240) state.events.push({ t: state.tick, type, ...detail });
}

// Circle vs buildings + world bounds. Returns corrected position and
// whether a wall was hit.
function collideCircle(state, x, y, r) {
  let hit = false;
  x = clamp(x, r, WORLD_W - r);
  y = clamp(y, r, WORLD_H - r);
  for (const b of state.city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    let dx = x - cx;
    let dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 < 0.0001) {
      // Centre inside the building: push out along the smallest penetration.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x - r;
      else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r;
      else y = b.y + b.h + r;
    } else {
      const d = Math.sqrt(d2);
      dx /= d; dy /= d;
      x = cx + dx * r;
      y = cy + dy * r;
    }
  }
  return { x, y, hit };
}

function addWanted(state, n) {
  const p = state.player;
  if (p.wantedCooldown > 0) return;
  p.wanted = Math.min(5, p.wanted + n);
  p.wantedCooldown = WANTED_COOLDOWN;
  p.hiddenTimer = 0;
  logEvent(state, 'wanted_up', { wanted: p.wanted });
}

function crashPlayer(state, hard) {
  const p = state.player;
  state.crashes++;
  if (p.mode === 'bike') {
    p.speed *= 0.22;
    p.wrecked = 45;
  } else if (p.mode === 'car') {
    p.speed *= 0.35;
  } else {
    p.speed = 0;
  }
  if (hard) addWanted(state, 1);
  logEvent(state, 'crash', { mode: p.mode, wanted: p.wanted });
}

function stepPlayer(state, input) {
  const p = state.player;
  if (p.wantedCooldown > 0) p.wantedCooldown--;
  if (p.wrecked > 0) { p.wrecked--; p.speed *= 0.8; }
  const boost = p.slipActive > 0 ? 1.15 : 1;

  if (input.enter) {
    if (p.mode === 'foot') {
      const v = nearestVehicle(state, p.x, p.y, 52);
      if (v) {
        v.parked = false;
        p.vehicleId = v.id;
        p.mode = v.kind;
        p.x = v.x; p.y = v.y; p.angle = v.angle; p.speed = 0;
        logEvent(state, 'enter_vehicle', { kind: v.kind });
      }
    } else {
      const v = state.vehicles[p.vehicleId];
      if (v) { v.parked = true; v.x = p.x; v.y = p.y; v.angle = p.angle; v.speed = 0; }
      p.vehicleId = null;
      p.mode = 'foot';
      p.speed = 0;
      logEvent(state, 'exit_vehicle', {});
    }
  }

  if (p.mode === 'foot') {
    const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    const sp = 3.4;
    if (len > 0) {
      p.angle = Math.atan2(my / len, mx / len);
      const nx = p.x + (mx / len) * sp;
      const ny = p.y + (my / len) * sp;
      const r = collideCircle(state, nx, ny, 11);
      state.distance += dist(p.x, p.y, r.x, r.y);
      p.x = r.x; p.y = r.y;
      p.speed = sp;
    } else {
      p.speed = 0;
    }
    return;
  }

  // Driving: arcade handling, different for car and bike.
  const isBike = p.mode === 'bike';
  const maxSpeed = (isBike ? 10.2 : 8.6) * boost;
  const accel = isBike ? 0.3 : 0.22;
  if (p.wrecked <= 0) {
    if (input.up) p.speed += accel;
    if (input.down) p.speed -= p.speed > 0.5 ? 0.34 : 0.12;
  }
  p.speed *= 0.985;
  p.speed = clamp(p.speed, -3.2, maxSpeed);
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  p.angle += steer * 0.08 * clamp(p.speed / 3.5, -1, 1);
  p.angle = wrapAngle(p.angle);
  const before = p.speed;
  const nx = p.x + Math.cos(p.angle) * p.speed;
  const ny = p.y + Math.sin(p.angle) * p.speed;
  const r = isBike ? 12 : 16;
  const res = collideCircle(state, nx, ny, r);
  state.distance += dist(p.x, p.y, res.x, res.y);
  p.x = res.x; p.y = res.y;
  if (res.hit && Math.abs(before) > (isBike ? 4.5 : 5.5)) crashPlayer(state, true);
  else if (res.hit) p.speed *= 0.6;

  // Keep the driven vehicle glued to the player.
  const v = state.vehicles[p.vehicleId];
  if (v) { v.x = p.x; v.y = p.y; v.angle = p.angle; v.speed = p.speed; }

  // Bump into traffic: a crash, a fine, and a slower car.
  for (const t of state.traffic) {
    const d = dist(p.x, p.y, t.x, t.y);
    if (d < r + 14 && d > 0.01) {
      const push = (r + 14 - d) / 2;
      const ux = (p.x - t.x) / d;
      const uy = (p.y - t.y) / d;
      p.x += ux * push; p.y += uy * push;
      t.x -= ux * push; t.y -= uy * push;
      if (Math.abs(p.speed) > 5) crashPlayer(state, true);
      else p.speed *= 0.7;
      t.speed *= 0.6;
    }
  }
}

function stepTraffic(state) {
  for (const t of state.traffic) {
    const target = state.graph.nodes[t.to];
    const d = dist(t.x, t.y, target.x, target.y);
    if (d < 12) {
      const neighbours = state.graph.adj[t.to].filter((n) => n !== t.from);
      const rng = makeRng(state.rngS);
      const next = neighbours.length > 0
        ? neighbours[Math.floor(rng.next() * neighbours.length)]
        : t.from;
      state.rngS = rng.s;
      t.from = t.to;
      t.to = next;
      continue;
    }
    const want = Math.atan2(target.y - t.y, target.x - t.x);
    t.angle += wrapAngle(want - t.angle) * 0.12;
    t.x += Math.cos(t.angle) * t.speed;
    t.y += Math.sin(t.angle) * t.speed;
    const res = collideCircle(state, t.x, t.y, 14);
    t.x = res.x; t.y = res.y;
  }
}

function policeTargetNode(state) {
  const p = state.player;
  return state.graph.indexOf(p.x, p.y);
}

function stepPolice(state) {
  const p = state.player;
  const want = Math.min(p.wanted, 3);
  const rng = makeRng(state.rngS);
  while (state.police.length < want) {
    // Spawn far from the player, on a road.
    let node = Math.floor(rng.next() * 48);
    let guard = 0;
    while (dist(state.graph.nodes[node].x, state.graph.nodes[node].y, p.x, p.y) < 700 && guard++ < 20) {
      node = Math.floor(rng.next() * 48);
    }
    state.police.push({
      x: state.graph.nodes[node].x, y: state.graph.nodes[node].y,
      angle: 0, speed: 0, path: [], wp: 0, repath: Math.floor(rng.next() * 45),
      ramCooldown: 0,
    });
    logEvent(state, 'police_spawn', { count: state.police.length });
  }
  while (state.police.length > want) state.police.pop();
  state.rngS = rng.s;

  const sight = policeSightRange(state.rain);
  let anyNear = false;
  for (const c of state.police) {
    if (c.ramCooldown > 0) c.ramCooldown--;
    const d = dist(c.x, c.y, p.x, p.y);
    if (d < sight) anyNear = true;
    c.repath--;
    if (c.repath <= 0 || c.wp >= c.path.length) {
      c.repath = 45;
      const from = state.graph.indexOf(c.x, c.y);
      const to = policeTargetNode(state);
      c.path = bfsPath(state.graph, from, to);
      c.wp = 0;
    }
    let tx;
    let ty;
    if (d < 230) {
      tx = p.x; ty = p.y;
    } else if (c.wp < c.path.length) {
      const n = state.graph.nodes[c.path[c.wp]];
      tx = n.x; ty = n.y;
      if (dist(c.x, c.y, tx, ty) < 30) { c.wp++; continue; }
    } else {
      tx = p.x; ty = p.y;
    }
    const wantAngle = Math.atan2(ty - c.y, tx - c.x);
    c.angle += wrapAngle(wantAngle - c.angle) * 0.09;
    c.speed = Math.min(6.3, c.speed + 0.14);
    c.speed *= 0.99;
    const nx = c.x + Math.cos(c.angle) * c.speed;
    const ny = c.y + Math.sin(c.angle) * c.speed;
    const res = collideCircle(state, nx, ny, 15);
    c.x = res.x; c.y = res.y;
    if (res.hit) c.speed *= 0.5;
    // Ram the courier.
    if (d < 36 && c.ramCooldown <= 0) {
      c.ramCooldown = 150;
      p.speed *= 0.55;
      state.busted++;
      logEvent(state, 'rammed', { wanted: p.wanted });
    }
  }

  // Wanted fades when no police can see the courier.
  if (p.wanted > 0) {
    if (anyNear || p.slipActive > 0) p.hiddenTimer = 0;
    else {
      p.hiddenTimer++;
      if (p.hiddenTimer >= 360) {
        p.wanted--;
        p.hiddenTimer = 0;
        logEvent(state, 'wanted_down', { wanted: p.wanted });
      }
    }
  }

  // Helicopter at high wanted levels.
  const heli = state.heli;
  heli.active = p.wanted >= 4;
  if (heli.active) {
    heli.angle += 0.008;
    heli.x = p.x + Math.cos(heli.angle) * 150;
    heli.y = p.y + Math.sin(heli.angle) * 150;
    const spotX = p.x + Math.cos(heli.angle + Math.PI) * 40;
    const spotY = p.y + Math.sin(heli.angle + Math.PI) * 40;
    const inSpot = dist(p.x, p.y, spotX, spotY) < 90;
    heli.spotTicks = inSpot ? heli.spotTicks + 1 : Math.max(0, heli.spotTicks - 2);
    if (heli.cooldown > 0) heli.cooldown--;
    if (heli.spotTicks >= 180 && heli.cooldown <= 0) {
      heli.spotTicks = 0;
      heli.cooldown = 1200;
      p.wanted = Math.min(5, p.wanted + 1);
      logEvent(state, 'heli_spot', { wanted: p.wanted });
    }
  } else {
    heli.spotTicks = 0;
  }
}

function stepPeds(state) {
  for (const ped of state.peds) {
    ped.pos += ped.dir * ped.speed;
    const max = ped.vertical ? WORLD_H - 80 : WORLD_W - 80;
    if (ped.pos > max || ped.pos < 80) ped.dir *= -1;
    // At a crossing, sometimes turn onto the other road.
    const roads = ped.vertical ? ROAD_YS : ROAD_XS;
    for (const r of roads) {
      if (Math.abs(ped.pos - r) < 2 && hash01(state.tick, ped.fixed | 0) < 0.02) {
        ped.vertical = !ped.vertical;
        ped.fixed = r + (hash01(state.tick, 99) < 0.5 ? 40 : -40);
        ped.pos = ped.fixed;
        break;
      }
    }
  }
}

function stepSlipstream(state, input) {
  const p = state.player;
  if (p.slipActive > 0) {
    p.slipActive--;
    if (p.slipActive === 0) logEvent(state, 'slip_end', {});
    return;
  }
  if (input.slip && p.slip >= 99 && p.mode !== 'foot') {
    p.slip = 0;
    p.slipActive = 360;
    if (p.wanted > 0) {
      p.wanted--;
      logEvent(state, 'wanted_down', { wanted: p.wanted });
    }
    for (const c of state.police) { c.path = []; c.wp = 0; c.repath = 120; }
    logEvent(state, 'slip_start', {});
    return;
  }
  // Charge by tucking in behind traffic.
  if (p.mode !== 'foot' && Math.abs(p.speed) > 2.5) {
    let charging = false;
    for (const t of state.traffic) {
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 130 && d > 10) {
        const dot = (dx * Math.cos(p.angle) + dy * Math.sin(p.angle)) / d;
        const lateral = Math.abs(-dx * Math.sin(p.angle) + dy * Math.cos(p.angle));
        if (dot > 0.7 && lateral < 40) { charging = true; break; }
      }
    }
    p.slip = clamp(p.slip + (charging ? 2.0 : -0.02), 0, 100);
  } else {
    p.slip = clamp(p.slip - 0.02, 0, 100);
  }
}

function stepJobs(state) {
  const job = currentJob(state);
  if (!job) return;
  const p = state.player;
  if (job.state === 'pickup') {
    const l = state.city.landmarks[job.from];
    if (dist(p.x, p.y, l.x, l.y) < 44) {
      job.state = 'deliver';
      const to = state.city.landmarks[job.to];
      const d = dist(l.x, l.y, to.x, to.y);
      job.limit = Math.ceil((d / 5.5) * 2.2 + 40) * TICK_RATE;
      job.deadline = state.tick + job.limit;
      logEvent(state, 'job_pickup', { job: job.id, to: to.name });
    }
  } else if (job.state === 'deliver') {
    const l = state.city.landmarks[job.to];
    if (dist(p.x, p.y, l.x, l.y) < 44) {
      state.money += job.reward;
      logEvent(state, 'job_delivered', { job: job.id, reward: job.reward, money: state.money });
      state.jobIndex++;
      const next = currentJob(state);
      if (next) next.state = 'pickup';
      else {
        state.status = 'complete';
        logEvent(state, 'night_complete', { money: state.money, ticks: state.tick });
      }
    } else if (state.tick > job.deadline) {
      state.money = Math.max(0, state.money - 50);
      job.state = 'pickup';
      job.deadline = 0;
      logEvent(state, 'job_failed', { job: job.id, money: state.money });
    }
  }
  // Hidden packages pay a bonus.
  for (const pkg of state.city.packages) {
    if (!pkg.taken && dist(p.x, p.y, pkg.x, pkg.y) < 36) {
      pkg.taken = true;
      state.packagesTaken++;
      state.money += 25;
      logEvent(state, 'package', { id: pkg.id, money: state.money });
    }
  }
}

export function stepGame(state, input) {
  if (state.status === 'complete') return;
  state.tick++;
  state.rain = rainAt(state.tick);
  stepPlayer(state, input);
  stepTraffic(state);
  stepPolice(state);
  stepPeds(state);
  stepSlipstream(state, input);
  stepJobs(state);
}

export function clockText(state) {
  const mins = Math.floor(state.tick / TICK_RATE);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function rainLabel(rain) {
  if (rain < 0.35) return 'DRIZZLE';
  if (rain < 0.7) return 'RAIN';
  return 'DOWNPOUR';
}

// Save format for localStorage: plain JSON, no functions, no RNG objects.
export function serializeGame(state) {
  return JSON.stringify({
    v: 1,
    seed: state.seed,
    tick: state.tick,
    money: state.money,
    rngS: state.rngS,
    status: state.status,
    jobIndex: state.jobIndex,
    jobs: state.jobs.map((j) => ({ state: j.state, deadline: j.deadline, limit: j.limit })),
    packagesTaken: state.packagesTaken,
    packages: state.city.packages.map((p) => p.taken),
    player: {
      x: state.player.x, y: state.player.y, angle: state.player.angle,
      speed: state.player.speed, mode: state.player.mode, vehicleId: state.player.vehicleId,
      slip: state.player.slip, wanted: state.player.wanted,
    },
    vehicles: state.vehicles.map((v) => ({
      x: v.x, y: v.y, angle: v.angle, parked: v.parked,
    })),
    distance: state.distance,
  });
}

export function deserializeGame(json) {
  const d = JSON.parse(json);
  if (d.v !== 1) return null;
  const state = createGame(d.seed);
  state.tick = d.tick;
  state.money = d.money;
  state.rngS = d.rngS;
  state.status = d.status;
  state.jobIndex = d.jobIndex;
  d.jobs.forEach((j, i) => {
    state.jobs[i].state = j.state;
    state.jobs[i].deadline = j.deadline;
    state.jobs[i].limit = j.limit;
  });
  state.packagesTaken = d.packagesTaken;
  d.packages.forEach((taken, i) => { state.city.packages[i].taken = taken; });
  Object.assign(state.player, d.player);
  state.player.slipActive = 0;
  state.player.wantedCooldown = 0;
  state.player.hiddenTimer = 0;
  state.player.wrecked = 0;
  d.vehicles.forEach((v, i) => Object.assign(state.vehicles[i], v));
  state.distance = d.distance;
  state.rain = rainAt(state.tick);
  return state;
}
