// MARSHLIGHT simulation: pure logic, no DOM, no clock. The same code runs
// in the browser (60 ticks a second) and in Node for the headless bot, so a
// run is byte-for-byte reproducible from its seed.
import { terrainAt, tideAt, inReeds, buildWorld, PLACES } from './world.js';

export const TICK_RATE = 60;
export const DAY_TICKS = 21600; // dawn 06:00 to dusk 18:00

const JOBS = [
  { id: 1, name: 'First Light', pay: 200,
    brief: 'Beau: grab the package at my shop and run it to the Stilt House before noon.',
    steps: [
      { kind: 'pickup', at: 'baitShop', label: 'Pick up the package at Beau\u2019s Bait Shop' },
      { kind: 'deliver', at: 'stiltHouse', label: 'Deliver it to the Stilt House before noon' },
    ] },
  { id: 2, name: 'High Water', pay: 300,
    brief: 'Beau: three crates washed into the side channels. Fish them out while the tide is up.',
    steps: [
      { kind: 'collect', at: 'crateA1', label: 'Collect crate A1 in the upper channel' },
      { kind: 'collect', at: 'crateA2', label: 'Collect crate A2 in the upper channel' },
      { kind: 'collect', at: 'crateB1', label: 'Collect crate B1 in the lower channel' },
      { kind: 'deliver', at: 'baitShop', label: 'Bring the crates back to Beau' },
    ] },
  { id: 3, name: 'Gator Country', pay: 400,
    brief: 'Beau: a client needs through the gator channel. Do NOT touch a gator. He is watching.',
    steps: [
      { kind: 'pickup', at: 'gatorWest', label: 'Pick up the client at the west mouth' },
      { kind: 'escort', at: 'gatorEast', label: 'Get the client through the gator channel' },
    ] },
  { id: 4, name: 'Mud Ghost', pay: 500,
    brief: 'Beau: the heat is on you. Vanish in the reeds, then run the package to the Far Dock.',
    steps: [
      { kind: 'hide', label: 'Hide in the reeds until the stars are gone' },
      { kind: 'pickup', at: 'baitShop', label: 'Pick up the package at Beau\u2019s' },
      { kind: 'deliver', at: 'farDock', label: 'Deliver it to the Far Dock' },
    ] },
  { id: 5, name: 'The Last Run', pay: 800,
    brief: 'Beau: four drops, one falling tide, a helicopter overhead. This is the one they will remember.',
    steps: [
      { kind: 'deliver', at: 'baitShop', label: 'Drop 1 of 4: Beau\u2019s Bait Shop' },
      { kind: 'deliver', at: 'stiltHouse', label: 'Drop 2 of 4: Stilt House' },
      { kind: 'deliver', at: 'farDock', label: 'Drop 3 of 4: Far Dock' },
      { kind: 'deliver', at: 'southDock', label: 'Drop 4 of 4: South Dock' },
    ] },
];

const BOAT_PATROL = [[320, 250], [300, 700], [350, 1100], [380, 1500], [350, 1750]];
const CAR_PATROL = [[400, 185], [1800, 185], [2045, 800], [2045, 1500], [1200, 1655]];

