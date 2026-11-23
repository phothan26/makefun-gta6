// Screenshot scenes for MARSHLIGHT (?shot=start|drive|chase|complete).
// Each one sets up a deterministic state with the game's own code, so a
// screenshot shows the real game, not a mock-up. The "complete" scene
// runs the autopilot for real until the story ends, then shows the
// dossier screen.
import { createGame, stepGame } from './sim.js';
import { createBot, botInput } from './bot.js';

export function setupShot(s, name, seed) {
  if (name === 'start') {
    s.tick = 0;
    return 'title';
  }
  if (name === 'drive') {
    s.tick = 10800; // noon
    s.player.x = 340; s.player.y = 700;
    s.airboat.x = 340; s.airboat.y = 700;
    s.airboat.heading = Math.PI / 2;
    s.airboat.vx = 0; s.airboat.vy = 5;
    s.player.heading = Math.PI / 2;
    s.player.mode = 'airboat';
    s.jobIndex = 1; s.stepIndex = 0; s.jobStartTick = s.tick;
    s.carrying = true;
    return 'playing';
  }
  if (name === 'chase') {
    s.tick = 19000; // dusk
    s.player.x = 350; s.player.y = 1100;
    s.airboat.x = 350; s.airboat.y = 1100;
    s.airboat.heading = Math.PI / 2;
    s.airboat.vx = 0; s.airboat.vy = 5;
    s.player.heading = Math.PI / 2;
    s.player.mode = 'airboat';
    s.wanted = 3;
    s.carrying = true;
    s.boats[0].x = 340; s.boats[0].y = 980; s.boats[0].mode = 'chase';
    s.boats[1].x = 380; s.boats[1].y = 1020; s.boats[1].mode = 'chase';
    s.heli.active = true; s.heli.x = 410; s.heli.y = 1010;
    s.jobIndex = 4; s.stepIndex = 0; s.jobStartTick = s.tick;
    return 'playing';
  }
  if (name === 'complete') {
    // Play the whole story with the autopilot, for real, then show the
    // dossier. Deterministic: same seed, same ending.
    const bot = createBot();
    let guard = 0;
    while (!s.complete && guard++ < 60000) stepGame(s, botInput(s, bot));
    return 'complete';
  }
  return 'title';
}
