// The city of Vice Harbor, built from the fixed layout in config.js.
// Everything here is pure geometry: water tests, building collision,
// road membership, fog zones, and the seeded placement of traffic.
import { WORLD, ROADS, BUILDINGS, DOCKS, FOG_BANKS, RAMPS, CRATES, SPOTS } from './config.js';
import { makeRng, range, pick } from './random.js';

export function isWater(x, y) {
  if (x >= WORLD.waterX) return true;
  if (y >= WORLD.bayY && x >= WORLD.bayX) return true;
  return false;
}

export function isOnRoad(x, y) {
  const half = ROADS.width / 2;
  for (const ry of ROADS.h) {
    if (Math.abs(y - ry) <= half && x <= WORLD.waterX) return true;
  }
  for (const rx of ROADS.v) {
    if (Math.abs(x - rx) <= half && y <= WORLD.bayY) return true;
  }
  return false;
}

export function inFog(x, y) {
  for (const f of FOG_BANKS) {
    const dx = (x - f.x) / f.rx;
    const dy = (y - f.y) / f.ry;
    if (dx * dx + dy * dy <= 1) return f;
  }
  return null;
}

export function inSafehouse(x, y) {
  const dx = x - SPOTS.safehouse.x;
  const dy = y - SPOTS.safehouse.y;
  return dx * dx + dy * dy <= SPOTS.safehouse.r * SPOTS.safehouse.r;
}

// Circle vs building rectangles. Returns the push-out vector, or null.
export function collideBuildings(x, y, r) {
  let px = 0;
  let py = 0;
  let hit = false;
  for (const b of BUILDINGS) {
    const cx = Math.max(b[0], Math.min(x, b[0] + b[2]));
    const cy = Math.max(b[1], Math.min(y, b[1] + b[3]));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = r - d;
        px += (dx / d) * push;
        py += (dy / d) * push;
      } else {
        // Centre inside the rect: push out along the smallest axis.
        const left = x - b[0];
        const right = b[0] + b[2] - x;
        const top = y - b[1];
        const bottom = b[1] + b[3] - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) px -= left + r;
        else if (m === right) px += right + r;
        else if (m === top) py -= top + r;
        else py += bottom + r;
      }
    }
  }
  return hit ? { x: px, y: py } : null;
}

export function nearestRamp(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const r of RAMPS) {
    const dx = x - r.x;
    const dy = y - r.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return bestD < 60 * 60 ? best : null;
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const carColors = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#e67e22', '#95a5a6', '#f1c40f', '#16a085'];
  const boatColors = ['#e8e8f0', '#d95d39', '#2e86ab', '#f2c14e'];

  // Parked cars on the roads, spread across the grid.
  const cars = [];
  const carSpots = [];
  for (const ry of ROADS.h) {
    for (const rx of ROADS.v) {
      carSpots.push({ x: rx + 160, y: ry - 28 });
      carSpots.push({ x: rx - 160, y: ry + 28 });
    }
  }
  for (let i = 0; i < 8; i++) {
    const s = carSpots[Math.floor(rng() * carSpots.length) % carSpots.length];
    cars.push({
      id: 'car' + i,
      kind: 'car',
      x: s.x + range(rng, -30, 30),
      y: s.y + range(rng, -12, 12),
      angle: rng() < 0.5 ? 0 : Math.PI,
      speed: 0,
      color: pick(rng, carColors),
      taken: false,
    });
  }

  // Boats moored at the docks.
  const boats = [];
  const boatSpots = [
    { x: 2200, y: 1380 }, { x: 2240, y: 1440 }, { x: 2200, y: 920 },
    { x: 2240, y: 420 }, { x: 2260, y: 1870 }, { x: 2320, y: 980 },
  ];
  for (let i = 0; i < boatSpots.length; i++) {
    boats.push({
      id: 'boat' + i,
      kind: 'boat',
      x: boatSpots[i].x,
      y: boatSpots[i].y,
      angle: range(rng, -0.4, 0.4),
      speed: 0,
      color: pick(rng, boatColors),
      taken: false,
    });
  }

  // The 12 cargo crates, placed exactly where config puts them.
  const crates = CRATES.map((c, i) => ({
    id: 'crate' + i,
    x: c.x,
    y: c.y,
    where: c.where,
    taken: false,
  }));

  return {
    cars,
    boats,
    crates,
    buildings: BUILDINGS,
    docks: DOCKS,
    fog: FOG_BANKS,
    ramps: RAMPS,
  };
}
