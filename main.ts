// MARSHLIGHT — Gator Country Run (gta6-01, variant 3). Node 22, standard
// library only. The entrypoint hands the game in: it copies game/ and
// screenshots/ from beside this file to /output, proves the game is
// beatable by running the autopilot headlessly for three seeds, and
// writes /output/dossier.json with the vendored make.fun library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
// /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The bot run is pure simulation — no browser, no clock, no network —
// so two runs write the same bytes. The screenshots in screenshots/
// are renders the maker took of the game in a browser; this program
// copies them, never re-renders them.

import { cpSync, existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';
import { createGame, stepGame } from './game/src/sim.js';
import { createBot, botInput } from './game/src/bot.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const SEEDS = [1, 7, 42];
const TICK_CAP = 43200;

// Every file this program creates gets world-readable permissions,
// guarded, and never applied to /output itself or to anything this
// program did not make — the grader runs as another user.
function makeReadable(path) {
  try { chmodSync(path, 0o644); } catch { /* already readable */ }
}

function playSeed(seed) {
  const game = createGame(seed);
  const bot = createBot();
  while (!game.complete && game.tick < TICK_CAP) {
    stepGame(game, botInput(game, bot));
  }
  if (!game.complete) {
    throw new Error(`seed ${seed}: the autopilot did not finish the story`);
  }
  return game.report;
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

const runs = SEEDS.map((seed) => playSeed(seed));
const runReport = {
  title: 'MARSHLIGHT — Gator Country Run',
  hero: 'Willa "Marsh" Okafor',
  fixer: 'Beau Toussaint',
  seeds: SEEDS,
  tickCap: TICK_CAP,
  runs: runs.map((r) => ({
    seed: r.seed,
    complete: r.complete,
    ticks: r.ticks,
    cash: r.cash,
    style: r.style,
    busted: r.busted,
    cachesFound: r.cachesFound,
    cachesTotal: r.cachesTotal,
    jobs: r.jobs,
  })),
};
const runReportPath = join(out, 'run-report.json');
writeFileSync(runReportPath, JSON.stringify(runReport, null, 2) + '\n');
makeReadable(runReportPath);

// The scorer's own caps: only text_max_bytes shapes the bytes; the
// others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or
// 48 MiB of game files in all, or a path under game/ over 1000 bytes).
const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
makeReadable(dossierPath);

console.log(`MARSHLIGHT: ${runs.length} seeds, all complete — ` +
  runs.map((r) => `seed ${r.seed}: ${r.ticks} ticks, $${r.cash}`).join('; '));
