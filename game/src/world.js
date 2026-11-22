// The simulation: Mara on foot and by car, traffic, pedestrians, the NBPD, the
// wanted level, the style meter and the Sunset Clock. No drawing and no browser in
// it — step() advances one fixed step and returns what happened as bit flags.
import {
  CAR, COP_CAR, LANDMARKS, PED_COUNT, PLAYER, ROADS_X, ROADS_Y, ROAD_HALF,
  SIGHT, STEP, STYLE, SUNSET, TRAFFIC_COUNT, WANTED_FADE, WANTED_MAX, WORLD,
} from './config.js';
import { buildCity, nearestNode, onRoad, route } from './city.js';
import { int, pick } from './random.js';
import { createMissions } from './missions.js';

export const EVENT_JOB = 1;
export const EVENT_BUSTED = 2;
export const EVENT_WRECKED = 4;
export const EVENT_PACKAGE = 8;
export const EVENT_CRASH = 16;
export const EVENT_STORY = 32;
export const EVENT_FAILED = 64;

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Push a circle out of a rectangle; returns the impact speed along the push, 0 if clear. */
function pushOutOfRect(obj, r, rect) {
  const cx = clamp(obj.x, rect.x, rect.x + rect.w);
  const cy = clamp(obj.y, rect.y, rect.y + rect.h);
  const dx = obj.x - cx;
  const dy = obj.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return 0;
  if (d2 === 0) {
    // Centre inside the rect: push out along the shortest side.
    const left = obj.x - rect.x;
    const right = rect.x + rect.w - obj.x;
    const top = obj.y - rect.y;
    const bottom = rect.y + rect.h - obj.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) obj.x = rect.x - r;
    else if (m === right) obj.x = rect.x + rect.w + r;
    else if (m === top) obj.y = rect.y - r;
    else obj.y = rect.y + rect.h + r;
    return 1;
  }
  const d = Math.sqrt(d2);
  obj.x = cx + (dx / d) * r;
  obj.y = cy + (dy / d) * r;
  return 1;
}

