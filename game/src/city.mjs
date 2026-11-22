// NEON RAIN — Midnight Courier: the rain-soaked city.
// A grid of avenues and streets. Blocks between the roads hold neon buildings,
// a few are cut by walkable alleys, a few are open plazas. Landmarks, hidden
// packages and parking spots sit on the sidewalks, clear of every building.

import { makeRng, clamp } from './rng.mjs';

export const WORLD_W = 2400;
export const WORLD_H = 1800;
export const ROAD_W = 64;
export const ROAD_XS = [150, 450, 750, 1050, 1350, 1650, 1950, 2250];
export const ROAD_YS = [150, 450, 750, 1050, 1350, 1650];

export const NEON = ['#ff2d78', '#00e5ff', '#ffe14d', '#b26bff', '#39ff88', '#ff7a1a'];

export const LANDMARK_NAMES = [
  'Midnight Diner',
  'Rain Market',
  'Vermilion Tower',
  'Harbor Gate',
  'Neon Docks',
  'Skyline Plaza',
  'Old Depot',
  'Lumen Arcade',
];

// Landmark i sits at the corner of intersection LANDMARK_SPOTS[i].
const LANDMARK_SPOTS = [
  [1, 4],
  [2, 1],
  [4, 2],
  [7, 0],
  [0, 5],
  [5, 3],
  [3, 5],
  [6, 1],
];

export function intersections() {
  const out = [];
  for (const y of ROAD_YS) {
    for (const x of ROAD_XS) out.push({ x, y });
  }
  return out;
}

