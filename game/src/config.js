// VICE HARBOR — Golden Hour Run
// Shared tuning and world constants. Pure data, no DOM, no randomness here:
// every layout number is fixed so the city is identical on every run.
export const WORLD = {
  w: 3200,
  h: 2400,
  // Harbor water: everything east of this line is sea.
  waterX: 2160,
  // South bay: water below this line, east of this x.
  bayY: 2100,
  bayX: 1000,
};

export const ROADS = {
  // Horizontal road centre-lines (y) and vertical road centre-lines (x).
  h: [300, 700, 1100, 1500, 1900],
  v: [300, 700, 1100, 1500, 1900],
  width: 110,
  // Roads stop at the water edge on the east and at the bay on the south.
  eastEnd: WORLD.waterX,
  southEnd: WORLD.bayY,
};

// Seeded layout of the city blocks. Each entry is a building block:
// [x, y, w, h] in world coordinates, drawn as a rooftop. Gaps between
// blocks are the streets; the bot drives on the streets.
export const BUILDINGS = [
  [120, 120, 130, 130], [450, 120, 130, 130], [830, 120, 130, 130],
  [1210, 120, 130, 130], [1590, 120, 130, 130], [1990, 120, 130, 130],
  [120, 480, 130, 130], [450, 480, 130, 130], [830, 480, 130, 130],
  [1210, 480, 130, 130], [1590, 480, 130, 130],
  [120, 880, 130, 130], [450, 880, 130, 130], [830, 880, 130, 130],
  [1210, 880, 130, 130], [1590, 880, 130, 130], [1990, 880, 130, 130],
  [120, 1280, 130, 130], [450, 1280, 130, 130], [830, 1280, 130, 130],
  [1210, 1280, 130, 130], [1590, 1280, 130, 130],
  [120, 1680, 130, 130], [450, 1680, 130, 130], [830, 1680, 130, 130],
  [1210, 1680, 130, 130], [1590, 1680, 130, 130], [1990, 1680, 130, 130],
  [120, 2030, 220, 130], [500, 2030, 130, 130], [830, 2030, 130, 130],
];

// Docks: wooden piers sticking out from the shore into the harbor.
// [x, y, w, h] — x is the shore-side edge, the pier extends east.
export const DOCKS = [
  { x: 2040, y: 380, w: 120, h: 70, name: 'North Dock' },
  { x: 2040, y: 880, w: 120, h: 70, name: 'Fish Dock' },
  { x: 2040, y: 1330, w: 140, h: 90, name: 'Marina' },
  { x: 2040, y: 1830, w: 120, h: 70, name: 'South Dock' },
];

// Fog banks in the harbor: hiding spots. [cx, cy, rx, ry].
export const FOG_BANKS = [
  { x: 2520, y: 520, rx: 270, ry: 180 },
  { x: 2720, y: 1480, rx: 300, ry: 210 },
  { x: 2420, y: 2080, rx: 280, ry: 170 },
];

// Stunt ramps on the roads: [x, y, angleDeg]. Driving over one launches you.
export const RAMPS = [
  { x: 1100, y: 700, a: 0 },
  { x: 1500, y: 1500, a: 90 },
  { x: 700, y: 1100, a: 180 },
];

// The 12 cargo crates: [x, y, where]. Four on land, four on the docks,
// four floating in the harbor (boat-only).
export const CRATES = [
  { x: 650, y: 250, where: 'land' },
  { x: 1450, y: 650, where: 'land' },
  { x: 250, y: 1450, where: 'land' },
  { x: 1850, y: 1850, where: 'land' },
  { x: 2090, y: 400, where: 'dock' },
  { x: 2090, y: 900, where: 'dock' },
  { x: 2090, y: 1370, where: 'dock' },
  { x: 2090, y: 1850, where: 'dock' },
  { x: 2500, y: 700, where: 'water' },
  { x: 2800, y: 1300, where: 'water' },
  { x: 2450, y: 1900, where: 'water' },
  { x: 2900, y: 900, where: 'water' },
];

