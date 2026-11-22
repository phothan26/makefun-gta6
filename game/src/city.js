// Neon Bay itself: a road grid, the blocks between the roads filled with buildings,
// the landmarks, the pier, the stunt ramp, and the road graph every driver — traffic,
// police and the autopilot — routes on. Everything is fixed by the seed, so the same
// seed always builds the same city.
import { LANDMARKS, PACKAGES, PALETTE, ROADS_X, ROADS_Y, ROAD_HALF, WORLD } from './config.js';
import { int, pick } from './random.js';

function key(x, y) {
  return `${x},${y}`;
}

/** Breadth-first route over the road graph: a list of {x, y} waypoints, start excluded. */
export function route(graph, fromX, fromY, toX, toY) {
  const start = nearestNode(graph, fromX, fromY);
  const goal = nearestNode(graph, toX, toY);
  if (start === goal) return [{ x: toX, y: toY }];
  const prev = new Map([[start, null]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const cur = queue[head];
    if (cur === goal) break;
    for (const next of graph.links.get(cur) ?? []) {
      if (!prev.has(next)) {
        prev.set(next, cur);
        queue.push(next);
      }
    }
  }
  if (!prev.has(goal)) return [{ x: toX, y: toY }];
  const path = [];
  let cur = goal;
  while (cur !== null) {
    path.push(cur);
    cur = prev.get(cur);
  }
  path.reverse();
  const points = path.slice(1).map((k) => graph.nodes.get(k));
  // The goal node may already sit on the target (a landmark door): do not list it twice.
  const last = points[points.length - 1];
  if (!last || last.x !== toX || last.y !== toY) points.push({ x: toX, y: toY });
  return points;
}

export function nearestNode(graph, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const [k, node] of graph.nodes) {
    const d = (node.x - x) * (node.x - x) + (node.y - y) * (node.y - y);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Is (x, y) on a road (within the asphalt, not the sidewalk)? */
export function onRoad(x, y) {
  for (const rx of ROADS_X) if (Math.abs(x - rx) <= ROAD_HALF) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) <= ROAD_HALF) return true;
  return false;
}

/** The closest point on the road network to (x, y). */
export function snapToRoad(x, y) {
  let bestX = ROADS_X[0];
  let bestY = ROADS_Y[0];
  for (const rx of ROADS_X) if (Math.abs(x - rx) < Math.abs(x - bestX)) bestX = rx;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) < Math.abs(y - bestY)) bestY = ry;
  return Math.abs(x - bestX) < Math.abs(y - bestY) ? { x: bestX, y } : { x, y: bestY };
}

export function buildCity(random) {
  const buildings = [];
  const signs = [];
  // Blocks reserved for the landmark buildings stay clear of generic ones.
  const reserved = [
    { x0: 646, y0: 646, x1: 954, y1: 954 },     // Dante's Garage block
    { x0: 1046, y0: 646, x1: 1354, y1: 954 },   // Neon Museum block
    { x0: 2646, y0: 646, x1: 2954, y1: 954 },   // Hotel Miramar block
    { x0: 1446, y0: 1046, x1: 1754, y1: 1354 }, // NBPD HQ block
    { x0: 1446, y0: 1846, x1: 1754, y1: 2154 }, // Pier Warehouse block
  ];
  // One building per block, inset from the roads, never on a landmark plot.
  for (let ix = 0; ix < ROADS_X.length - 1; ix += 1) {
    for (let iy = 0; iy < ROADS_Y.length - 1; iy += 1) {
      const x0 = ROADS_X[ix] + ROAD_HALF + 14;
      const y0 = ROADS_Y[iy] + ROAD_HALF + 14;
      const x1 = ROADS_X[ix + 1] - ROAD_HALF - 14;
      const y1 = ROADS_Y[iy + 1] - ROAD_HALF - 14;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      if (reserved.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1)) continue;
      const w = (x1 - x0) * (0.55 + random() * 0.35);
      const h = (y1 - y0) * (0.55 + random() * 0.35);
      const color = pick(random, PALETTE.building);
      buildings.push({ x: cx - w / 2, y: cy - h / 2, w, h, color, floors: 2 + int(random, 5) });
      if (random() < 0.55) {
        signs.push({
          x: cx - w / 2 + random() * w,
          y: cy - h / 2 - 4,
          text: pick(random, ['NEON', 'BAR', 'HOTEL', '24H', 'TACOS', 'CINE', 'MOTEL', 'PIER', 'DANCE', 'RAMEN']),
          color: pick(random, PALETTE.neon),
        });
      }
    }
  }
  // The landmark buildings, drawn bigger and named, each inside its own block.
  const landmarkBuildings = [
    { x: 660, y: 690, w: 180, h: 120, color: '#4a2c2c', floors: 2, label: "Dante's Garage" },
    { x: 1110, y: 735, w: 180, h: 130, color: '#2c3a4a', floors: 3, label: 'Neon Museum' },
    { x: 2715, y: 690, w: 170, h: 220, color: '#3a2c4a', floors: 6, label: 'Hotel Miramar' },
    { x: 1500, y: 1130, w: 200, h: 140, color: '#2c3444', floors: 3, label: 'NBPD HQ' },
    { x: 1500, y: 1940, w: 200, h: 120, color: '#3a3226', floors: 2, label: 'Pier Warehouse' },
  ];
  for (const b of landmarkBuildings) buildings.push(b);

  // The road graph: every intersection, linked to its neighbours, plus a door node
  // for each landmark so the bot can route to a door and walk the last few steps.
  const nodes = new Map();
  const links = new Map();
  const addNode = (x, y) => {
    const k = key(x, y);
    if (!nodes.has(k)) {
      nodes.set(k, { x, y });
      links.set(k, []);
    }
    return k;
  };
  const link = (a, b) => {
    if (!links.get(a).includes(b)) links.get(a).push(b);
    if (!links.get(b).includes(a)) links.get(b).push(a);
  };
  for (const x of ROADS_X) {
    for (const y of ROADS_Y) addNode(x, y);
  }
  for (let ix = 0; ix < ROADS_X.length - 1; ix += 1) {
    for (const y of ROADS_Y) link(key(ROADS_X[ix], y), key(ROADS_X[ix + 1], y));
  }
  for (let iy = 0; iy < ROADS_Y.length - 1; iy += 1) {
    for (const x of ROADS_X) link(key(x, ROADS_Y[iy]), key(x, ROADS_Y[iy + 1]));
  }
  const doors = {};
  for (const [name, lm] of Object.entries(LANDMARKS)) {
    const near = snapToRoad(lm.x, lm.y);
    // Link the door to the nearest intersection BEFORE adding it, or the door
    // would link to itself and sit off the road network, unreachable by route.
    const nearest = nearestNode({ nodes, links }, lm.x, lm.y);
    const dk = addNode(near.x, near.y);
    link(dk, nearest);
    doors[name] = { x: lm.x, y: lm.y, node: dk, label: lm.label };
  }

  const packages = PACKAGES.map((p, i) => ({ ...p, index: i, taken: false }));

  return {
    buildings, signs, landmarkBuildings,
    graph: { nodes, links },
    doors,
    packages,
    ramp: { ...LANDMARKS.ramp, angle: -Math.PI / 2, width: 70 },
    pier: { x: 1600, y: WORLD.waterY, width: 130, endY: 2380 },
    world: WORLD,
  };
}
