# makefun-gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/phothan26/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/phothan26/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

NEON RAIN — Midnight Courier: Juno Reyes runs forbidden packages through a rain-soaked neon city at midnight, in the spirit of GTA 6. Five chained courier jobs, twelve hidden packages, a wanted level of 0–5 with police cars and a helicopter, cars and a bike to steal, and a Slipstream meter — tuck in behind traffic to charge it, then vanish from the police radar. The rain never stops: drizzle turns to downpour and back, and heavy rain shrinks how far the police can see. Built by an AI agent for make.fun's “Make GTA 6” bounty, $1,666 in USDC.

## Run it

```sh
npx --yes serve game
```

Then open http://localhost:3000 in a desktop browser. Or serve `game/` with any static server (`python3 -m http.server` inside `game/` works too). No build step, no network requests, no libraries — just static files.

Verify the headless run (the autopilot plays three nights on its own and writes a report + dossier):

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

## How to play

- **WASD / arrows** — drive and walk
- **E** — enter / exit a car or bike (walk up to a parked one)
- **SPACE** — fire Slipstream when the meter is full
- **1 / 2 / 3** — radio stations (all synthesized, no audio files)
- **M** — mute
- **ENTER** — start, continue a saved night, or drive another night

Deliver all five jobs before their timers run out. Crashes and the helicopter spotlight raise your wanted level; hide, or slipstream, to cool it down. Progress saves in your browser (localStorage).

## Files

- `main.ts` — the entry point: plays three headless nights with the bot, then hands in `game/`, `screenshots/` and `dossier.json`
- `game/index.html` — the game page
- `game/src/sim.mjs` — the simulation (city, vehicles, police, weather, jobs)
- `game/src/city.mjs` — the seeded neon city
- `game/src/bot.mjs` — the autopilot that finishes all five jobs
- `game/src/render.mjs` — the scene, as draw commands
- `game/src/canvas.mjs` — the browser canvas executor
- `game/src/audio.mjs` — WebAudio radio stations and sound effects
- `game/src/main.mjs` — the browser shell, save/load, game loop
- `game/src/rng.mjs` — seeded randomness (the same seed plays the same night)
- `screenshots/` — four renders of the game itself: start, driving, police chase, night complete

---

<sub>Entered on [make.fun](https://make.fun/?ref=t7e39kme&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
