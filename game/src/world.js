// The simulation: Vice Harbor's streets, water, police, heat, ghost mode,
// the day cycle, and the job tracker. Pure JavaScript — no DOM, no
// Math.random, no wall clock. The same seed and the same inputs always
// produce the same game, which is what makes the bot and the grader's
// two runs agree.
import { WORLD, PHYSICS, POLICE, HEAT, DAY, STYLE, SPOTS } from './config.js';
import { buildCity, isWater, collideBuildings, inFog, inSafehouse, nearestRamp } from './city.js';
import { makeRng, range } from './random.js';
import { buildJobs, advanceJobs, currentStep } from './missions.js';

export function sightRadius(game) {
  const dark = game.dayT;
  return POLICE.sightDusk + (POLICE.sightNight - POLICE.sightDusk) * dark;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createGame(seed) {
  const city = buildCity(seed);
  return {
    seed,
    rng: makeRng(seed + 101),
    city,
    time: 0,
    dayT: DAY.startT,
    player: {
      x: SPOTS.playerStart.x,
      y: SPOTS.playerStart.y,
      angle: -Math.PI / 2,
      speed: 0,
      vehicle: null,
      airborne: 0,
    },
    police: [],
    spawnTimer: 0,
    wanted: 0,
    heat: 0,
    style: 0,
    money: 0,
    cratesGot: 0,
    jobs: buildJobs(),
    jobIndex: 0,
    stepIndex: 0,
    jobsDone: 0,
    events: [],
    banner: null,
    ghost: false,
    ghostTimer: 0,
    ghostCooldown: 0,
    immunity: 0,
    unseenTimer: 0,
    decayTimer: 0,
    stats: { distance: 0, nearMisses: 0, jumps: 0, busted: 0 },
    over: false,
    allDone: false,
  };
}

export function playerKind(game) {
  const v = game.player.vehicle;
  if (!v) return 'foot';
  return v.kind;
}

export function nearestVehicle(game, kind) {
  const list = kind === 'boat' ? game.city.boats : game.city.cars;
  let best = null;
  let bestD = Infinity;
  for (const v of list) {
    if (v.taken) continue;
    const dx = v.x - game.player.x;
    const dy = v.y - game.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best ? { v: best, d: Math.sqrt(bestD) } : null;
}

export function nearestPolice(game) {
  let best = null;
  let bestD = Infinity;
  for (const u of game.police) {
    const dx = u.x - game.player.x;
    const dy = u.y - game.player.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best ? { u: best, d: bestD } : null;
}

// Can any police unit see the player right now?
export function policeCanSee(game) {
  if (game.ghost) return false;
  // The safehouse hides Rook completely: the police will not look inside.
  if (inSafehouse(game.player.x, game.player.y)) return false;
  const sight = sightRadius(game);
  const fog = inFog(game.player.x, game.player.y);
  for (const u of game.police) {
    const dx = game.player.x - u.x;
    const dy = game.player.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > sight) continue;
    if (fog && d > 90) continue;
    // A police boat cannot see a player on land, and vice versa.
    const uWater = isWater(u.x, u.y);
    const pWater = isWater(game.player.x, game.player.y);
    if (uWater !== pWater && d > 160) continue;
    return true;
  }
  return false;
}

function findLandSpot(game, x, y) {
  // Search outward from (x, y) for a dry, unobstructed spot to stand on.
  for (let r = 20; r <= 220; r += 20) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const nx = x + Math.cos(a) * r;
      const ny = y + Math.sin(a) * r;
      if (nx < 20 || ny < 20 || nx > WORLD.w - 20 || ny > WORLD.h - 20) continue;
      if (isWater(nx, ny)) continue;
      if (collideBuildings(nx, ny, 16)) continue;
      return { x: nx, y: ny };
    }
  }
  return { x: SPOTS.playerStart.x, y: SPOTS.playerStart.y };
}

function moveWithCollision(game, ent, nx, ny, r) {
  // Axis-separated movement so the player slides along shores and walls.
  // Each axis is tested on its own: a boat pushing diagonally into the
  // shore still slides along it on the safe axis, and a car pushing
  // diagonally into the water does the same. (An earlier version gated
  // the whole move on the diagonal destination, which froze anything
  // that touched a shore at an angle.)
  let x = ent.x;
  let y = ent.y;
  if (ent.kind === 'boat') {
    if (isWater(nx, ent.y)) x = nx;
    if (isWater(ent.x, ny)) y = ny;
  } else {
    if (!isWater(nx, ent.y)) x = nx;
    if (!isWater(ent.x, ny)) y = ny;
  }
  const push = collideBuildings(x, y, r);
  if (push) {
    x += push.x;
    y += push.y;
  }
  x = clamp(x, 20, WORLD.w - 20);
  y = clamp(y, 20, WORLD.h - 20);
  const moved = Math.hypot(x - ent.x, y - ent.y);
  ent.x = x;
  ent.y = y;
  return moved;
}