function rectHitsBuildings(buildings, x, y, r) {
  for (const b of buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

export function generateCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const alleys = [];
  const puddles = [];

  // One block per gap between neighbouring roads.
  for (let j = 0; j < ROAD_YS.length - 1; j++) {
    for (let i = 0; i < ROAD_XS.length - 1; i++) {
      const bx = ROAD_XS[i] + ROAD_W / 2;
      const by = ROAD_YS[j] + ROAD_W / 2;
      const bw = ROAD_XS[i + 1] - ROAD_XS[i] - ROAD_W;
      const bh = ROAD_YS[j + 1] - ROAD_YS[j] - ROAD_W;
      const roll = rng.next();
      if (roll < 0.14) {
        // Plaza: open square with puddles, no building.
        for (let k = 0; k < 3; k++) {
          puddles.push({
            x: bx + rng.range(30, bw - 30),
            y: by + rng.range(30, bh - 30),
            rx: rng.range(18, 46),
            ry: rng.range(10, 22),
          });
        }
        continue;
      }
      const neon = rng.pick(NEON);
      if (roll < 0.42) {
        // Two towers split by a walkable alley.
        const vertical = rng.chance(0.5);
        const gap = 40;
        if (vertical) {
          const w1 = (bw - gap) * rng.range(0.35, 0.65);
          buildings.push({
            x: bx + 22, y: by + 22, w: w1 - 22, h: bh - 44,
            color: '#1a2138', neon, lit: rng.next(),
          });
          buildings.push({
            x: bx + 22 + w1 + gap, y: by + 22, w: bw - w1 - gap - 22, h: bh - 44,
            color: '#141a2e', neon: rng.pick(NEON), lit: rng.next(),
          });
          alleys.push({ x: bx + 22 + w1, y: by + 10, w: gap, h: bh - 20, vertical: true });
        } else {
          const h1 = (bh - gap) * rng.range(0.35, 0.65);
          buildings.push({
            x: bx + 22, y: by + 22, w: bw - 44, h: h1 - 22,
            color: '#1a2138', neon, lit: rng.next(),
          });
          buildings.push({
            x: bx + 22, y: by + 22 + h1 + gap, w: bw - 44, h: bh - h1 - gap - 22,
            color: '#141a2e', neon: rng.pick(NEON), lit: rng.next(),
          });
          alleys.push({ x: bx + 10, y: by + 22 + h1, w: bw - 20, h: gap, vertical: false });
        }
      } else {
        // One big tower, set back from the block edge so the corners stay
        // walkable sidewalk.
        buildings.push({
          x: bx + 26, y: by + 26, w: bw - 52, h: bh - 52,
          color: rng.chance(0.5) ? '#1a2138' : '#12182a', neon, lit: rng.next(),
        });
      }
    }
  }

  // Rain puddles on the roads and sidewalks.
  for (let k = 0; k < 46; k++) {
    const vertical = rng.chance(0.5);
    let x;
    let y;
    if (vertical) {
      x = rng.pick(ROAD_XS) + rng.range(-26, 26);
      y = rng.range(60, WORLD_H - 60);
    } else {
      x = rng.range(60, WORLD_W - 60);
      y = rng.pick(ROAD_YS) + rng.range(-26, 26);
    }
    puddles.push({ x, y, rx: rng.range(16, 52), ry: rng.range(9, 20) });
  }

  const landmarks = LANDMARK_SPOTS.map(([ix, iy], i) => ({
    id: i,
    name: LANDMARK_NAMES[i],
    x: ROAD_XS[ix] + 44,
    y: ROAD_YS[iy] + 44,
  }));

  // Twelve hidden packages on sidewalks, never inside a building.
  const packages = [];
  let guard = 0;
  while (packages.length < 12 && guard++ < 400) {
    const vertical = rng.chance(0.5);
    let x;
    let y;
    if (vertical) {
      x = rng.pick(ROAD_XS) + (rng.chance(0.5) ? 44 : -44);
      y = rng.range(80, WORLD_H - 80);
    } else {
      x = rng.range(80, WORLD_W - 80);
      y = rng.pick(ROAD_YS) + (rng.chance(0.5) ? 44 : -44);
    }
    if (rectHitsBuildings(buildings, x, y, 20)) continue;
    if (packages.some((p) => Math.hypot(p.x - x, p.y - y) < 130)) continue;
    packages.push({ id: packages.length, x, y, taken: false });
  }

  // Parking spots: cars and bikes waiting on the sidewalk near intersections.
  const parking = [];
  const spots = intersections();
  for (let k = 0; k < 5; k++) {
    const s = spots[Math.floor(rng.next() * spots.length)];
    const dx = rng.chance(0.5) ? 48 : -48;
    const x = s.x + dx;
    const y = s.y + 48;
    if (rectHitsBuildings(buildings, x, y, 24)) continue;
    if (parking.some((p) => Math.hypot(p.x - x, p.y - y) < 90)) continue;
    parking.push({ x, y, kind: k < 3 ? 'car' : 'bike', angle: rng.range(0, Math.PI * 2) });
  }
  while (parking.filter((p) => p.kind === 'car').length < 3) {
    const s = spots[Math.floor(rng.next() * spots.length)];
    parking.push({ x: s.x + 48, y: s.y - 48, kind: 'car', angle: 0 });
  }

  return { buildings, alleys, puddles, landmarks, packages, parking };
}

// The road graph the bot and the police drive on: every intersection is a
// node, neighbours along a road are edges, and each landmark / parking spot
// hangs off its nearest intersection.
export function cityGraph(city) {
  const nodes = intersections().map((p) => ({ x: p.x, y: p.y, kind: 'cross' }));
  const indexOf = (x, y) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.hypot(nodes[i].x - x, nodes[i].y - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const adj = nodes.map(() => []);
  const link = (a, b) => {
    if (!adj[a].includes(b)) adj[a].push(b);
    if (!adj[b].includes(a)) adj[b].push(a);
  };
  for (let j = 0; j < ROAD_YS.length; j++) {
    for (let i = 0; i < ROAD_XS.length; i++) {
      const n = j * ROAD_XS.length + i;
      if (i + 1 < ROAD_XS.length) link(n, n + 1);
      if (j + 1 < ROAD_YS.length) link(n, n + ROAD_XS.length);
    }
  }
  const attach = (x, y, kind) => {
    const near = indexOf(x, y);
    const id = nodes.length;
    nodes.push({ x, y, kind });
    adj.push([near]);
    adj[near].push(id);
    return id;
  };
  const landmarkNode = city.landmarks.map((l) => attach(l.x, l.y, 'landmark'));
  const parkingNode = city.parking.map((p) => attach(p.x, p.y, 'parking'));
  return { nodes, adj, indexOf, landmarkNode, parkingNode };
}

// Breadth-first shortest path between node ids. Returns node ids.
export function bfsPath(graph, from, to) {
  if (from === to) return [from];
  const prev = new Array(graph.nodes.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const n = queue.shift();
    for (const m of graph.adj[n]) {
      if (prev[m] !== -1) continue;
      prev[m] = n;
      if (m === to) {
        const path = [to];
        let c = to;
        while (c !== from) { c = prev[c]; path.push(c); }
        return path.reverse();
      }
      queue.push(m);
    }
  }
  return [from, to];
}
