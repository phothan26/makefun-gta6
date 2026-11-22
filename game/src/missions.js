// The story: five jobs for fixer Dante Cole, plus the free-roam taxi fares that keep
// the meter running between jobs. A job is a list of steps; each step names an objective
// the renderer and the autopilot both read.
import { CAR, MISSION, PALETTE, TIME, WORLD } from './config.js';
import { createCar } from './vehicles.js';
import { createFootCop } from './pedestrians.js';
import { commitCrime } from './player.js';

export const JOBS = [
  {
    id: 1,
    title: 'THE INTERVIEW',
    client: 'DANTE COLE',
    briefing: 'Fresh out, Mara? Prove you can drive. Take any car on the street and bring it to my garage. No cops, no fuss.',
    reward: 150,
    startTime: 0.1,
    steps: [
      { type: 'enterCar', label: 'Steal a car (walk up to one, press E)' },
      { type: 'goto', x: 760, y: 1840, label: "Drive to Dante's Garage", radius: 70 },
    ],
  },
  {
    id: 2,
    title: 'GOLDEN HOUR RUN',
    client: 'DANTE COLE',
    briefing: 'A package for the Miramar, and the sun is going down. Get it there before dark. The city pays for fast, not for careful.',
    reward: 300,
    timeLimit: 80,
    startTime: 0.22,
    steps: [
      { type: 'goto', x: 360, y: 1520, label: 'Pick up the package at the Pier Arcade', radius: 60 },
      { type: 'goto', x: 360, y: 1160, label: 'Deliver to Hotel Miramar', radius: 70 },
    ],
  },
  {
    id: 3,
    title: 'FARE PLAY',
    client: 'THE CITY',
    briefing: 'Slow night. Work the stands: three fares, three drop-offs. Tips are better when the ride is smooth — no crashes, no cops.',
    reward: 250,
    startTime: 0.4,
    steps: [
      { type: 'fare', stand: 0, label: 'Pick up the fare at Hotel Miramar' },
      { type: 'fare', stand: 1, label: 'Pick up the fare at St. Marina' },
      { type: 'fare', stand: 2, label: 'Pick up the fare at the Neon Museum' },
    ],
  },
  {
    id: 4,
    title: 'COLD TRAIL',
    client: 'DANTE COLE',
    briefing: 'You are hot — three stars and the whole NBPD on your tail. Lose them. Swap cars to shed a star, break line of sight, and vanish.',
    reward: 400,
    timeLimit: 150,
    startTime: 0.55,
    startWanted: 3,
    steps: [
      { type: 'loseHeat', label: 'Lose the heat: wanted level to zero' },
    ],
  },
  {
    id: 5,
    title: 'SUNSET GETAWAY',
    client: 'DANTE COLE',
    briefing: 'The last job. Pick up the crew at the Neon Museum, punch through the roadblocks, and be on the pier when the sun touches the water.',
    reward: 800,
    timeLimit: 170,
    startTime: 0.7,
    startWanted: 2,
    steps: [
      { type: 'goto', x: 2000, y: 830, label: 'Pick up the crew at the Neon Museum', radius: 70 },
      { type: 'goto', x: -110, y: 1250, label: 'Reach the end of the pier', radius: 60 },
    ],
  },
];

const FARE_DESTINATIONS = [
  { x: 2400, y: 470, label: 'St. Marina Hospital' },
  { x: 2800, y: 2180, label: 'NBPD Headquarters' },
  { x: 360, y: 1520, label: 'The Pier Arcade' },
  { x: 1400, y: 1250, label: 'Bayview Park' },
  { x: 600, y: 200, label: 'North Gate' },
];

export function createMissions() {
  return {
    jobIndex: -1, // -1: free roam, no job active
    stepIndex: 0,
    timer: 0,
    status: 'idle', // idle | brief | active | complete | failed
    fare: null, // { stand, dest, state: 'waiting' | 'riding', rider }
    fareCooldown: 6,
    roadblocks: [],
    lastPayout: 0,
    lastStyleBonus: 0,
  };
}

