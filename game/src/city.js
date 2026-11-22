// Neon Bay: one hand-placed city on a road grid, built once from a seed so every run
// (and every screenshot) sees the same streets, buildings and landmarks.
import { PALETTE, WORLD } from './config.js';

const LANDMARKS = [
  { name: "DANTE'S GARAGE", block: [2, 5], x: 760, y: 1740, w: 170, h: 100, sign: 0 },
  { name: 'ST. MARINA HOSPITAL', block: [6, 1], x: 2400, y: 370, w: 190, h: 120, sign: 1 },
  { name: 'HOTEL MIRAMAR', block: [1, 3], x: 360, y: 1060, w: 170, h: 110, sign: 0 },
  { name: 'NEON MUSEUM', block: [5, 2], x: 2000, y: 720, w: 190, h: 110, sign: 2 },
  { name: 'NBPD HEADQUARTERS', block: [7, 6], x: 2800, y: 2070, w: 190, h: 110, sign: 4 },
  { name: 'THE PIER ARCADE', block: [1, 4], x: 360, y: 1420, w: 170, h: 100, sign: 3 },
];

const PACKAGE_SPOTS = [
  [330, 620], [820, 420], [1180, 1080], [1620, 420], [2050, 1420], [2480, 620],
  [2820, 1780], [820, 2080], [1520, 2080], [2380, 1780], [480, 1150], [60, 1250],
];

const RAMP_SPOTS = [
  { x: 1000, y: 1250, angle: 0 },
  { x: 2200, y: 900, angle: Math.PI },
  { x: 600, y: 1950, angle: -Math.PI / 2 },
  { x: 2600, y: 1600, angle: Math.PI / 2 },
];

const TAXI_STANDS = [
  { x: 470, y: 1160 },
  { x: 2450, y: 450 },
  { x: 2050, y: 850 },
];

const PARKED_SPOTS = [
  { x: 640, y: 245, angle: 0 }, { x: 1040, y: 595, angle: 0 }, { x: 1440, y: 245, angle: 0 },
  { x: 1840, y: 945, angle: 0 }, { x: 2240, y: 1295, angle: 0 }, { x: 2640, y: 595, angle: 0 },
  { x: 245, y: 940, angle: Math.PI / 2 }, { x: 245, y: 1640, angle: Math.PI / 2 },
  { x: 645, y: 1295, angle: Math.PI / 2 }, { x: 1045, y: 1640, angle: Math.PI / 2 },
  { x: 1845, y: 1995, angle: Math.PI / 2 }, { x: 2645, y: 945, angle: Math.PI / 2 },
  { x: 3045, y: 1640, angle: Math.PI / 2 }, { x: 3045, y: 595, angle: Math.PI / 2 },
];

function blockBounds(col, row) {
  const x0 = col === 0 ? WORLD.beachX : WORLD.avenues[col - 1];
  const x1 = col >= WORLD.avenues.length ? WORLD.width : WORLD.avenues[col];
  const y0 = row === 0 ? 0 : WORLD.streets[row - 1];
  const y1 = row >= WORLD.streets.length ? WORLD.height : WORLD.streets[row];
  return { x0: x0 + WORLD.roadHalf + 12, y0: y0 + WORLD.roadHalf + 12, x1: x1 - WORLD.roadHalf - 12, y1: y1 - WORLD.roadHalf - 12 };
}

/** Build the city: roads, buildings, park, beach, pier, ramps, packages, stands. */
export function buildCity(rng) {
  const buildings = [];
  const cols = WORLD.avenues.length + 1;
  const rows = WORLD.streets.length + 1;
  // The park block (column 3, row 2) stays green; the beach strip stays sand.
  const parkBlock = { col: 3, row: 2 };
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      if (col === parkBlock.col && row === parkBlock.row) continue;
      const b = blockBounds(col, row);
      const w = b.x1 - b.x0;
      const h = b.y1 - b.y0;
      if (w < 60 || h < 60) continue;
      const landmark = LANDMARKS.find((l) => l.block[0] === col && l.block[1] === row);
      if (landmark) {
        buildings.push({
          x: landmark.x - landmark.w / 2, y: landmark.y - landmark.h / 2,
          w: landmark.w, h: landmark.h, name: landmark.name, sign: landmark.sign,
          color: PALETTE.building[(col + row) % PALETTE.building.length],
          height: 46 + ((col * 7 + row * 13) % 40),
        });
        continue;
      }
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i += 1) {
        const bw = rng.range(90, Math.max(100, w / count - 24));
        const bh = rng.range(80, Math.max(90, h - 24));
        const bx = b.x0 + (i * (w / count)) + rng.range(4, Math.max(5, w / count - bw - 8));
        const by = b.y0 + rng.range(4, Math.max(5, h - bh - 8));
        buildings.push({
          x: bx, y: by, w: bw, h: bh, name: null,
          sign: rng.chance(0.35) ? rng.int(0, PALETTE.neon.length - 1) : -1,
          color: PALETTE.building[rng.int(0, PALETTE.building.length - 1)],
          height: 26 + rng.int(0, 60),
        });
      }
    }
  }
  const park = blockBounds(parkBlock.col, parkBlock.row);
  const trees = [];
  for (let i = 0; i < 26; i += 1) {
    trees.push({ x: rng.range(park.x0 + 20, park.x1 - 20), y: rng.range(park.y0 + 20, park.y1 - 20), r: rng.range(10, 18) });
  }
  // Packages must sit on open ground: nudge any spot that landed inside a building
  // out to the nearest edge, so every package is reachable on foot or by car.
  const packages = PACKAGE_SPOTS.map(([x, y], i) => {
    let px = x;
    let py = y;
    for (let n = 0; n < 5; n += 1) {
      const inside = buildings.find((b) => px > b.x - 24 && px < b.x + b.w + 24 && py > b.y - 24 && py < b.y + b.h + 24);
      if (!inside) break;
      const toLeft = px - (inside.x - 24);
      const toRight = (inside.x + inside.w + 24) - px;
      const toTop = py - (inside.y - 24);
      const toBottom = (inside.y + inside.h + 24) - py;
      const min = Math.min(toLeft, toRight, toTop, toBottom);
      if (min === toLeft) px = inside.x - 26;
      else if (min === toRight) px = inside.x + inside.w + 26;
      else if (min === toTop) py = inside.y - 26;
      else py = inside.y + inside.h + 26;
    }
    return { id: i, x: px, y: py, taken: false };
  });
  return {
    buildings,
    park,
    trees,
    packages,
    ramps: RAMP_SPOTS,
    taxiStands: TAXI_STANDS,
    parkedSpots: PARKED_SPOTS,
    garage: { x: 760, y: 1840 },
    hospital: { x: 2400, y: 370 },
    pier: { x: 60, y: 1250 },
    pierEnd: { x: -110, y: 1250 },
    spawn: { x: 820, y: 1870 },
    nodes: buildNodes(),
  };
}

