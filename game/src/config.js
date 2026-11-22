// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The city the game plays in, in world units. */
export const WORLD = {
  width: 3200,
  height: 2400,
  // West edge: water, then sand, then the first avenue. East edge is the city limit.
  waterX: 70,
  beachX: 200,
  roadHalf: 45,
  avenues: [200, 600, 1000, 1400, 1800, 2200, 2600, 3000],
  streets: [200, 550, 900, 1250, 1600, 1950, 2200],
};

export const PLAYER = {
  radius: 14,
  walkSpeed: 210,
  runSpeed: 320,
  health: 100,
  punchRange: 34,
  punchDamage: 25,
  punchCooldown: 0.35,
};

export const CAR = {
  radius: 15,
  length: 44,
  width: 22,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 180,
  steer: 2.6,
  grip: 6.0,
  driftGrip: 1.6,
  trafficSpeed: 150,
  copSpeed: 520,
};

export const WANTED = {
  max: 5,
  decayQuietSeconds: 12,
  decayStepSeconds: 8,
  // Police eyesight radius by time of day: night hides you better.
  sightDay: 620,
  sightNight: 420,
  bustSeconds: 1.5,
};

export const STYLE = {
  nearMiss: 10,
  driftPerSecond: 6,
  airTime: 25,
  package: 15,
  passenger: 20,
  decayPerSecond: 2,
  payoutPerPoint: 1,
};

export const TIME = {
  // One full day cycle, in seconds of play: golden hour -> sunset -> neon night -> dawn.
  cycleSeconds: 360,
  sunsetStart: 0.18,
  nightStart: 0.45,
  dawnStart: 0.9,
};

export const MISSION = {
  failCashPercent: 0.1,
  packageReward: 50,
  taxiFareBase: 40,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-bay.save.v1';
export const BEST_KEY = 'neon-bay.best.v1';

/** Neon Bay's look: a sun-soaked coast sliding into a neon night. */
export const PALETTE = {
  // Sky, keyed by time of day (day / sunset / night / dawn).
  skyDay: ['#7ec8e3', '#bfe8f2'],
  skySunset: ['#ff7e5f', '#feb47b'],
  skyNight: ['#1b1035', '#3b1d5e'],
  skyDawn: ['#f7b733', '#fc4a1a'],
  sunDay: '#fff3b0',
  sunSet: '#ff5e3a',
  sunNight: '#f4f1de',
  waterDay: '#2e86ab',
  waterNight: '#12233d',
  sand: '#e8c98f',
  grass: '#5d8a4a',
  grassNight: '#2c4630',
  asphalt: '#33363e',
  asphaltNight: '#23252c',
  sidewalk: '#8d8d94',
  sidewalkNight: '#4a4a52',
  roadLine: '#f2d06b',
  building: ['#e8b4b8', '#a8d8ea', '#f6e6ad', '#c5b0d5', '#ffb6a3', '#9fd8c9', '#f2c6de'],
  buildingNight: ['#4a3a52', '#2e4256', '#54452e', '#3d3350', '#54382f', '#2e4a44', '#4e3345'],
  neon: ['#ff2e88', '#00f0ff', '#ffe600', '#7cff00', '#ff6b35'],
  player: '#ffe600',
  playerCar: '#ff2e88',
  traffic: ['#d9d9d9', '#7fb3d5', '#f5b041', '#a569bd', '#58d68d', '#ec7063'],
  taxi: '#ffd60a',
  cop: '#2e86ff',
  copLightR: '#ff2e2e',
  copLightB: '#2e6bff',
  ped: ['#f5c6a5', '#c9a06c', '#8d5524', '#ffdbac'],
  pedShirt: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'],
  text: '#f5f1e6',
  muted: '#b8b0a0',
  panel: 'rgba(16, 12, 32, 0.82)',
  panelBorder: '#ff2e88',
  gold: '#ffd60a',
  danger: '#ff3b30',
};