export const SPOTS = {
  // Player start: on foot at the Marina.
  playerStart: { x: 2080, y: 1400 },
  // Safehouse: police cannot enter this circle; wanted melts inside it.
  safehouse: { x: 350, y: 350, r: 130 },
  // Clinic for the rescue job.
  clinic: { x: 1900, y: 700 },
  // Hidden cove for the smuggling delivery.
  cove: { x: 2300, y: 2250 },
  // Extraction point for the final getaway.
  extraction: { x: 2950, y: 400 },
};

export const PHYSICS = {
  footSpeed: 175,
  carAccel: 300,
  carMax: 430,
  carReverseMax: 130,
  carTurn: 2.9,
  carGrip: 0.92,
  boatAccel: 150,
  boatMax: 310,
  boatTurn: 1.7,
  boatGrip: 0.985,
  policeCarMax: 385,
  policeBoatMax: 285,
};

export const POLICE = {
  // Sight radius by darkness (0 = golden hour, 1 = full night).
  sightDusk: 430,
  sightNight: 235,
  // How long (seconds) the player must stay unseen before wanted drops.
  unseenToDecay: 4,
  decayEvery: 3,
  // Contact with a police unit: +1 wanted, knockback, immunity seconds.
  contactImmunity: 2,
  // Max units on the map at once.
  maxUnits: 5,
};

export const HEAT = {
  max: 100,
  stealSeen: 26,
  speedSeen: 9, // per second while speeding inside police sight
  bumpSeen: 14,
  decayHidden: 7, // per second while no police sees the player
  decayFog: 12,
  decayGhost: 30,
};

export const DAY = {
  // Full dusk-to-night cycle in seconds of play.
  cycleSeconds: 480,
  // The day starts at golden hour.
  startT: 0,
};

export const STYLE = {
  rampBonus: 22,
  nearMissBonus: 14,
  driftBonus: 6,
  decay: 1.6, // per second
};

export const JOBS = [
  {
    id: 'dock-pickup',
    name: 'THE DOCK PICKUP',
    brief: 'Selene needs a package off the Fish Dock. Grab it, then drop it at the garage on 15th.',
    reward: 500,
  },
  {
    id: 'smugglers-tide',
    name: "SMUGGLER'S TIDE",
    brief: 'Three crates are floating in the harbor. Take a boat, fish them out, deliver to the hidden cove.',
    reward: 800,
  },
  {
    id: 'golden-hour-run',
    name: 'GOLDEN HOUR RUN',
    brief: 'A pickup went loud. Get to the checkpoint, then lose the heat — the safehouse is the only clean exit.',
    reward: 1000,
  },
  {
    id: 'cold-trail-rescue',
    name: 'COLD TRAIL RESCUE',
    brief: 'Our driver is pinned in the alley off 19th. Get them out on foot, then drive them to the clinic.',
    reward: 1200,
  },
  {
    id: 'sunset-getaway',
    name: 'SUNSET GETAWAY',
    brief: 'Last run of the night. Drive to the Marina, take the boat, and reach the extraction point at the harbor mouth.',
    reward: 2000,
  },
];

export const RADIO = [
  { id: 'vh88', name: 'VH-88 GOLDEN FM', desc: 'synthwave', bpm: 112, wave: 'sawtooth', root: 55 },
  { id: 'vh102', name: 'VH-102 HARBOR JAZZ', desc: 'late-night jazz', bpm: 92, wave: 'triangle', root: 65.41 },
  { id: 'vh96', name: 'VH-96 NIGHT LO-FI', desc: 'lo-fi haze', bpm: 72, wave: 'sine', root: 49 },
];

export const COLORS = {
  waterDeep: '#0d2b45',
  waterShallow: '#14506e',
  land: '#2a2a33',
  grass: '#20291f',
  road: '#3a3a42',
  roadLine: '#c9a227',
  building: '#4a4458',
  buildingRoof: '#5d5470',
  dock: '#7a5a34',
  dockEdge: '#a67c4e',
  crate: '#e8b93c',
  ramp: '#d95d39',
  fog: 'rgba(200, 210, 225, 0.20)',
  player: '#ffd166',
  police: '#e8e8f0',
  policeLight: '#ff3b30',
  waypoint: '#ffe14d',
};