export function createGame(seed) {
  const world = buildWorld(seed);
  const s = {
    seed, tick: 0, world,
    player: { x: 300, y: 340, heading: -Math.PI / 2, mode: 'airboat', speed: 0 },
    airboat: { x: 300, y: 340, heading: -Math.PI / 2, vx: 0, vy: 0 },
    car: { x: 600, y: 185, heading: 0, vx: 0, vy: 0 },
    health: 100, cash: 0, style: 50, wanted: 0,
    carrying: false, hasClient: false,
    jobIndex: 0, stepIndex: 0, jobStartTick: 0,
    hideTimer: 0, sightTimer: 0, unseenTimer: 0, lastHurtTick: -9999,
    slowTimer: 0, nearMissCooldown: 0, touchCooldown: 0,
    busted: 0, complete: false, paused: false,
    boats: BOAT_PATROL.map(([x, y], i) => ({
      x, y, heading: 0, vx: 0, vy: 0, mode: 'patrol', wp: (i + 1) % BOAT_PATROL.length,
    })),
    cars: CAR_PATROL.map(([x, y], i) => ({
      x, y, heading: 0, vx: 0, vy: 0, mode: 'patrol', wp: (i + 1) % CAR_PATROL.length,
    })),
    heli: { active: false, x: 300, y: 200 },
    gatorCooldown: world.gators.map(() => 0),
    events: [],
    report: {
      title: 'MARSHLIGHT — Gator Country Run', hero: 'Willa "Marsh" Okafor',
      fixer: 'Beau Toussaint', seed, jobs: [], cachesFound: 0, cachesTotal: 12,
      cash: 0, style: 50, ticks: 0, busted: 0, complete: false,
    },
  };
  return s;
}

export function timeOfDay(s) {
  const minutes = 360 + s.tick / 30;
  const hour = Math.floor(minutes / 60);
  const minute = Math.floor(minutes % 60);
  const label = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const daylight = Math.sin((Math.PI * (minutes - 360)) / 720);
  return { hour, minute, label, sight: 220 + 200 * Math.max(0, daylight) };
}

export function currentJob(s) {
  return JOBS[s.jobIndex] ?? null;
}

export function currentStep(s) {
  const job = currentJob(s);
  return job ? job.steps[s.stepIndex] : null;
}

export function objectiveText(s) {
  const job = currentJob(s);
  if (!job) return 'Story complete — the marsh is yours.';
  const step = job.steps[s.stepIndex];
  return `${job.name} — ${step.label}`;
}

function turnToward(heading, target, maxTurn) {
  let d = target - heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return heading + Math.max(-maxTurn, Math.min(maxTurn, d));
}

function moveVehicle(v, heading, throttle, maxSpeed, turnRate, input, drag, accelBase) {
  let h = v.heading;
  if (input.left) h -= turnRate;
  if (input.right) h += turnRate;
  // Keep the heading wrapped: the bot reads heading changes to tell a
  // turn from being stuck, and an unwrapped heading breaks that read.
  while (h > Math.PI) h -= Math.PI * 2;
  while (h < -Math.PI) h += Math.PI * 2;
  const accel = throttle * accelBase;
  // Braking (reverse throttle) bites harder than coasting, so the boat
  // can actually stop before a sharp turn instead of sliding past it.
  const effectiveDrag = throttle < 0 ? Math.min(drag, 0.9) : drag;
  v.vx += Math.cos(h) * accel;
  v.vy += Math.sin(h) * accel;
  // Split velocity into forward (along the hull) and lateral parts: a
  // boat keeps its forward speed, but the hull grips the water sideways,
  // so lateral slide dies fast instead of carrying it into the bank.
  const fx = Math.cos(h), fy = Math.sin(h);
  const dot = v.vx * fx + v.vy * fy;
  const fwd = dot * effectiveDrag;
  const lx = (v.vx - dot * fx) * 0.7;
  const ly = (v.vy - dot * fy) * 0.7;
  v.vx = fwd * fx + lx;
  v.vy = fwd * fy + ly;
  const sp = Math.hypot(v.vx, v.vy);
  if (sp > maxSpeed) { v.vx = (v.vx / sp) * maxSpeed; v.vy = (v.vy / sp) * maxSpeed; }
  v.heading = h;
  return Math.hypot(v.vx, v.vy);
}

function tryMove(s, v, allowed) {
  const nx = v.x + v.vx, ny = v.y + v.vy;
  const t = terrainAt(nx, ny, s.tick);
  if (allowed.includes(t)) { v.x = nx; v.y = ny; return; }
  const tx = terrainAt(nx, v.y, s.tick);
  if (allowed.includes(tx)) { v.x = nx; v.vx *= 0.4; return; }
  const ty = terrainAt(v.x, ny, s.tick);
  if (allowed.includes(ty)) { v.y = ny; v.vy *= 0.4; return; }
  v.vx *= 0.4; v.vy *= 0.4;
}