export function createWorld(random, saveData) {
  const city = buildCity(random);
  const saved = saveData ?? null;

  const player = {
    x: LANDMARKS.garage.x, y: LANDMARKS.garage.y + 40, angle: 0,
    car: null, wanted: 0, health: PLAYER.health,
    cash: saved ? saved.cash : 0, style: 0,
    air: 0, airCooldown: 0, drift: 0, wantedTimer: 0,
    swapCooldown: 0, invuln: 0, lastDamage: -99, flash: null, flashTimer: 0,
  };

  const cars = [];
  const cops = [];
  const footCops = [];
  const peds = [];
  let nextId = 1;

  function makeCar(x, y, angle, color, kind) {
    const car = {
      id: nextId, x, y, angle, speed: 0, color, kind,
      route: [], routeIdx: 0, stuck: 0, targetSpeed: 0,
      nearMissCd: 0, swapped: false, contactTimer: 0, repath: 0,
    };
    nextId += 1;
    cars.push(car);
    return car;
  }

  // Mara's own ride, parked by the garage.
  const ownCar = makeCar(665, 640, -Math.PI / 2, '#ff5a1f', 'player');
  // Parked cars worth stealing, on the roads.
  const parkedSpots = [
    [1000, 560, 0], [1800, 640, Math.PI / 2], [2200, 960, 0],
    [600, 1440, -Math.PI / 2], [2600, 1440, Math.PI], [1400, 1840, 0],
  ];
  for (const [x, y, a] of parkedSpots) {
    makeCar(x, y, a, pick(random, ['#c9c9c9', '#4d7ea8', '#a84d4d', '#4da86e', '#8a7ec9']), 'parked');
  }

  function randomNode() {
    return { x: pick(random, ROADS_X), y: pick(random, ROADS_Y) };
  }

  function newRouteFor(car, fromX, fromY) {
    const dest = randomNode();
    car.route = route(city.graph, fromX, fromY, dest.x, dest.y);
    car.routeIdx = 0;
  }

  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const n = randomNode();
    const car = makeCar(n.x + (random() - 0.5) * 30, n.y + (random() - 0.5) * 30, random() * TAU,
      pick(random, ['#c9c9c9', '#4d7ea8', '#a84d4d', '#4da86e', '#8a7ec9']), 'traffic');
    newRouteFor(car, car.x, car.y);
    car.targetSpeed = 210 + random() * 90;
  }

  for (let i = 0; i < PED_COUNT; i += 1) {
    const n = randomNode();
    peds.push({
      x: n.x + (random() - 0.5) * 120, y: n.y + (random() - 0.5) * 120,
      angle: random() * TAU, speed: 55 + random() * 40,
      color: pick(random, ['#e8c39e', '#9ec7e8', '#e89ec7', '#c7e89e']),
      tx: n.x, ty: n.y, down: 0, wait: 0,
    });
  }

  // The 12 hidden neon packages, already found ones stay found.
  const found = new Set(saved ? saved.packages : []);
  for (const p of city.packages) p.taken = found.has(p.index);

  const world = {
    city, player, cars, cops, footCops, peds, ownCar,
    time: 0, clock: 0.15, jobsDone: saved ? saved.jobsDone : 0,
    objective: null, bot: { polyline: [], stuck: false, reverse: false },
    missions: null, missionsApi: null,
  };

  const missionsApi = createMissions(world);
  world.missionsApi = missionsApi;
  world.missions = missionsApi.state;

  world.nightness = function nightness() {
    return clamp((world.clock - SUNSET.golden) / (SUNSET.night - SUNSET.golden), 0, 1);
  };

  world.sightRadius = function sightRadius() {
    return SIGHT.day + (SIGHT.night - SIGHT.day) * world.nightness();
  };

  world.announce = function announce(text) {
    player.flash = text;
    player.flashTimer = 3;
  };

  world.setWanted = function setWanted(n) {
    player.wanted = clamp(n, 0, WANTED_MAX);
    player.wantedTimer = 0;
  };

  world.crime = function crime(n) {
    world.setWanted(player.wanted + n);
  };

  world.saveProgress = function saveProgress() {
    if (world.onSave) world.onSave({
      jobsDone: world.jobsDone,
      cash: player.cash,
      packages: city.packages.filter((p) => p.taken).map((p) => p.index),
      best: Math.max(0, player.cash),
    });
  };

  world.spawnCourier = function spawnCourier() {
    const n = randomNode();
    const car = makeCar(n.x, n.y, random() * TAU, '#ffe600', 'courier');
    newRouteFor(car, car.x, car.y);
    car.targetSpeed = 300;
    return car;
  };

  function spawnCopCar() {
    const angle = random() * TAU;
    const d = 700 + random() * 300;
    const x = clamp(player.x + Math.cos(angle) * d, 100, WORLD.width - 100);
    const y = clamp(player.y + Math.sin(angle) * d, 100, WORLD.height - 100);
    const snapped = nearestNode(city.graph, x, y);
    const node = city.graph.nodes.get(snapped);
    const car = makeCar(node.x, node.y, random() * TAU, '#1e4fd8', 'cop');
    car.targetSpeed = COP_CAR.maxSpeed;
    cops.push(car);
    return car;
  }

  function spawnFootCop() {
    const angle = random() * TAU;
    footCops.push({
      x: clamp(player.x + Math.cos(angle) * 260, 40, WORLD.width - 40),
      y: clamp(player.y + Math.sin(angle) * 260, 40, WORLD.height - 40),
      angle: 0, speed: 268, contactTimer: 0,
    });
  }

  function collideBuildings(obj, r) {
    let hit = false;
    for (const b of city.buildings) {
      if (pushOutOfRect(obj, r, b)) hit = true;
    }
    return hit;
  }

  function collideWater(obj, r) {
    if (obj.y + r <= WORLD.waterY) return false;
    // The pier is solid ground over the water.
    if (obj.x > 1535 && obj.x < 1665 && obj.y < 2385) return false;
    obj.y = WORLD.waterY - r;
    return true;
  }

  function collideWorld(obj, r) {
    obj.x = clamp(obj.x, 20, WORLD.width - 20);
    obj.y = clamp(obj.y, 20, WORLD.height - 20);
    let hit = collideBuildings(obj, r);
    if (collideWater(obj, r)) hit = true;
    return hit;
  }

  function damagePlayer(amount) {
    if (player.invuln > 0 || player.car === null) return;
    player.health -= amount;
    player.invuln = 1;
    player.lastDamage = world.time;
    if (player.health < 0) player.health = 0;
  }

  function driveCar(car, dt, steer, throttle, brake, handbrake, maxSpeed) {
    const accel = car.kind === 'cop' ? COP_CAR.accel : CAR.accel;
    if (throttle) car.speed += accel * dt;
    else if (brake) {
      if (car.speed > 0) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    } else {
      car.speed -= Math.sign(car.speed) * 240 * dt;
      if (Math.abs(car.speed) < 4) car.speed = 0;
    }
    if (handbrake) car.speed -= Math.sign(car.speed) * 520 * dt;
    car.speed = clamp(car.speed, -CAR.maxReverse, maxSpeed);
    // The car can still swing at low speed (arcade steering), so a wrong-way car
    // turns instead of sitting still.
    const turn = clamp(Math.abs(car.speed) / 200, 0.3, 1);
    car.angle += steer * CAR.steer * dt * turn * (car.speed < 0 ? -1 : 1) * (handbrake ? 1.6 : 1);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
  }

  function carAhead(car, dist) {
    for (const other of cars) {
      if (other === car || other.speed === 0 && other.kind === 'parked') continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < dist && Math.abs(angleDiff(Math.atan2(dy, dx), car.angle)) < 0.7) return true;
    }
    return false;
  }

  function stepTraffic(dt) {
    for (const car of cars) {
      if (car.kind !== 'traffic' && car.kind !== 'courier') continue;
      const wp = car.route[car.routeIdx];
      if (!wp) {
        newRouteFor(car, car.x, car.y);
        continue;
      }
      const dx = wp.x - car.x;
      const dy = wp.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 42) {
        car.routeIdx += 1;
        continue;
      }
      const want = Math.atan2(dy, dx);
      const diff = angleDiff(want, car.angle);
      const steer = clamp(diff * 2.2, -1, 1);
      const slow = carAhead(car, 85);
      driveCar(car, dt, steer, !slow, false, false, slow ? 60 : car.targetSpeed);
      if (Math.abs(car.speed) < 15) car.stuck += dt;
      else car.stuck = 0;
      if (car.stuck > 4) {
        const n = randomNode();
        car.x = n.x;
        car.y = n.y;
        car.angle = random() * TAU;
        car.speed = 0;
        car.stuck = 0;
        newRouteFor(car, car.x, car.y);
      }
      collideWorld(car, 20);
    }
  }

  function stepCops(dt) {
    // How many cop cars the heat calls for.
    while (cops.length < player.wanted && cops.length < 4) spawnCopCar();
    while (cops.length > player.wanted) {
      const car = cops.pop();
      cars.splice(cars.indexOf(car), 1);
    }
    // Foot police when the heat is on and Mara is on foot.
    if (player.wanted >= 2 && !player.car) {
      while (footCops.length < 2) spawnFootCop();
    } else if (player.wanted < 2 || player.car) {
      footCops.length = 0;
    }
    const px = player.car ? player.car.x : player.x;
    const py = player.car ? player.car.y : player.y;
    for (const cop of cops) {
      const dx = px - cop.x;
      const dy = py - cop.y;
      const d = Math.hypot(dx, dy);
      cop.repath -= dt;
      if (d > 520) {
        if (cop.repath <= 0) {
          cop.route = route(city.graph, cop.x, cop.y, px, py);
          cop.routeIdx = 0;
          cop.repath = 2;
        }
        const wp = cop.route[cop.routeIdx];
        if (wp) {
          if (Math.hypot(wp.x - cop.x, wp.y - cop.y) < 46) cop.routeIdx += 1;
          else {
            const want = Math.atan2(wp.y - cop.y, wp.x - cop.x);
            driveCar(cop, dt, clamp(angleDiff(want, cop.angle) * 2.4, -1, 1), true, false, false, COP_CAR.maxSpeed);
          }
        } else driveCar(cop, dt, 0, true, false, false, COP_CAR.maxSpeed);
      } else {
        const want = Math.atan2(dy, dx);
        driveCar(cop, dt, clamp(angleDiff(want, cop.angle) * 2.6, -1, 1), true, false, false, COP_CAR.maxSpeed);
      }
      if (Math.abs(cop.speed) < 12) cop.stuck += dt;
      else cop.stuck = 0;
      if (cop.stuck > 5) {
        const node = city.graph.nodes.get(nearestNode(city.graph, px, py));
        cop.x = node.x + (random() - 0.5) * 60;
        cop.y = node.y + (random() - 0.5) * 60;
        cop.speed = 0;
        cop.stuck = 0;
      }
      collideWorld(cop, 20);
      // Caught: a cop car parked on Mara while she crawls.
      if (player.car && d < 58 && Math.abs(player.car.speed) < 80) {
        cop.contactTimer += dt;
        if (cop.contactTimer > 2.5) return EVENT_BUSTED;
      } else cop.contactTimer = Math.max(0, cop.contactTimer - dt);
    }
    for (const fc of footCops) {
      const dx = player.x - fc.x;
      const dy = player.y - fc.y;
      const d = Math.hypot(dx, dy);
      fc.angle = Math.atan2(dy, dx);
      fc.x += Math.cos(fc.angle) * fc.speed * dt;
      fc.y += Math.sin(fc.angle) * fc.speed * dt;
      collideWorld(fc, 12);
      if (d < 34) {
        fc.contactTimer += dt;
        if (fc.contactTimer > 1.5) return EVENT_BUSTED;
      } else fc.contactTimer = Math.max(0, fc.contactTimer - dt);
    }
    return 0;
  }

  function stepPeds(dt) {
    const px = player.car ? player.car.x : player.x;
    const py = player.car ? player.car.y : player.y;
    for (const ped of peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        if (ped.down <= 0) {
          const n = randomNode();
          ped.x = n.x + (random() - 0.5) * 100;
          ped.y = n.y + (random() - 0.5) * 100;
        }
        continue;
      }
      const dx = ped.tx - ped.x;
      const dy = ped.ty - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) {
        const n = randomNode();
        ped.tx = n.x + (random() - 0.5) * 140;
        ped.ty = n.y + (random() - 0.5) * 140;
        ped.wait = 0.5 + random() * 2;
        continue;
      }
      // Step aside for a fast car coming at them.
      const carD = Math.hypot(px - ped.x, py - ped.y);
      if (player.car && carD < 90 && Math.abs(player.car.speed) > 150) {
        ped.angle = Math.atan2(ped.y - py, ped.x - px);
        ped.x += Math.cos(ped.angle) * 130 * dt;
        ped.y += Math.sin(ped.angle) * 130 * dt;
        continue;
      }
      if (ped.wait > 0) {
        ped.wait -= dt;
        continue;
      }
      ped.angle = Math.atan2(dy, dx);
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      // Peds stay on the sidewalks: out of the road is fine, out of a building is not.
      collideBuildings(ped, 10);
      // Run over by Mara's car: a crime, and the ped goes down.
      if (player.car && Math.abs(player.car.speed) > 120) {
        const cdx = ped.x - player.car.x;
        const cdy = ped.y - player.car.y;
        if (cdx * cdx + cdy * cdy < 30 * 30) {
          ped.down = 3;
          world.crime(1);
          world.announce('HIT AND RUN — the heat is on');
        }
      }
    }
  }

  function stepPlayer(dt, input) {
    if (player.swapCooldown > 0) player.swapCooldown -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    if (player.flashTimer > 0) player.flashTimer -= dt;
    if (player.style > 0) player.style = Math.max(0, player.style - STYLE.decay * dt);

    if (player.car) {
      const car = player.car;
      const dir = input.direction();
      driveCar(car, dt, dir.x, dir.y < 0, dir.y > 0, dir.handbrake, CAR.maxSpeed);
      if (player.air > 0) {
        player.air -= dt;
        if (player.air <= 0) {
          player.style = Math.min(100, player.style + STYLE.air);
          world.announce('AIR TIME +15 STYLE');
        }
      } else {
        const beforeX = car.x;
        const beforeY = car.y;
        const speedBefore = car.speed;
        if (collideWorld(car, 20)) {
          if (Math.abs(speedBefore) > 380) {
            damagePlayer((Math.abs(speedBefore) - 380) / 25);
            car.speed *= 0.45;
          }
          // A hard stop into a wall still costs speed.
          if (Math.hypot(car.x - beforeX, car.y - beforeY) < 1 && Math.abs(speedBefore) > 200) car.speed *= 0.6;
        }
        // The stunt ramp: fast over it and the car flies.
        const ramp = city.ramp;
        if (player.airCooldown <= 0 && Math.abs(car.x - ramp.x) < 42 && Math.abs(car.y - ramp.y) < 30 && Math.abs(car.speed) > 300) {
          player.air = 0.75;
          player.airCooldown = 2;
        }
        if (player.airCooldown > 0) player.airCooldown -= dt;
        // Drift: handbrake on, fast, steering.
        if (dir.handbrake && Math.abs(car.speed) > 300 && dir.x !== 0) {
          player.drift += dt;
          player.style = Math.min(100, player.style + STYLE.driftPerSec * dt);
        } else player.drift = 0;
        // Near miss with traffic.
        for (const other of cars) {
          if (other === car || other.kind === 'cop') continue;
          const d = Math.hypot(other.x - car.x, other.y - car.y);
          const rel = Math.abs(car.speed - other.speed);
          if (d < 48 && d > 30 && rel > 200 && other.nearMissCd <= 0) {
            other.nearMissCd = 3;
            player.style = Math.min(100, player.style + STYLE.nearMiss);
            world.announce('NEAR MISS +8 STYLE');
          }
          if (other.nearMissCd > 0) other.nearMissCd -= dt;
        }
      }
      // Getting out.
      if (input.enter) {
        player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 46;
        player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 46;
        player.angle = car.angle;
        player.car = null;
        collideWorld(player, PLAYER.radius);
      }
    } else {
      const dir = input.direction();
      const len = Math.hypot(dir.x, dir.y);
      if (len > 0) {
        player.angle = Math.atan2(dir.y, dir.x);
        player.x += (dir.x / len) * PLAYER.walkSpeed * dt;
        player.y += (dir.y / len) * PLAYER.walkSpeed * dt;
        collideWorld(player, PLAYER.radius);
      }
      if (input.enter) {
        let best = null;
        let bestD = PLAYER.enterRange;
        for (const car of cars) {
          const d = Math.hypot(car.x - player.x, car.y - player.y);
          if (d < bestD) {
            bestD = d;
            best = car;
          }
        }
        if (best) {
          player.car = best;
          player.x = best.x;
          player.y = best.y;
          if (best.kind !== 'player' && !best.swapped) {
            best.swapped = true;
            if (player.wanted > 0) {
              world.setWanted(player.wanted - 1);
              world.announce('SWAP & VANISH — one star down');
            } else if (cops.some((c) => Math.hypot(c.x - best.x, c.y - best.y) < world.sightRadius())) {
              world.crime(1);
              world.announce('CARJACKED IN FRONT OF THE NBPD');
            }
          }
        }
      }
    }
    // Car-to-car shunts.
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < 44) {
          const push = (44 - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          const rel = Math.abs(a.speed - b.speed);
          if (rel > 300 && (a === player.car || b === player.car)) {
            damagePlayer((rel - 300) / 30);
            a.speed *= 0.7;
            b.speed *= 0.7;
          }
        }
      }
    }
    // One press is one action, even when the loop steps the world several times a frame.
    input.enter = false;
  }

  function stepPackages() {
    let events = 0;
    const px = player.car ? player.car.x : player.x;
    const py = player.car ? player.car.y : player.y;
    for (const p of city.packages) {
      if (p.taken) continue;
      const dx = p.x - px;
      const dy = p.y - py;
      if (dx * dx + dy * dy < 34 * 34) {
        p.taken = true;
        player.cash += 150;
        player.style = Math.min(100, player.style + STYLE.package);
        world.announce('NEON PACKAGE +$150');
        world.saveProgress();
        events |= EVENT_PACKAGE;
      }
    }
    return events;
  }

  function step(dt, input) {
    let events = 0;
    world.time += dt;
    if (world.missions.status === 'active') world.clock = Math.min(1, world.clock + dt / 300);
    else if (world.missions.status === 'idle') world.clock = Math.min(1, world.clock + dt / 600);

    const beforeJob = world.missions.status;
    stepPlayer(dt, input);
    stepTraffic(dt);
    const busted = stepCops(dt);
    stepPeds(dt);
    events |= stepPackages();
    missionsApi.update(dt);
    world.objective = missionsApi.objective();

    // Wanted fades when no cop can see Mara.
    if (player.wanted > 0) {
      const px = player.car ? player.car.x : player.x;
      const py = player.car ? player.car.y : player.y;
      const seen = cops.some((c) => Math.hypot(c.x - px, c.y - py) < world.sightRadius())
        || footCops.some((f) => Math.hypot(f.x - px, f.y - py) < world.sightRadius());
      if (!seen) {
        player.wantedTimer += dt;
        if (player.wantedTimer > WANTED_FADE) {
          player.wanted -= 1;
          player.wantedTimer = 0;
        }
      } else player.wantedTimer = 0;
    }

    if (player.health > 0 && world.time - player.lastDamage > 5 && player.health < PLAYER.health) {
      player.health = Math.min(PLAYER.health, player.health + 2 * dt);
    }

    if (busted) {
      missionsApi.fail();
      return events | EVENT_BUSTED;
    }
    if (player.health <= 0) {
      missionsApi.fail();
      return events | EVENT_WRECKED;
    }
    if (beforeJob === 'active' && world.missions.status === 'complete') {
      world.jobsDone = Math.max(world.jobsDone, world.missions.lastComplete.index + 1);
      return events | EVENT_JOB;
    }
    if (beforeJob === 'active' && world.missions.status === 'story') {
      world.jobsDone = Math.max(world.jobsDone, 5);
      return events | EVENT_JOB | EVENT_STORY;
    }
    if (beforeJob === 'active' && world.missions.status === 'failed') {
      // Reached only when the mission itself fails (its timer ran out).
      return events | EVENT_FAILED;
    }
    return events;
  }

  function reset(toJob) {
    player.x = LANDMARKS.garage.x;
    player.y = LANDMARKS.garage.y + 40;
    player.angle = 0;
    player.car = null;
    player.wanted = 0;
    player.health = PLAYER.health;
    player.style = 0;
    player.air = 0;
    ownCar.x = 665;
    ownCar.y = 640;
    ownCar.angle = -Math.PI / 2;
    ownCar.speed = 0;
    for (const c of cops) {
      const i = cars.indexOf(c);
      if (i >= 0) cars.splice(i, 1);
    }
    cops.length = 0;
    footCops.length = 0;
    world.time = 0;
    if (typeof toJob === 'number') missionsApi.startJob(toJob);
    else {
      missionsApi.state.status = 'idle';
      world.clock = 0.15;
    }
    world.objective = missionsApi.objective();
  }

  // Return the world object itself, not a copy: the debug harness and the bot read
  // its primitive fields (time, clock, objective) live, and a spread copy of those
  // would go stale the moment step() ran.
  world.step = step;
  world.reset = reset;
  return world;
}