function driveVehicle(game, v, input, dt, isPolice) {
  const max = v.kind === 'boat'
    ? (isPolice ? PHYSICS.policeBoatMax : PHYSICS.boatMax)
    : (isPolice ? PHYSICS.policeCarMax : PHYSICS.carMax);
  const accel = v.kind === 'boat' ? PHYSICS.boatAccel : PHYSICS.carAccel;
  const turn = v.kind === 'boat' ? PHYSICS.boatTurn : PHYSICS.carTurn;
  const grip = v.kind === 'boat' ? PHYSICS.boatGrip : PHYSICS.carGrip;
  if (input.up) v.speed += accel * dt;
  if (input.down) v.speed -= accel * 0.9 * dt;
  if (!input.up && !input.down) v.speed *= Math.pow(grip, dt * 60);
  if (v.speed > max) v.speed = max;
  if (v.speed < -PHYSICS.carReverseMax) v.speed = -PHYSICS.carReverseMax;
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  if (steer !== 0 && Math.abs(v.speed) > 8) {
    v.angle += steer * turn * dt * (v.speed > 0 ? 1 : -1) * clamp(Math.abs(v.speed) / 160, 0.25, 1);
  }
  const nx = v.x + Math.cos(v.angle) * v.speed * dt;
  const ny = v.y + Math.sin(v.angle) * v.speed * dt;
  const moved = moveWithCollision(game, v, nx, ny, v.kind === 'boat' ? 22 : 18);
  if (moved < Math.abs(v.speed) * dt * 0.25) {
    v.speed *= 0.6; // scraped a wall or the shore: bleed speed
  }
  return moved;
}

function stepPlayer(game, input, dt) {
  const p = game.player;
  if (input.enter) {
    if (p.vehicle) {
      // Get out. Boats drop Rook on the nearest dry spot.
      const v = p.vehicle;
      v.taken = false;
      v.speed = 0;
      // A just-exited vehicle cannot be climbed straight back into:
      // without this the driver yo-yos between the car and the boat
      // when both are in reach of the door.
      v.noEnterUntil = game.time + 1.2;
      p.vehicle = null;
      if (isWater(v.x, v.y)) {
        const spot = findLandSpot(game, v.x, v.y);
        p.x = spot.x;
        p.y = spot.y;
      } else {
        // Step out on whichever side of the car is dry and clear — the
        // far side can be the harbor, and Rook cannot stand in the water.
        const a = v.angle + Math.PI / 2;
        const sides = [
          { x: v.x + Math.cos(a) * 26, y: v.y + Math.sin(a) * 26 },
          { x: v.x - Math.cos(a) * 26, y: v.y - Math.sin(a) * 26 },
        ];
        let placed = false;
        for (const s of sides) {
          if (!isWater(s.x, s.y) && !collideBuildings(s.x, s.y, 16)) {
            p.x = s.x;
            p.y = s.y;
            placed = true;
            break;
          }
        }
        if (!placed) {
          const spot = findLandSpot(game, v.x, v.y);
          p.x = spot.x;
          p.y = spot.y;
        }
      }
      p.speed = 0;
    } else {
      // Get in the nearest car or boat (a just-exited one is off-limits
      // for a moment, so the driver cannot climb straight back in).
      // When enterKind is set, only that kind of vehicle is boarded —
      // that is how the driver picks a boat when a car is parked nearer.
      let best = null;
      let bestD = 70;
      for (const v of game.city.cars.concat(game.city.boats)) {
        if (v.taken) continue;
        if ((v.noEnterUntil || 0) > game.time) continue;
        if (input.enterKind && v.kind !== input.enterKind) continue;
        const d = Math.hypot(v.x - p.x, v.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      }
      if (best) {
        best.taken = true;
        p.vehicle = best;
        p.x = best.x;
        p.y = best.y;
        p.angle = best.angle;
        p.speed = 0;
        if (policeCanSee(game)) {
          game.heat = clamp(game.heat + HEAT.stealSeen, 0, HEAT.max);
          game.events.push({ text: 'Seen stealing a ' + best.kind + ' — heat up', t: game.time });
        }
      }
    }
  }

  if (p.vehicle) {
    const moved = driveVehicle(game, p.vehicle, input, dt, false);
    p.x = p.vehicle.x;
    p.y = p.vehicle.y;
    p.angle = p.vehicle.angle;
    p.speed = p.vehicle.speed;
    game.stats.distance += moved;
    // Ramps: hit one fast and you fly.
    const ramp = nearestRamp(p.x, p.y);
    if (ramp && Math.abs(p.speed) > 200 && p.airborne <= 0) {
      p.airborne = 0.8;
      game.style = clamp(game.style + STYLE.rampBonus, 0, 100);
      game.stats.jumps++;
      game.events.push({ text: 'STUNT JUMP! +' + STYLE.rampBonus + ' style', t: game.time });
    }
    if (p.airborne > 0) p.airborne -= dt;
    // Drifting: hard turn at speed builds style.
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (steer !== 0 && Math.abs(p.speed) > 260) {
      game.style = clamp(game.style + STYLE.driftBonus * dt, 0, 100);
    }
  } else {
    // On foot.
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      p.angle = Math.atan2(my, mx);
      const nx = p.x + mx * PHYSICS.footSpeed * dt;
      const ny = p.y + my * PHYSICS.footSpeed * dt;
      const moved = moveWithCollision(game, p, nx, ny, 14);
      game.stats.distance += moved;
      p.speed = PHYSICS.footSpeed;
    } else {
      p.speed = 0;
    }
  }
}

