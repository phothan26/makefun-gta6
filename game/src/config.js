// Neon Bay — Sunset Getaway: every tuning number and colour in one place.
// The view is a fixed 1280x720 logical area; the world is a 3200x2400 city the
// camera pans across, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };
export const WORLD = { width: 3200, height: 2400, waterY: 2300 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const ROADS_X = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const ROADS_Y = [200, 600, 1000, 1400, 1800, 2200];
export const ROAD_HALF = 46;

export const PLAYER = { walkSpeed: 235, radius: 14, health: 100, enterRange: 78 };

export const CAR = {
  length: 54, width: 27, accel: 440, brake: 760, reverseAccel: 320,
  maxSpeed: 545, maxReverse: 195, steer: 2.75, grip: 8.5,
};
export const COP_CAR = { maxSpeed: 472, accel: 400, steer: 2.9 };
export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 22;

export const WANTED_MAX = 5;
/** Sight radius of police by day; at night it shrinks (see SUNSET). */
export const SIGHT = { day: 430, night: 235 };
/** Seconds of no cop in sight before one wanted star fades. */
export const WANTED_FADE = 7;

export const STYLE = { nearMiss: 8, driftPerSec: 6, air: 15, package: 10, decay: 1.2 };

/** Sunset Clock: clock 0 = afternoon, 0.55 = golden hour, 1 = deep night. */
export const SUNSET = { golden: 0.55, night: 0.82 };

export const LANDMARKS = {
  garage: { x: 620, y: 600, label: "Dante's Garage" },
  museum: { x: 1400, y: 945, label: 'Neon Museum' },
  hotel: { x: 2955, y: 1000, label: 'Hotel Miramar' },
  nbpd: { x: 1800, y: 1355, label: 'NBPD HQ' },
  warehouse: { x: 1600, y: 2155, label: 'Pier Warehouse' },
  pier: { x: 1600, y: 2362, label: 'Neon Bay Pier' },
  ramp: { x: 2900, y: 1800, label: 'Stunt Ramp' },
};

/** The 12 hidden neon packages, fixed spots a run can learn by heart. */
export const PACKAGES = [
  { x: 260, y: 260 }, { x: 940, y: 260 }, { x: 2140, y: 260 }, { x: 2940, y: 260 },
  { x: 260, y: 940 }, { x: 1060, y: 1340 }, { x: 1740, y: 940 }, { x: 2540, y: 940 },
  { x: 260, y: 1740 }, { x: 940, y: 2140 }, { x: 2140, y: 2140 }, { x: 2940, y: 1340 },
];

export const PALETTE = {
  backdrop: '#0b0e1a',
  asphalt: '#23262f', asphaltLine: '#c8b45a', sidewalk: '#3a3d47',
  grass: '#1d3320', sand: '#8a6f4d', water: '#0d2b45',
  building: ['#2c2f3d', '#3a2f45', '#26384a', '#453a2f', '#33283a'],
  neon: ['#ff2d78', '#00e5ff', '#ffe600', '#7c4dff', '#00ff9d'],
  player: '#ff9f1c', playerCar: '#ff5a1f', traffic: ['#c9c9c9', '#4d7ea8', '#a84d4d', '#4da86e', '#8a7ec9'],
  cop: '#1e4fd8', copLight: ['#ff2d2d', '#2d7bff'],
  ped: ['#e8c39e', '#9ec7e8', '#e89ec7', '#c7e89e'],
  text: '#f4f1e8', muted: '#9aa0b5', gold: '#ffd166', panel: '#141828',
  wanted: '#ff3b30', health: '#3ddc84', style: '#ff2d78',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-bay.save.v1';

/** The three synthesised radio stations. */
export const STATIONS = ['NB-88 SYNTHWAVE', 'NB-102 LO-FI', 'NB-96 CHASE'];
