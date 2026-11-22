// Neon Bay — Sunset Getaway (gta6-01 entry, Node 22, standard library only): the game
// is this directory's game/ folder, plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library and no network request), and this
// program hands it in. It copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library. Outside the grader's container, MAKEFUN_OUTPUT_DIR
// stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The grader reads the output as uid 65534, so the files this program just wrote are
// made world-readable — files 0644, directories 0755. Only paths under /output are
// touched, and only ones this program created; /output itself is never chmodded, and
// a failure to chmod one file never fails the run.
function makeReadable(dir) {
  // The directory itself, then everything inside it: this program created
  // all of these paths under /output, so chmodding them is safe.
  try {
    chmodSync(dir, 0o755);
  } catch {
    // A single unreadable path must not fail the hand-in.
  }
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    try {
      const st = statSync(path);
      if (st.isDirectory()) {
        chmodSync(path, 0o755);
        makeReadable(path);
      } else if (st.isFile()) {
        chmodSync(path, 0o644);
      }
    } catch {
      // A single unreadable file must not fail the hand-in.
    }
  }
}
makeReadable(join(out, 'game'));
makeReadable(join(out, 'screenshots'));

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes;
// the others refuse an entry the scorer would refuse (more than 4 screenshots or one
// over 256 KiB; more than 993 files in game/ or 48 MiB of game files, in all, or a
// path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap,
// its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// dossier.json is written after the copies above, so it gets the same
// world-readable treatment: a file this program just created, chmodded
// 0644, guarded so a failure never fails the run.
try {
  chmodSync(join(out, 'dossier.json'), 0o644);
} catch {
  // The run is still a success without it.
}