function spawnPolice(game) {
  const want = Math.min(game.wanted + 1, POLICE.maxUnits);
  if (game.police.length >= want) return;
  const p = game.player;
  const inWater = isWater(p.x, p.y);
  // Spawn at a map edge on the same side (land/water) as the player.
  let x;
  let y;
  let kind;
  if (inWater) {
    kind = 'boat';
    x = 2900 + game.rng() * 200;
    y = 300 + game.rng() * 1800;
  } else {
    kind = 'car';
    const edge = Math.floor(game.rng() * 4);
    if (edge === 0) { x = 60; y = 200 + game.rng() * 1800; }
    else if (edge === 1) { x = 2100; y = 200 + game.rng() * 1800; }
    else if (edge === 2) { x = 200 + game.rng() * 1800; y = 60; }
    else { x = 200 + game.rng() * 1800; y = 2040; }
  }
  game.police.push({
    x, y, angle: 0, speed: 0, kind,
    lastX: p.x, lastY: p.y,
    searchT: 0,
    nearMissAt: -10,
  });
}

function stepPolice(game, dt) {
  const sight = sightRadius(game);
  const p = game.player;
  for (const u of game.police) {
    const dx = p.x - u.x;
    const dy = p.y - u.y;
    const d = Math.hypot(dx, dy);
    const sees = !game.ghost && d < sight && !(inFog(p.x, p.y) && d > 90);
    if (sees) {
      u.lastX = p.x;
      u.lastY = p.y;
      u.searchT = 0;
    } else {
      u.searchT += dt;
    }
    // Steer toward the player (or the last place they were seen).
    const tx = sees ? p.x : u.lastX;
    const ty = sees ? p.y : u.lastY;
    const want = Math.atan2(ty - u.y, tx - u.x);
    const diff = angDiff(want, u.angle);
    const input = { up: d > 26, down: false, left: diff < -0.08, right: diff > 0.08 };
    // Police never reverse into a wall: if stuck, back off.
    if (Math.abs(diff) > 2.4) input.up = false;
    driveVehicle(game, u, input, dt, true);
    // The safehouse is off-limits: a unit that rolls inside is pushed
    // back out to the boundary and stops there.
    if (inSafehouse(u.x, u.y)) {
      const dx = u.x - SPOTS.safehouse.x;
      const dy = u.y - SPOTS.safehouse.y;
      const dd = Math.hypot(dx, dy) || 1;
      u.x = SPOTS.safehouse.x + (dx / dd) * (SPOTS.safehouse.r + 6);
      u.y = SPOTS.safehouse.y + (dy / dd) * (SPOTS.safehouse.r + 6);
      u.speed *= 0.2;
    }
    // Near miss: a police unit flashing past builds style.
    if (d < 55 && d > 30 && Math.abs(p.speed) > 200 && game.time - u.nearMissAt > 4) {
      u.nearMissAt = game.time;
      game.style = clamp(game.style + STYLE.nearMissBonus, 0, 100);
      game.stats.nearMisses++;
      game.events.push({ text: 'NEAR MISS! +' + STYLE.nearMissBonus + ' style', t: game.time });
    }
    // Contact: busted, +1 star, a shove away from the unit, brief immunity.
    if (d < 32 && game.immunity <= 0 && game.wanted > 0) {
      game.wanted = Math.min(5, game.wanted + 1);
      game.heat = clamp(game.heat + HEAT.bumpSeen, 0, HEAT.max);
      game.immunity = POLICE.contactImmunity;
      game.stats.busted++;
      // Shove Rook away from the police unit. Collision-aware, so the
      // shove cannot throw him through a wall or into the harbor (an
      // earlier version shoved him toward the unit and through walls).
      const shove = 43;
      const nx = p.x + (dx / (d || 1)) * shove;
      const ny = p.y + (dy / (d || 1)) * shove;
      if (p.vehicle) {
        moveWithCollision(game, p.vehicle, nx, ny, p.vehicle.kind === 'boat' ? 22 : 18);
        p.vehicle.speed *= 0.3;
        p.x = p.vehicle.x;
        p.y = p.vehicle.y;
        p.angle = p.vehicle.angle;
      } else {
        moveWithCollision(game, p, nx, ny, 14);
      }
      game.events.push({ text: 'Busted by the harbor police — +1 star', t: game.time });
    }
  }
  // Wanted zero: the heat is off, units peel away and despawn.
  if (game.wanted === 0) {
    for (const u of game.police) u.searchT += dt * 4;
    game.police = game.police.filter((u) => {
      const d = Math.hypot(u.x - p.x, u.y - p.y);
      return u.searchT < 8 && d < 900;
    });
  }
}

