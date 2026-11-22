// Cars: arcade driving physics, traffic that follows the road graph, and police cars
// that hunt the player. One car is a circle with a heading; the renderer draws the body.
import { CAR, PALETTE } from './config.js';
import { findRoute, nearestNode, resolveBuildings } from './city.js';

let nextId = 1;

export function createCar({ x, y, angle = 0, kind = 'sedan', color = null, owner = 'traffic' }) {
  return {
    id: nextId,
    x, y, angle,
    vx: 0, vy: 0,
    speed: 0,
    radius: CAR.radius,
    kind,
    color: color || PALETTE.traffic[nextId % PALETTE.traffic.length],
    owner,
    route: [],
    routeIndex: 0,
    wait: 0,
    // Style bookkeeping, read by the player module.
    drifting: false,
    airTime: 0,
    lastNearMiss: 0,
  };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Arcade drive: a scalar speed along the heading (throttle, brake/reverse, drag),
 * steering that bites harder at speed, and a velocity vector that chases the
 * heading with a grip factor — low grip while the handbrake is down, so the car
 * slides (drift) instead of turning. The scalar speed is the state: deriving it
 * from the velocity's projection collapses while the car turns, and the car
 * spins in a circle instead of accelerating.
 */
export function driveCar(car, input, dt, world) {
  const speed = car.speed;
  let accel = 0;
  if (input.up) accel = CAR.accel;
  if (input.down) accel = speed > 10 ? -CAR.brake : -CAR.reverseAccel;
  let newSpeed = speed + accel * dt;
  if (!input.up && !input.down) newSpeed -= Math.sign(newSpeed) * Math.min(Math.abs(newSpeed), 260 * dt);
  newSpeed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, newSpeed));
  const steerInput = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const grip = input.handbrake ? CAR.driftGrip : CAR.grip;
  const speedFactor = Math.max(0.3, Math.min(1, Math.abs(newSpeed) / 90));
  const turnRate = CAR.steer * steerInput * speedFactor * (newSpeed < 0 ? -1 : 1);
  car.angle += turnRate * dt * (input.handbrake ? 1.5 : 1);
  const nx = Math.cos(car.angle);
  const ny = Math.sin(car.angle);
  // Velocity follows the heading with a grip factor: low grip keeps the old slide.
  const mix = Math.min(1, grip * dt);
  car.vx = car.vx + (nx * newSpeed - car.vx) * mix;
  car.vy = car.vy + (ny * newSpeed - car.vy) * mix;
  car.speed = newSpeed;
  car.drifting = input.handbrake && Math.abs(newSpeed) > 200 && Math.abs(steerInput) > 0;
  const beforeX = car.x;
  const beforeY = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  const hitWall = resolveBuildings(world.city, car);
  if (hitWall) {
    // A wall hit kills the speed along the heading; the slide keeps what is left.
    const impact = Math.hypot(car.vx, car.vy);
    car.speed = car.vx * nx + car.vy * ny;
    if (impact > 240) world.events.push({ type: 'crash', x: car.x, y: car.y, hard: impact > 420 });
    if (Math.hypot(car.x - beforeX, car.y - beforeY) < 1) {
      car.x = beforeX;
      car.y = beforeY;
    }
  }
  return car;
}

/** Traffic: pick a neighbouring intersection, drive to it, pick the next. */
export function updateTraffic(world, dt) {
  for (const car of world.traffic) {
    if (car.wait > 0) { car.wait -= dt; continue; }
    if (car.routeIndex >= car.route.length) {
      const node = nearestNode(car.x, car.y);
      const next = world.rng.pick(world.city.nodes.filter((n) => n !== node));
      car.route = findRoute(node, next);
      car.routeIndex = 0;
    }
    const target = car.route[car.routeIndex];
    if (!target) continue;
    const dx = target.x - car.x;
    const dy = target.y - car.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 26) { car.routeIndex += 1; continue; }
    const want = Math.atan2(dy, dx);
    const diff = angleDiff(want, car.angle);
    const input = {
      up: Math.abs(diff) < 1.1,
      down: false,
      left: diff < -0.08,
      right: diff > 0.08,
      handbrake: false,
    };
    // Slow for the car ahead so traffic does not pile up.
    const ahead = world.traffic.concat(world.cops).find((o) => o !== car
      && Math.hypot(o.x - car.x, o.y - car.y) < 70
      && Math.abs(angleDiff(Math.atan2(o.y - car.y, o.x - car.x), car.angle)) < 0.5);
    if (ahead) input.up = false;
    driveCar(car, input, dt, world);
    // Keep traffic near its cruising speed.
    if (car.speed > CAR.trafficSpeed) car.speed = CAR.trafficSpeed;
    if (car.speed < 20 && Math.abs(diff) > 2.4) {
      // Facing a wall after a bad turn: back up a little and re-route.
      car.route = [];
      car.routeIndex = 0;
    }
  }
}

/** Police cars: steer at the player with a little prediction, and ram. */
export function updateCops(world, dt) {
  const player = world.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  for (const cop of world.cops) {
    const dx = px - cop.x;
    const dy = py - cop.y;
    const dist = Math.hypot(dx, dy);
    const lead = 0.35;
    const tx = px + (player.car ? player.car.vx * lead : 0);
    const ty = py + (player.car ? player.car.vy * lead : 0);
    const want = Math.atan2(ty - cop.y, tx - cop.x);
    const diff = angleDiff(want, cop.angle);
    const input = {
      up: dist > 40,
      down: false,
      left: diff < -0.06,
      right: diff > 0.06,
      handbrake: false,
    };
    driveCar(cop, input, dt, world);
    if (cop.speed > CAR.copSpeed) cop.speed = CAR.copSpeed;
    // Ramming the player hurts them and shakes the camera, but one cop cannot
    // shred the player's health by touching them every frame.
    if (player.car && dist < CAR.radius * 2 + 4 && cop.speed > 180
      && (cop.lastRam === undefined || world.time - cop.lastRam > 1.2)) {
      cop.lastRam = world.time;
      world.events.push({ type: 'rammed', x: px, y: py });
    }
  }
}

/** Separate two overlapping cars so traffic never fuses into one blob. */
export function separateCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = CAR.radius * 2;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}
