// NEON RAIN — Midnight Courier: the entry point (Node 22+, standard library only).
//
// What it does, in order:
//   1. Plays the game headless with the autopilot on three seeds, so the run
//      proves the bot can finish all five courier jobs on its own. The result
//      lands in /output/report.json — a plain record, no timestamps, so two
//      runs with the same seeds write byte-identical bytes.
//   2. Copies game/ and screenshots/ from beside this file to /output.
//   3. Writes /output/dossier.json with the vendored make.fun library.
//
// The program never changes /output itself: it only makes files it creates
// world-readable, and every chmod is guarded, so a read-only output root is
// fine. A bot seed that fails is recorded in the report, never fatal: the
// game is still handed in, and the dossier is still written.

import { cpSync, existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';
import { runBot } from './game/src/bot.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The output root belongs to whoever made it; only touch files of our own.
mkdirSync(out, { recursive: true });

function makeWorldReadable(path) {
  try {
    chmodSync(path, 0o644);
  } catch {
    // A filesystem that refuses the chmod still leaves a readable file in
    // the usual case; the run goes on either way.
  }
}

// 1. Headless proof: the autopilot plays three nights on its own.
const seeds = [7, 42, 1337];
const nights = [];
for (const seed of seeds) {
  try {
    nights.push(runBot(seed));
  } catch (err) {
    nights.push({ seed, jobs: 0, complete: false, ticks: 0, money: 0, packages: 0, errors: [String(err)] });
  }
}
const report = {
  game: 'NEON RAIN — Midnight Courier',
  courier: 'Juno Reyes',
  fixer: 'Mara Voss',
  jobs: 5,
  hiddenPackages: 12,
  nights,
  allComplete: nights.every((n) => n.complete && n.errors.length === 0),
};
const reportPath = join(out, 'report.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
makeWorldReadable(reportPath);
for (const n of nights) {
  console.log(`night seed=${n.seed} jobs=${n.jobs}/5 complete=${n.complete} ticks=${n.ticks} money=$${n.money} packages=${n.packages} errors=${n.errors.length}`);
}

// 2. The game and its screenshots, exactly as they sit in the repository.
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// 3. The dossier the judge reads, built by the scorer's own library.
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
makeWorldReadable(dossierPath);
console.log(`dossier written: ${dossierPath}`);
console.log(`all nights complete: ${report.allComplete}`);