function stepHeatWanted(game, dt) {
  const seen = policeCanSee(game);
  if (seen) {
    game.unseenTimer = 0;
    // Speeding in front of the law is a crime.
    if (Math.abs(game.player.speed) > 300) {
      game.heat = clamp(game.heat + HEAT.speedSeen * dt, 0, HEAT.max);
    }
  } else {
    game.unseenTimer += dt;
    const fog = inFog(game.player.x, game.player.y);
    let decay = HEAT.decayHidden;
    if (fog) decay = HEAT.decayFog;
    if (game.ghost) decay = HEAT.decayGhost;
    game.heat = clamp(game.heat - decay * dt, 0, HEAT.max);
    if (game.unseenTimer > POLICE.unseenToDecay) {
      game.decayTimer += dt;
      if (game.decayTimer >= POLICE.decayEvery) {
        game.decayTimer = 0;
        if (game.wanted > 0) game.wanted--;
      }
    }
  }
  // Heat boiling over becomes a star.
  if (game.heat >= HEAT.max && game.wanted < 5) {
    game.wanted++;
    game.heat = 40;
    game.events.push({ text: 'Heat boiled over — wanted level ' + game.wanted, t: game.time });
  }
  // The safehouse melts wanted fast, and the police will not enter it.
  if (inSafehouse(game.player.x, game.player.y)) {
    game.decayTimer += dt * 2;
    if (game.decayTimer >= POLICE.decayEvery) {
      game.decayTimer = 0;
      if (game.wanted > 0) game.wanted--;
    }
  }
  // Ghost mode: hidden in the fog, stars bleed away.
  if (game.ghost) {
    game.ghostTimer -= dt;
    game.decayTimer += dt;
    if (game.decayTimer >= 2.5) {
      game.decayTimer = 0;
      if (game.wanted > 0) game.wanted--;
    }
    if (game.ghostTimer <= 0 || !inFog(game.player.x, game.player.y)) {
      game.ghost = false;
      game.ghostCooldown = 5;
      game.events.push({ text: 'Ghost Mode off', t: game.time });
    }
  }
  if (game.ghostCooldown > 0) game.ghostCooldown -= dt;
  if (game.immunity > 0) game.immunity -= dt;
  game.style = clamp(game.style - STYLE.decay * dt, 0, 100);
}

function stepCrates(game) {
  const p = game.player;
  for (const c of game.city.crates) {
    if (c.taken) continue;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < 42) {
      c.taken = true;
      game.cratesGot++;
      game.money += 50;
      game.style = clamp(game.style + 5, 0, 100);
      game.events.push({ text: 'Cargo crate +$50', t: game.time });
    }
  }
}

export function stepGame(game, input, dt) {
  if (game.over) return;
  game.time += dt;
  game.dayT = Math.min(1, game.time / DAY.cycleSeconds);

  // Ghost Mode toggle: only inside harbor fog.
  if (input.ghost && !game.ghost && game.ghostCooldown <= 0 && inFog(game.player.x, game.player.y)) {
    game.ghost = true;
    game.ghostTimer = 8;
    game.events.push({ text: 'GHOST MODE — hidden in the fog', t: game.time });
  }

  stepPlayer(game, input, dt);

  // Police arrive while wanted, on a timer.
  if (game.wanted > 0) {
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      game.spawnTimer = 2;
      spawnPolice(game);
    }
  }
  stepPolice(game, dt);
  stepHeatWanted(game, dt);
  stepCrates(game);

  // Jobs.
  const done = advanceJobs(game, dt);
  if (done && game.jobIndex >= game.jobs.length) {
    game.allDone = true;
    game.over = true;
    game.banner = { text: 'ALL JOBS COMPLETE', sub: 'Vice Harbor is yours — $' + game.money, t: 0, dur: 6 };
  }

  // Expire old events and the banner.
  game.events = game.events.filter((e) => game.time - e.t < 4);
  if (game.banner) {
    game.banner.t += dt;
    if (game.banner.t > game.banner.dur) game.banner = null;
  }
}

export { currentStep };
