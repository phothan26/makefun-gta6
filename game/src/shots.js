// The screenshot scenes behind ?shot=start|drive|chase|complete. Each one plays the
// real rules forward from a fresh world for a fixed stretch, steered by the same
// autopilot a player could use, so the frame is what a short game really looks
// like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { createBot } from './bot.js';
import { SCREEN_COMPLETE, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function playForward(world, bot, seconds, until) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, bot.update(STEP));
    if (until && until()) break;
  }
}

export function stageShot(name, world) {
  const bot = createBot(world);
  if (name === 'drive') {
    world.reset(1);
    world.clock = 0.5; // Golden hour over the bay.
    playForward(world, bot, 30);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    world.reset(4);
    world.clock = 0.9; // Deep night: neon on, headlights on, short sight.
    playForward(world, bot, 90, () => {
      if (world.player.wanted < 3) return false;
      return world.cops.some((c) => Math.hypot(c.x - world.player.car.x, c.y - world.player.car.y) < 380);
    });
    return { screen: SCREEN_PLAY };
  }
  if (name === 'complete') {
    world.reset(0);
    playForward(world, bot, 180, () => world.missions.status === 'complete' || world.missions.status === 'story');
    if (world.missions.status === 'complete' || world.missions.status === 'story') {
      return { screen: SCREEN_COMPLETE };
    }
    return { screen: SCREEN_PLAY };
  }
  // start: the title over a living city at golden hour.
  world.reset();
  world.clock = 0.5;
  playForward(world, bot, 5);
  return { screen: SCREEN_TITLE };
}