function hurt(s, amount, why) {
  s.health -= amount;
  s.lastHurtTick = s.tick;
  s.events.push(why);
}

export function stepGame(s, input) {
  s.events = [];
  if (s.complete || s.paused) return;
  s.tick++;
  const p = s.player;
  const sight = timeOfDay(s).sight;

  // --- player movement ---
  if (input.enter) {
    if (p.mode === 'foot') {
      if (Math.hypot(p.x - s.airboat.x, p.y - s.airboat.y) < 70) {
        p.mode = 'airboat'; s.events.push('board-boat');
      } else if (Math.hypot(p.x - s.car.x, p.y - s.car.y) < 70) {
        p.mode = 'car'; s.events.push('board-car');
      }
    } else {
      p.mode = 'foot';
      p.x += Math.cos(p.heading + Math.PI / 2) * 30;
      p.y += Math.sin(p.heading + Math.PI / 2) * 30;
      s.events.push('on-foot');
    }
  }
  if (p.mode === 'foot') {
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len; dy /= len;
      p.heading = Math.atan2(dy, dx);
      const nx = p.x + dx * 2.2, ny = p.y + dy * 2.2;
      const t = terrainAt(nx, ny, s.tick);
      if (t !== 'water') { p.x = nx; p.y = ny; }
      p.speed = 2.2;
    } else p.speed = 0;
  } else if (p.mode === 'airboat') {
    const v = s.airboat;
    const t = terrainAt(v.x, v.y, s.tick);
    const max = s.slowTimer > 0 ? 3 : t === 'water' ? 6.0 : 3.0;
    const throttle = input.up ? 1 : input.down ? -0.5 : 0;
    p.speed = moveVehicle(v, v.heading, throttle, max, 0.09, input, 0.97, 0.22);
    tryMove(s, v, ['water', 'mud', 'reed']);
    p.x = v.x; p.y = v.y; p.heading = v.heading;
  } else {
    const v = s.car;
    const t = terrainAt(v.x, v.y, s.tick);
    const max = t === 'road' ? 5.5 : t === 'land' ? 2.5 : 1.2;
    const throttle = input.up ? 1 : input.down ? -0.6 : 0;
    p.speed = moveVehicle(v, v.heading, throttle, max, 0.09, input, 0.95, 0.25);
    tryMove(s, v, ['road', 'land', 'mud']);
    p.x = v.x; p.y = v.y; p.heading = v.heading;
  }
  if (s.slowTimer > 0) s.slowTimer--;
  if (s.touchCooldown > 0) s.touchCooldown--;
  if (s.nearMissCooldown > 0) s.nearMissCooldown--;

  // --- gators drift and bite ---
  const w = s.world;
  for (let i = 0; i < w.gators.length; i++) {
    const g = w.gators[i];
    g.x = g.ax + Math.cos(s.tick * 0.01 * g.speed + g.phase) * g.radius;
    g.y = g.ay + Math.sin(s.tick * 0.008 * g.speed + g.phase) * g.radius;
    if (s.gatorCooldown[i] > 0) s.gatorCooldown[i]--;
    const d = Math.hypot(p.x - g.x, p.y - g.y);
    if (d < 34 && s.gatorCooldown[i] === 0 && p.mode !== 'car') {
      s.gatorCooldown[i] = 180;
      hurt(s, 15, 'bite');
      s.style = Math.max(0, s.style - 8);
      s.slowTimer = 120;
      s.events.push('gator');
      if (s.hasClient) {
        // The client panics: the escort leg restarts.
        s.hasClient = false;
        s.stepIndex = 0;
        s.events.push('client-fled');
      }
    }
  }

  // --- police boats ---
  const hidden = inReeds(p.x, p.y);
  for (const b of s.boats) {
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    const sees = s.wanted > 0 && d < sight && !hidden;
    if (sees) b.mode = 'chase';
    else if (d > sight * 1.4) b.mode = 'patrol';
    if (b.mode === 'chase') {
      const want = Math.atan2(p.y - b.y, p.x - b.x);
      b.heading = turnToward(b.heading, want, 0.07);
      b.vx += Math.cos(b.heading) * 0.10; b.vy += Math.sin(b.heading) * 0.10;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 5.0) { b.vx = (b.vx / sp) * 5.0; b.vy = (b.vy / sp) * 5.0; }
      b.vx *= 0.97; b.vy *= 0.97;
      tryMove(s, b, ['water', 'mud', 'reed']);
      if (b.mode === 'chase' && d < 38 && s.touchCooldown === 0) {
        s.touchCooldown = 120;
        hurt(s, 10, 'rammed');
        s.style = Math.max(0, s.style - 5);
        if (s.carrying && s.wanted < 5) s.wanted++;
      }
    } else {
      const [wx, wy] = BOAT_PATROL[b.wp];
      const want = Math.atan2(wy - b.y, wx - b.x);
      b.heading = turnToward(b.heading, want, 0.05);
      b.vx += Math.cos(b.heading) * 0.06; b.vy += Math.sin(b.heading) * 0.06;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 2.5) { b.vx = (b.vx / sp) * 2.5; b.vy = (b.vy / sp) * 2.5; }
      b.vx *= 0.97; b.vy *= 0.97;
      tryMove(s, b, ['water', 'mud', 'reed']);
      if (Math.hypot(wx - b.x, wy - b.y) < 50) b.wp = (b.wp + 1) % BOAT_PATROL.length;
    }
    if (d < 90 && d >= 38 && s.nearMissCooldown === 0 && s.wanted > 0) {
      s.nearMissCooldown = 300;
      s.style = Math.min(100, s.style + 2);
      s.events.push('nearmiss');
    }
  }

  // --- police cars (roads only) ---
  for (const c of s.cars) {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    const onRoad = p.mode === 'car' || terrainAt(p.x, p.y, s.tick) === 'road';
    if (s.wanted > 0 && d < sight && onRoad && !hidden) c.mode = 'chase';
    else if (d > sight * 1.4) c.mode = 'patrol';
    const target = c.mode === 'chase' ? [p.x, p.y] : CAR_PATROL[c.wp];
    const want = Math.atan2(target[1] - c.y, target[0] - c.x);
    c.heading = turnToward(c.heading, want, 0.06);
    c.vx += Math.cos(c.heading) * 0.1; c.vy += Math.sin(c.heading) * 0.1;
    const sp = Math.hypot(c.vx, c.vy);
    const max = c.mode === 'chase' ? 5.0 : 3.0;
    if (sp > max) { c.vx = (c.vx / sp) * max; c.vy = (c.vy / sp) * max; }
    c.vx *= 0.96; c.vy *= 0.96;
    tryMove(s, c, ['road', 'land']);
    if (c.mode === 'patrol' && Math.hypot(target[0] - c.x, target[1] - c.y) < 50) {
      c.wp = (c.wp + 1) % CAR_PATROL.length;
    }
  }

  // --- helicopter ---
  const job = currentJob(s);
  s.heli.active = s.wanted >= 3 || (job && job.id === 5);
  if (s.heli.active) {
    s.heli.x += (p.x + 60 - s.heli.x) * 0.02;
    s.heli.y += (p.y - 90 - s.heli.y) * 0.02;
  }

  // --- wanted level ---
  const jobId = job ? job.id : 0;
  if (jobId === 3) {
    s.wanted = 2; // scripted heat for the escort
  } else {
    const seenByPolice = s.carrying && !hidden &&
      (s.boats.some((b) => Math.hypot(p.x - b.x, p.y - b.y) < sight) ||
       s.cars.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < sight));
    if (seenByPolice) {
      s.sightTimer++;
      s.unseenTimer = 0;
      if (s.sightTimer >= 300 && s.wanted < 5) {
        s.wanted++; s.sightTimer = 0; s.events.push('heat-up');
      }
    } else {
      s.sightTimer = 0;
      s.unseenTimer++;
      if (s.unseenTimer > 1200 && s.wanted > 0) {
        s.wanted--; s.unseenTimer = 0; s.events.push('heat-down');
      }
    }
    if (hidden && p.speed < 0.5 && s.wanted > 0) {
      s.hideTimer++;
      if (s.hideTimer >= 240) {
        s.wanted--; s.hideTimer = 0; s.events.push('ghost');
      }
    } else s.hideTimer = 0;
  }

  // --- health regen and busted ---
  if (s.tick - s.lastHurtTick > 300 && s.health < 100) s.health = Math.min(100, s.health + 0.02);
  if (s.health <= 0) {
    s.busted++;
    s.report.busted = s.busted;
    s.health = 100; s.wanted = 0; s.carrying = false; s.hasClient = false;
    s.stepIndex = 0;
    s.airboat.x = 300; s.airboat.y = 340; s.airboat.vx = 0; s.airboat.vy = 0;
    s.airboat.heading = -Math.PI / 2;
    p.x = 300; p.y = 340; p.mode = 'airboat'; p.heading = -Math.PI / 2;
    s.events.push('busted');
  }

  // --- caches ---
  for (const c of w.caches) {
    if (!c.found && Math.hypot(p.x - c.x, p.y - c.y) < 42) {
      c.found = true;
      s.cash += 50;
      s.style = Math.min(100, s.style + 2);
      s.report.cachesFound++;
      s.events.push('cache');
    }
  }

  // --- job steps ---
  const step = currentStep(s);
  if (step) {
    if (step.kind === 'hide') {
      if (s.wanted === 0) completeStep(s);
    } else {
      const place = PLACES[step.at];
      if (place && Math.hypot(p.x - place.x, p.y - place.y) < 48) {
        const kind = step.kind, at = step.at;
        if (kind === 'pickup') { s.carrying = true; completeStep(s); s.events.push('pickup'); }
        else if (kind === 'collect') { s.carrying = true; completeStep(s); s.events.push('crate'); }
        else if (kind === 'escort') {
          if (s.hasClient) { s.hasClient = false; s.carrying = false; completeStep(s); s.events.push('escort-done'); }
        } else if (kind === 'deliver') { s.carrying = false; completeStep(s); s.events.push('deliver'); }
        if (kind === 'pickup' && at === 'gatorWest') s.hasClient = true;
      }
    }
  }

  s.report.cash = s.cash;
  s.report.style = Math.round(s.style);
  s.report.ticks = s.tick;
}

function completeStep(s) {
  const job = currentJob(s);
  s.stepIndex++;
  if (s.stepIndex >= job.steps.length) {
    let pay = job.pay;
    if (job.id === 1 && s.tick < 10800) pay += 100; // before noon
    if (job.id === 2 && tideAt(s.tick) > 0) pay += 150; // tide still up
    if (job.id === 5 && s.tick < 19800) pay += 200; // before dusk
    s.cash += pay;
    s.style = Math.min(100, s.style + 5);
    s.report.jobs.push({ name: job.name, ticks: s.tick - s.jobStartTick, cash: pay });
    s.events.push('jobdone');
    s.jobIndex++;
    s.stepIndex = 0;
    s.jobStartTick = s.tick;
    s.carrying = false;
    const next = currentJob(s);
    if (!next) {
      s.complete = true;
      s.report.complete = true;
      s.events.push('story-done');
    } else if (next.id === 4) {
      s.wanted = 3;
    } else if (next.id === 5) {
      s.carrying = true;
    }
  }
}
