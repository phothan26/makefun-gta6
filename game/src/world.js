// The marsh: terrain, channels, roads, reed beds, docks, caches, gator
// nests and cypress trees. The skeleton (channels, roads, docks) is fixed
// so every seed plays fair; the seed only jitters decoration, cache spots
// and gator drift. Terrain is a pure function of x, y and the tide.
import { makeRng, rangeInt } from './random.js';

export const MAP_W = 2400;
export const MAP_H = 1800;

// Main channel: a winding river down the west side.
const MAIN_CHANNEL = [
  [300, -40], [340, 300], [280, 600], [360, 900],
  [320, 1200], [420, 1500], [380, 1840],
];
// Upper side channel (tide-gated).
const SIDE_A = [[340, 300], [700, 260], [1100, 320], [1500, 280]];
// Lower side channel (tide-gated, holds the gator nests).
const SIDE_B = [[360, 900], [800, 950], [1300, 900], [1700, 950]];
// South-east channel to the far dock.
const SOUTH_CH = [[400, 1500], [900, 1600], [1500, 1650], [2000, 1600]];

const REEDS = [
  [470, 450, 120, 80], [700, 700, 140, 90], [250, 1100, 110, 90],
  [600, 1400, 150, 90], [1000, 600, 120, 80], [1400, 1300, 140, 90],
  [1800, 500, 120, 80], [900, 1620, 130, 80],
];

export const REED_CENTERS = REEDS.map(([x, y]) => ({ x, y }));

const ROADS = [
  [250, 150, 2100, 220],   // north road
  [2000, 150, 2090, 1700], // east road
  [400, 1620, 2090, 1690], // south road
];

function distToPolyline(x, y, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, py = ay + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < best) best = d;
  }
  return best;
}

function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function inRect(x, y, r) {
  return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
}

// Tide in [-1, 1]. High at the start of a run, falling over ~3 minutes.
export function tideAt(tick) {
  return Math.sin((2 * Math.PI * (tick + 2700)) / 10800);
}

export function terrainAt(x, y, tick) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 'land';
  for (const r of ROADS) if (inRect(x, y, r)) return 'road';
  if (distToPolyline(x, y, MAIN_CHANNEL) < 75) return 'water';
  if (distToPolyline(x, y, SOUTH_CH) < 55) return 'water';
  const tide = tideAt(tick);
  if (distToPolyline(x, y, SIDE_A) < 50) return tide > 0 ? 'water' : 'mud';
  if (distToPolyline(x, y, SIDE_B) < 50) return tide > 0 ? 'water' : 'mud';
  for (const r of REEDS) if (inEllipse(x, y, r[0], r[1], r[2], r[3])) return 'reed';
  return 'land';
}

export function inReeds(x, y) {
  for (const r of REEDS) if (inEllipse(x, y, r[0], r[1], r[2], r[3])) return true;
  return false;
}

// Named places. Every job target is a dock on the water so the airboat
// can always reach it; the car is a toy for the player, never required.
export const PLACES = {
  baitShop: { x: 330, y: 290, name: "Beau's Bait Shop" },
  stiltHouse: { x: 420, y: 900, name: 'Stilt House' },
  farDock: { x: 2000, y: 1600, name: 'Far Dock' },
  southDock: { x: 400, y: 1750, name: 'South Dock' },
  gatorWest: { x: 750, y: 940, name: 'Gator Channel West' },
  gatorEast: { x: 1350, y: 930, name: 'Gator Channel East' },
  crateA1: { x: 700, y: 280, name: 'Crate A1' },
  crateA2: { x: 1200, y: 300, name: 'Crate A2' },
  crateB1: { x: 1000, y: 930, name: 'Crate B1' },
};

const CACHE_SPOTS = [
  [520, 470], [720, 720], [270, 1120], [620, 1420], [1020, 620],
  [1420, 1320], [1820, 520], [920, 1620], [340, 300], [480, 880],
  [1980, 1580], [420, 1730],
];

const GATOR_ANCHORS = [
  [900, 940], [1050, 920], [1200, 950], [850, 970], [600, 600], [350, 1300],
];

// Build the per-seed world: jittered caches, drifting gators, cypress.
export function buildWorld(seed) {
  const rng = makeRng(seed);
  const caches = CACHE_SPOTS.map(([x, y], i) => ({
    id: i, x: x + rangeInt(rng, -30, 30), y: y + rangeInt(rng, -30, 30),
    found: false,
  }));
  const gators = GATOR_ANCHORS.map(([x, y], i) => ({
    id: i, ax: x, ay: y, x, y,
    phase: rng() * Math.PI * 2, radius: 24 + rng() * 26,
    speed: 0.15 + rng() * 0.25,
  }));
  const trees = [];
  let guard = 0;
  while (trees.length < 42 && guard++ < 600) {
    const x = rangeInt(rng, 40, MAP_W - 40);
    const y = rangeInt(rng, 40, MAP_H - 40);
    const t = terrainAt(x, y, 0);
    if (t !== 'land') continue;
    if (Math.hypot(x - 300, y - 200) < 160) continue;
    trees.push({ x, y, r: 14 + rng() * 14 });
  }
  return { seed, caches, gators, trees };
}
