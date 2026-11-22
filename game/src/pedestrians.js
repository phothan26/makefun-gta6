// Pedestrians who stroll the sidewalks and flee from danger, and foot police who chase
// the player down and try to bust them.
import { PALETTE, PLAYER, WANTED, WORLD } from './config.js';
import { isOnRoad, nearestNode, resolveBuildings } from './city.js';

export function createPed(rng, city) {
  // Start on a sidewalk: just off a road, on a block edge.
  const avenue = rng.pick(WORLD.avenues);
  const street = rng.pick(WORLD.streets);
  const side = rng.pick([-1, 1]);
  return {
    x: avenue + side * (WORLD.roadHalf + 14),
    y: street + rng.range(-140, 140),
    angle: rng.range(0, Math.PI * 2),
    speed: rng.range(38, 70),
    state: 'walk',
    down: false,
    downTimer: 0,
    target: null,
    shirt: rng.pick(PALETTE.pedShirt),
    skin: rng.pick(PALETTE.ped),
    radius: 11,
    vx: 0,
    vy: 0,
  };
}

function pickSidewalkTarget(ped, rng) {
  // Walk to a nearby point just off a road: pedestrians stay on the pavement.
  const avenue = rng.pick(WORLD.avenues);
  const street = rng.pick(WORLD.streets);
  const side = rng.pick([-1, 1]);
  return { x: avenue + side * (WORLD.roadHalf + 14), y: street + rng.range(-160, 160) };
}

export function updatePeds(world, dt) {
  const player = world.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  const playerSpeed = player.car ? player.car.speed : 0;
  for (const ped of world.peds) {
    if (ped.down) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) { ped.down = false; ped.state = 'flee'; }
      continue;
    }
    const dx = ped.x - px;
    const dy = ped.y - py;
    const dist = Math.hypot(dx, dy);
    const danger = (player.car && playerSpeed > 120 && dist < 170)
      || (world.player.wanted > 0 && dist < 130)
      || world.cops.some((c) => Math.hypot(c.x - ped.x, c.y - ped.y) < 90);
    if (danger) ped.state = 'flee';
    else if (ped.state === 'flee' && dist > 320) ped.state = 'walk';
    if (ped.state === 'flee') {
      const away = Math.atan2(dy, dx);
      ped.angle = away;
      ped.x += Math.cos(away) * 150 * dt;
      ped.y += Math.sin(away) * 150 * dt;
    } else {
      if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 18) {
        ped.target = pickSidewalkTarget(ped, world.rng);
      }
      const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
      ped.angle = want;
      ped.x += Math.cos(want) * ped.speed * dt;
      ped.y += Math.sin(want) * ped.speed * dt;
    }
    // Keep pedestrians out of buildings and inside the city.
    resolveBuildings(world.city, ped);
    // A fast car that clips a pedestrian knocks them down: a crime, and a witness.
    if (player.car && playerSpeed > 140 && dist < PLAYER.radius + ped.radius + 2) {
      ped.down = true;
      ped.downTimer = 6;
      world.events.push({ type: 'hitPed', x: ped.x, y: ped.y });
    }
  }
}

export function createFootCop(x, y) {
  return {
    x, y, angle: 0, speed: 235, radius: 12,
    state: 'chase', bust: 0, vx: 0, vy: 0,
  };
}

/** Foot police: run the player down; stay close for a moment and the bust lands. */
export function updateFootCops(world, dt) {
  const player = world.player;
  for (const cop of world.footCops) {
    const dx = player.x - cop.x;
    const dy = player.y - cop.y;
    const dist = Math.hypot(dx, dy);
    if (player.car) {
      // On foot no more: head for the player's car and wait by it.
      const tx = player.car.x;
      const ty = player.car.y;
      const d = Math.hypot(tx - cop.x, ty - cop.y);
      if (d > 60) {
        cop.angle = Math.atan2(ty - cop.y, tx - cop.x);
        cop.x += Math.cos(cop.angle) * cop.speed * dt;
        cop.y += Math.sin(cop.angle) * cop.speed * dt;
      }
      cop.bust = 0;
    } else if (dist < 46) {
      cop.bust += dt;
      if (cop.bust >= WANTED.bustSeconds) {
        world.events.push({ type: 'busted', x: player.x, y: player.y });
        cop.bust = 0;
      }
    } else {
      cop.bust = Math.max(0, cop.bust - dt);
      cop.angle = Math.atan2(dy, dx);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
    }
    resolveBuildings(world.city, cop);
  }
}

export { isOnRoad, nearestNode };