function buildNodes() {
  const nodes = [];
  WORLD.avenues.forEach((x) => {
    WORLD.streets.forEach((y) => nodes.push({ x, y }));
  });
  return nodes;
}

/** Is a point on a road, the beach, the park paths or the pier (walkable / drivable)? */
export function isOnRoad(city, x, y) {
  if (x < WORLD.waterX || x > WORLD.width || y < 0 || y > WORLD.height) return false;
  if (x < WORLD.beachX) return true; // sand and pier are open ground
  if (WORLD.avenues.some((ax) => Math.abs(x - ax) <= WORLD.roadHalf)) return true;
  if (WORLD.streets.some((sy) => Math.abs(y - sy) <= WORLD.roadHalf)) return true;
  return false;
}

export function nearestNode(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const n of buildNodes()) {
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

/** Shortest route along the road graph, as a list of intersections. Nodes are stored
 * avenue-major: index = avenueIndex * streets.length + streetIndex. */
export function findRoute(from, to) {
  const na = WORLD.avenues.length;
  const ns = WORLD.streets.length;
  const idx = (n) => WORLD.avenues.indexOf(n.x) * ns + WORLD.streets.indexOf(n.y);
  const start = nearestNode(from.x, from.y);
  const goal = nearestNode(to.x, to.y);
  const prev = new Map();
  const seen = new Set([idx(start)]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (cur.x === goal.x && cur.y === goal.y) break;
    const ai = WORLD.avenues.indexOf(cur.x);
    const si = WORLD.streets.indexOf(cur.y);
    const neighbours = [];
    if (ai > 0) neighbours.push({ x: WORLD.avenues[ai - 1], y: cur.y });
    if (ai < na - 1) neighbours.push({ x: WORLD.avenues[ai + 1], y: cur.y });
    if (si > 0) neighbours.push({ x: cur.x, y: WORLD.streets[si - 1] });
    if (si < ns - 1) neighbours.push({ x: cur.x, y: WORLD.streets[si + 1] });
    for (const n of neighbours) {
      if (seen.has(idx(n))) continue;
      seen.add(idx(n));
      prev.set(idx(n), cur);
      queue.push(n);
    }
  }
  const path = [goal];
  let cur = goal;
  while (prev.has(idx(cur))) {
    cur = prev.get(idx(cur));
    path.unshift(cur);
  }
  return path;
}

/** Push a circle out of every building it overlaps; returns true when it hit one. */
export function resolveBuildings(city, body) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= body.radius * body.radius) continue;
    hit = true;
    const d = Math.sqrt(d2) || 0.001;
    const push = body.radius - d;
    body.x += (dx / d) * push;
    body.y += (dy / d) * push;
    // Kill the velocity component that points into the wall.
    if (body.vx !== undefined && body.vy !== undefined) {
      const vn = (body.vx * dx + body.vy * dy) / d;
      if (vn < 0) {
        body.vx -= (dx / d) * vn;
        body.vy -= (dy / d) * vn;
      }
    }
  }
  // World bounds: the sea stops you on the west, the city limit on the rest.
  // West of the beach line the pier deck is the only ground, and in the pier
  // lane (its y range) a body crosses onto the deck freely; anywhere else the
  // beach line stops it. A body already west of the line is held on the deck.
  const m = body.radius;
  const onPierLane = body.y >= 1210 && body.y <= 1290;
  if (body.x < WORLD.waterX) {
    if (body.y < 1210 + m) { body.y = 1210 + m; hit = true; }
    if (body.y > 1290 - m) { body.y = 1290 - m; hit = true; }
    if (body.x < -140 + m) { body.x = -140 + m; hit = true; }
  } else if (!onPierLane && body.x < WORLD.waterX + m) {
    body.x = WORLD.waterX + m;
    hit = true;
  }
  if (body.x > WORLD.width - m) { body.x = WORLD.width - m; hit = true; }
  if (body.y < m) { body.y = m; hit = true; }
  if (body.y > WORLD.height - m) { body.y = WORLD.height - m; hit = true; }
  return hit;
}
