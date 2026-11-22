// The player: Mara Voss, on foot or behind the wheel. Holds cash, health, wanted stars
// and the style meter, and owns the rules that raise and lower the heat.
import { CAR, MISSION, PLAYER, STYLE, WANTED } from './config.js';
import { createCar, driveCar } from './vehicles.js';
import { resolveBuildings } from './city.js';

export function createPlayer(spawn) {
  return {
    x: spawn.x, y: spawn.y, angle: -Math.PI / 2,
    vx: 0, vy: 0,
    radius: PLAYER.radius,
    car: null,
    health: PLAYER.health,
    cash: 0,
    wanted: 0,
    style: 0,
    styleBest: 0,
    punchTimer: 0,
    quietTimer: 0,
    swapCooldown: 0,
    lastCrimeAt: -999,
    nearMissAt: -999,
    airTimer: 0,
  };
}

/** A crime: raise the wanted level and restart the quiet clock. */
export function commitCrime(world, stars) {
  const player = world.player;
  player.wanted = Math.min(WANTED.max, player.wanted + stars);
  player.quietTimer = 0;
  player.lastCrimeAt = world.time;
}

function nearestCar(world, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.traffic.concat(world.parked, world.cops)) {
    const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function updatePlayer(world, input, dt) {
  const player = world.player;
  player.punchTimer = Math.max(0, player.punchTimer - dt);
  player.swapCooldown = Math.max(0, player.swapCooldown - dt);
  player.quietTimer += dt;
  // Style fades when nothing stylish happens.
  player.style = Math.max(0, player.style - STYLE.decayPerSecond * dt);
  player.styleBest = Math.max(player.styleBest, player.style);

  if (input.enterCar) {
    if (player.car) {
      // Step out on the driver's side; the car stays put as a parked car.
      const car = player.car;
      player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
      player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
      player.angle = car.angle;
      player.car = null;
      car.owner = 'parked';
      world.parked.push(car);
      world.events.push({ type: 'exit', x: player.x, y: player.y });
    } else {
      const car = nearestCar(world, 46);
      if (car) {
        player.car = car;
        player.x = car.x;
        player.y = car.y;
        const wasOwned = car.owner;
        if (wasOwned === 'traffic' || wasOwned === 'cop') {
          // Yanking a driver out of their car is a crime the street sees.
          commitCrime(world, 1);
          world.events.push({ type: 'carjack', x: car.x, y: car.y });
        }
        world.traffic = world.traffic.filter((c) => c !== car);
        world.parked = world.parked.filter((c) => c !== car);
        world.cops = world.cops.filter((c) => c !== car);
        car.owner = 'player';
        // Swap & Vanish: a fresh car sheds a star, once per swap.
        if (player.swapCooldown <= 0 && player.wanted > 0) {
          player.wanted -= 1;
          player.swapCooldown = 5;
          world.events.push({ type: 'swap', x: car.x, y: car.y });
        }
        world.events.push({ type: 'enter', x: car.x, y: car.y });
      }
    }
  }

  if (player.car) {
    const car = player.car;
    const beforeSpeed = car.speed;
    driveCar(car, input, dt, world);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    // Drift and air time feed the style meter.
    if (car.drifting) {
      player.style += STYLE.driftPerSecond * dt;
      world.particles.push({ x: car.x, y: car.y, kind: 'smoke', life: 0.5 });
    }
    if (car.airTime > 0) {
      car.airTime -= dt;
      if (car.airTime <= 0) {
        player.style += STYLE.airTime;
        world.events.push({ type: 'stunt', x: car.x, y: car.y });
      }
    }
    // Near-miss: brushing past traffic at speed without touching it.
    const now = world.time;
    if (now - player.nearMissAt > 1 && car.speed > 300) {
      for (const other of world.traffic.concat(world.cops)) {
        const d = Math.hypot(other.x - car.x, other.y - car.y);
        if (d > CAR.radius * 2 + 2 && d < CAR.radius * 2 + 26) {
          const closing = Math.abs(other.speed) + car.speed;
          if (closing > 300) {
            player.style += STYLE.nearMiss;
            player.nearMissAt = now;
            world.events.push({ type: 'nearmiss', x: car.x, y: car.y });
            break;
          }
        }
      }
    }
    // Ramps: hit one fast and the car flies.
    for (const ramp of world.city.ramps) {
      if (Math.hypot(ramp.x - car.x, ramp.y - car.y) < 40 && car.speed > 320 && car.airTime <= 0) {
        car.airTime = 0.9;
        world.events.push({ type: 'ramp', x: ramp.x, y: ramp.y });
      }
    }
    // Crash damage at very high speed.
    if (beforeSpeed > 460 && car.speed < beforeSpeed * 0.6) {
      player.health = Math.max(0, player.health - 8);
    }
  } else {
    // On foot: walk, run with Shift, punch with F.
    const run = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
      player.angle = Math.atan2(my, mx);
      player.x += mx * run * dt;
      player.y += my * run * dt;
      player.vx = mx * run;
      player.vy = my * run;
    } else {
      player.vx = 0;
      player.vy = 0;
    }
    resolveBuildings(world.city, player);
    if (input.punch && player.punchTimer <= 0) {
      player.punchTimer = PLAYER.punchCooldown;
      const px = player.x + Math.cos(player.angle) * PLAYER.punchRange;
      const py = player.y + Math.sin(player.angle) * PLAYER.punchRange;
      let hit = false;
      for (const cop of world.footCops) {
        if (Math.hypot(cop.x - px, cop.y - py) < 30) {
          hit = true;
          world.events.push({ type: 'punch', x: cop.x, y: cop.y });
          // Knocking a cop down is a crime, but it buys room to run.
          commitCrime(world, 1);
          cop.x += Math.cos(player.angle) * 60;
          cop.y += Math.sin(player.angle) * 60;
        }
      }
      if (!hit) world.events.push({ type: 'punch', x: px, y: py });
    }
  }

  // Wanted decay: stay clean and out of sight, and the heat cools off.
  if (player.wanted > 0 && player.quietTimer > WANTED.decayQuietSeconds) {
    const nearestCop = world.cops.concat(world.footCops).reduce(
      (best, c) => Math.min(best, Math.hypot(c.x - player.x, c.y - player.y)), Infinity);
    const sight = world.nightFactor > 0.6 ? WANTED.sightNight : WANTED.sightDay;
    if (nearestCop > sight) {
      player.quietTimer = WANTED.decayQuietSeconds - WANTED.decayStepSeconds;
      player.wanted -= 1;
      world.events.push({ type: 'cooldown', x: player.x, y: player.y });
    }
  }

  // Packages: walk or drive over one to pocket it.
  for (const pkg of world.city.packages) {
    if (!pkg.taken && Math.hypot(pkg.x - player.x, pkg.y - player.y) < 34) {
      pkg.taken = true;
      player.cash += MISSION.packageReward;
      player.style += STYLE.package;
      world.events.push({ type: 'package', x: pkg.x, y: pkg.y, id: pkg.id });
    }
  }
}

/** Busted or wasted: lose a cut of the cash, wake up at the hospital, heat gone. */
export function penalise(world) {
  const player = world.player;
  const lost = Math.floor(player.cash * MISSION.failCashPercent);
  player.cash -= lost;
  player.health = PLAYER.health;
  player.wanted = 0;
  if (player.car) {
    player.car.owner = 'parked';
    world.parked.push(player.car);
    player.car = null;
  }
  player.x = world.city.hospital.x;
  player.y = world.city.hospital.y + 90;
  player.angle = Math.PI / 2;
  world.cops = [];
  world.footCops = [];
  return lost;
}