export function startJob(world, index) {
  const missions = world.missions;
  const job = JOBS[index];
  missions.jobIndex = index;
  missions.stepIndex = 0;
  missions.timer = job.timeLimit || 0;
  missions.status = 'brief';
  missions.roadblocks = [];
  // The sun sets across every job: each one starts at its own hour.
  world.time = job.startTime * TIME.cycleSeconds;
  if (job.startWanted) {
    world.player.wanted = job.startWanted;
    world.player.quietTimer = 0;
  }
  if (job.id === 5) {
    // The finale: two roadblocks of parked police cars across the pier road.
    const spots = [
      { x: 600, y: 1250, angle: Math.PI / 2 },
      { x: 600, y: 1200, angle: Math.PI / 2 },
      { x: 600, y: 1300, angle: Math.PI / 2 },
      { x: 200, y: 1250, angle: Math.PI / 2 },
      { x: 200, y: 1200, angle: Math.PI / 2 },
    ];
    for (const s of spots) {
      const car = createCar({ x: s.x, y: s.y, angle: s.angle, kind: 'cop', color: PALETTE.cop, owner: 'parked' });
      car.heavy = true;
      world.parked.push(car);
      missions.roadblocks.push(car);
    }
  }
  world.events.push({ type: 'job', x: world.player.x, y: world.player.y });
}

export function currentStep(world) {
  const m = world.missions;
  if (m.jobIndex < 0 || m.status !== 'active') return null;
  return JOBS[m.jobIndex].steps[m.stepIndex] || null;
}

/** Where the objective marker sits right now, for the HUD, the minimap and the bot. */
export function currentObjective(world) {
  const m = world.missions;
  const step = currentStep(world);
  if (step) {
    if (step.type === 'goto') return { x: step.x, y: step.y, label: step.label };
    if (step.type === 'enterCar') {
      // The nearest parked car, not the first in the list and never a moving
      // one: the player walks to a car that stays where it is.
      let best = null;
      let bestD = Infinity;
      for (const car of world.parked) {
        const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
        if (d < bestD) { bestD = d; best = car; }
      }
      if (!best) {
        for (const car of world.traffic) {
          const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
          if (d < bestD) { bestD = d; best = car; }
        }
      }
      return best ? { x: best.x, y: best.y, label: step.label } : null;
    }
    if (step.type === 'fare') {
      if (m.fare && m.fare.state === 'riding') return { x: m.fare.dest.x, y: m.fare.dest.y, label: `Drop off at ${m.fare.dest.label}` };
      const stand = world.city.taxiStands[step.stand];
      return { x: stand.x, y: stand.y, label: step.label };
    }
    if (step.type === 'loseHeat') return null;
  }
  if (m.fare && m.fare.state === 'waiting') {
    return { x: m.fare.stand.x, y: m.fare.stand.y, label: 'Pick up a fare' };
  }
  if (m.fare && m.fare.state === 'riding') {
    return { x: m.fare.dest.x, y: m.fare.dest.y, label: `Drop off at ${m.fare.dest.label}` };
  }
  return null;
}

function completeStep(world) {
  const m = world.missions;
  m.stepIndex += 1;
  world.player.style += 20;
  world.audio.sfx('cash');
  if (m.stepIndex >= JOBS[m.jobIndex].steps.length) completeJob(world);
}

function completeJob(world) {
  const m = world.missions;
  const job = JOBS[m.jobIndex];
  const styleBonus = Math.min(Math.floor(world.player.style), 200);
  const payout = job.reward + styleBonus;
  world.player.cash += payout;
  m.lastPayout = payout;
  m.lastStyleBonus = styleBonus;
  m.status = 'complete';
  world.save.unlockedJob = Math.max(world.save.unlockedJob, m.jobIndex + 1);
  world.save.cash = world.player.cash;
  world.save.write();
  world.audio.sfx('cash');
  world.events.push({ type: 'jobDone', x: world.player.x, y: world.player.y });
}

export function failJob(world, reason) {
  const m = world.missions;
  m.status = 'failed';
  m.failReason = reason;
  world.audio.sfx('busted');
}

export function continueAfterJob(world, unlockNext = true) {
  const m = world.missions;
  const next = m.jobIndex + 1;
  m.jobIndex = -1;
  m.stepIndex = 0;
  m.status = 'idle';
  m.fareCooldown = 4;
  if (unlockNext && next < JOBS.length) {
    // The next job opens at once: the player can take it from the pause menu or the map.
    world.save.unlockedJob = Math.max(world.save.unlockedJob, next);
    world.save.write();
  } else if (unlockNext) {
    world.save.unlockedJob = JOBS.length;
    world.save.write();
  }
}

