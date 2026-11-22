// The autopilot: the same roads and rules a human uses, driven by a route planner.
// It plans a route over the road graph to the mission objective, steers the car
// waypoint by waypoint, walks to a car when it has none, and tails the courier
// from behind. It also powers the screenshot scenes. No cheats: it only presses
// the same keys a player can.
import { route } from './city.js';

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

export function createBot(world) {
  const bot = world.bot;
  let routePts = [];
  let routeIdx = 0;
  let lastKey = '';
  let stuckTimer = 0;
  let reverseTimer = 0;
  let repathTimer = 0;
  let followX = 0;
  let followY = 0;

  function planTo(x, y) {
    const p = world.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    routePts = route(world.city.graph, px, py, x, y);
    routeIdx = 0;
    bot.polyline = routePts;
  }

  function nearestCar(maxD) {
    const p = world.player;
    // Parked cars first (they stay put); a moving traffic car is a last resort.
    for (const kinds of [['player', 'parked'], ['traffic']]) {
      let best = null;
      let bestD = maxD;
      for (const car of world.cars) {
        if (!kinds.includes(car.kind)) continue;
        const d = Math.hypot(car.x - p.x, car.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      if (best) return best;
    }
    return null;
  }

  function driveTo(wx, wy, dt, cruise, final) {
    const car = world.player.car;
    const dx = wx - car.x;
    const dy = wy - car.y;
    const dist = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    const diff = angleDiff(want, car.angle);
    const steer = clamp(diff * 2.5, -1, 1);
    let throttle = true;
    let brake = false;
    // Ease off on the last leg so the car stops AT the marker instead of flying past it.
    if (final) {
      const cap = 90 + dist * 0.7;
      cruise = cruise === undefined ? cap : Math.min(cruise, cap);
    }
    // Facing the wrong way: creep forward and swing around — braking from a stop
    // would only send the car backwards into whatever is behind it.
    if (Math.abs(diff) > 1.2) {
      if (Math.abs(car.speed) > 260) {
        throttle = false;
        brake = true;
      } else {
        cruise = cruise === undefined ? 150 : Math.min(cruise, 150);
      }
    }
    if (dist < 130 && Math.abs(car.speed) > 260) {
      throttle = false;
      brake = true;
    }
    if (cruise !== undefined && Math.abs(car.speed) > cruise) throttle = false;
    // Stuck against something: back up, then try again.
    if (throttle && Math.abs(car.speed) < 25) stuckTimer += dt;
    else stuckTimer = 0;
    if (stuckTimer > 2.5) {
      reverseTimer = 1.2;
      stuckTimer = 0;
    }
    if (reverseTimer > 0) {
      reverseTimer -= dt;
      bot.reverse = true;
      bot.stuck = true;
      return { direction: () => ({ x: -steer, y: 1, handbrake: false }), enter: false };
    }
    bot.reverse = false;
    bot.stuck = stuckTimer > 1;
    return {
      direction: () => ({ x: steer, y: throttle ? -1 : brake ? 1 : 0, handbrake: false }),
      enter: false,
    };
  }

  function walkTo(wx, wy) {
    const p = world.player;
    const dx = wx - p.x;
    const dy = wy - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return { direction: () => ({ x: 0, y: 0, handbrake: false }), enter: false };
    return { direction: () => ({ x: dx / d, y: dy / d, handbrake: false }), enter: false };
  }

  function update(dt) {
    const p = world.player;
    const obj = world.missionsApi.objective();
    repathTimer -= dt;

    // No car: walk to the nearest one and get in.
    if (!p.car) {
      const car = nearestCar(1200);
      if (!car) return { direction: () => ({ x: 0, y: 0, handbrake: false }), enter: false };
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < 55) return { direction: () => ({ x: 0, y: 0, handbrake: false }), enter: true };
      const key = `car${car.id}`;
      if (key !== lastKey || routeIdx >= routePts.length) {
        planTo(car.x, car.y);
        lastKey = key;
      }
      const wp = routePts[routeIdx];
      if (!wp) return walkTo(car.x, car.y);
      if (Math.hypot(wp.x - p.x, wp.y - p.y) < 40) routeIdx += 1;
      return walkTo(wp.x, wp.y);
    }

    // In a car: steer to the objective.
    if (!obj) {
      // No objective: hold still. Brake only while moving forward — holding the
      // brake past a stop would send the car backwards (brake becomes reverse).
      const sp = Math.abs(world.player.car.speed);
      return { direction: () => ({ x: 0, y: sp > 40 ? 1 : 0, handbrake: false }), enter: false };
    }
    const isTail = !!obj.moving;
    let tx = obj.x;
    let ty = obj.y;
    let cruise;
    if (isTail) {
      const c = world.missions.courier;
      if (c) {
        tx = c.x - Math.cos(c.angle) * 150;
        ty = c.y - Math.sin(c.angle) * 150;
        const d = Math.hypot(c.x - p.car.x, c.y - p.car.y);
        if (d < 120) cruise = Math.max(60, Math.abs(c.speed) - 40);
        followX = tx;
        followY = ty;
      }
      // Tail directly at the moving follow point: a road route to it would be
      // stale before the car reaches its first waypoint, because the courier
      // moves 180 units between replans. Drive straight at the point instead,
      // and never hold still at it — the courier keeps moving, so the bot must
      // keep rolling at the courier's speed or it falls behind.
      lastKey = 'tail';
      return driveTo(tx, ty, dt, cruise, false);
    }
    const key = `${obj.label}|${Math.round(tx / 100)}|${Math.round(ty / 100)}`;
    // Replan only when the objective moved, never just because the route ran out:
    // an exhausted route means the car is at the marker and should hold still.
    if (key !== lastKey) {
      planTo(tx, ty);
      lastKey = key;
    }
    let wp = routePts[routeIdx];
    if (!wp) {
      // Route exhausted but the objective is still far: the car flew past the
      // marker. Drive straight back to it; the approach control slows it down
      // so it stops at the marker this time instead of flying past again.
      const dObj = Math.hypot(tx - p.car.x, ty - p.car.y);
      if (dObj > 100) {
        routePts = [{ x: tx, y: ty }];
        routeIdx = 0;
        bot.polyline = routePts;
        wp = routePts[0];
      } else {
        // At the marker: hold still (a pickup waits here). Same brake rule as above.
        const sp = Math.abs(world.player.car.speed);
        return { direction: () => ({ x: 0, y: sp > 40 ? 1 : 0, handbrake: false }), enter: false };
      }
    }
    // Skip waypoints already reached, bounded so it always terminates.
    let guard = 0;
    while (wp && Math.hypot(wp.x - p.car.x, wp.y - p.car.y) < 52 && guard <= routePts.length) {
      routeIdx += 1;
      wp = routePts[routeIdx];
      guard += 1;
    }
    if (!wp) {
      const sp = Math.abs(world.player.car.speed);
      return { direction: () => ({ x: 0, y: sp > 40 ? 1 : 0, handbrake: false }), enter: false };
    }
    // The last waypoint is a stop: ease off so the car stops AT the marker.
    return driveTo(wp.x, wp.y, dt, cruise, routeIdx === routePts.length - 1);
  }

  return { update };
}