/** Keep the police presence matched to the wanted level. */
export function updatePolicePresence(world, dt) {
  const wanted = world.player.wanted;
  const px = world.player.x;
  const py = world.player.y;
  // Cop cars: one per star, spawned out of sight on a road.
  while (world.cops.length < wanted) {
    const angle = world.rng.range(0, Math.PI * 2);
    const dist = 700;
    let x = px + Math.cos(angle) * dist;
    let y = py + Math.sin(angle) * dist;
    x = Math.max(240, Math.min(WORLD.width - 40, x));
    y = Math.max(40, Math.min(WORLD.height - 40, y));
    const node = { x, y };
    const car = createCar({ x: node.x, y: node.y, angle: world.rng.range(0, Math.PI * 2), kind: 'cop', color: PALETTE.cop, owner: 'cop' });
    world.cops.push(car);
  }
  while (world.cops.length > wanted) world.cops.pop();
  // Foot cops when the player is on foot and wanted.
  const wantFoot = !world.player.car && wanted > 0 ? Math.min(2, wanted) : 0;
  while (world.footCops.length < wantFoot) {
    const angle = world.rng.range(0, Math.PI * 2);
    world.footCops.push(createFootCop(
      Math.max(60, Math.min(WORLD.width - 20, px + Math.cos(angle) * 420)),
      Math.max(20, Math.min(WORLD.height - 20, py + Math.sin(angle) * 420))));
  }
  while (world.footCops.length > wantFoot) world.footCops.pop();
}

export function updateMissions(world, dt) {
  const m = world.missions;
  const player = world.player;
  if (m.status === 'active') {
    const job = JOBS[m.jobIndex];
    if (job.timeLimit) {
      m.timer -= dt;
      if (m.timer <= 0) { failJob(world, 'Out of time.'); return; }
    }
    const step = currentStep(world);
    if (!step) return;
    if (step.type === 'enterCar') {
      if (player.car) completeStep(world);
    } else if (step.type === 'goto') {
      if (Math.hypot(step.x - player.x, step.y - player.y) < step.radius) completeStep(world);
    } else if (step.type === 'fare') {
      if (!m.fare) {
        const stand = world.city.taxiStands[step.stand];
        m.fare = { stand, dest: null, state: 'waiting', rider: null };
        const rider = world.peds.find((p) => Math.hypot(p.x - stand.x, p.y - stand.y) < 200)
          || world.peds[0];
        m.fare.rider = rider;
        if (rider) { rider.target = stand; rider.state = 'walk'; }
      }
      if (m.fare.state === 'waiting') {
        const stand = m.fare.stand;
        if (player.car && Math.hypot(stand.x - player.x, stand.y - player.y) < 55) {
          m.fare.dest = world.rng.pick(FARE_DESTINATIONS);
          m.fare.state = 'riding';
          world.events.push({ type: 'fare', x: stand.x, y: stand.y });
        }
      } else if (m.fare.state === 'riding') {
        if (Math.hypot(m.fare.dest.x - player.x, m.fare.dest.y - player.y) < 60) {
          const fare = MISSION.taxiFareBase + world.rng.int(0, 60);
          player.cash += fare;
          player.style += 20;
          world.events.push({ type: 'fareDone', x: player.x, y: player.y });
          world.audio.sfx('cash');
          m.fare = null;
          completeStep(world);
        }
      }
    } else if (step.type === 'loseHeat') {
      if (player.wanted === 0) completeStep(world);
    }
    return;
  }
  // Free roam: a fare waits at a stand every so often.
  if (m.jobIndex < 0 && !m.fare) {
    m.fareCooldown -= dt;
    if (m.fareCooldown <= 0) {
      const stand = world.rng.pick(world.city.taxiStands);
      m.fare = { stand, dest: null, state: 'waiting', rider: null };
      m.fareCooldown = 25;
    }
  }
  if (m.fare && m.fare.state === 'waiting' && player.car
    && Math.hypot(m.fare.stand.x - player.x, m.fare.stand.y - player.y) < 55) {
    m.fare.dest = world.rng.pick(FARE_DESTINATIONS);
    m.fare.state = 'riding';
    world.events.push({ type: 'fare', x: m.fare.stand.x, y: m.fare.stand.y });
  }
  if (m.fare && m.fare.state === 'riding'
    && Math.hypot(m.fare.dest.x - player.x, m.fare.dest.y - player.y) < 60) {
    const fare = MISSION.taxiFareBase + world.rng.int(0, 60);
    player.cash += fare;
    player.style += 20;
    world.events.push({ type: 'fareDone', x: player.x, y: player.y });
    world.audio.sfx('cash');
    m.fare = null;
    m.fareCooldown = 18;
  }
}
