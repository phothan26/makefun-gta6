# VICE HARBOR — Golden Hour Run

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/phothan26/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/phothan26/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world 2D canvas crime game in the spirit of GTA 6, built for [make.fun](https://make.fun)'s **Make GTA 6** bounty ($1,666 in USDC). Pure JavaScript, no libraries, no network at runtime — just a browser and a city that never sleeps.

## The story

Vice Harbor is a neon port city sliding from golden hour into night. Rook Calloway, a boat-and-car courier fresh out of a bad year, runs jobs for the fixer Selene Voss: a dock pickup, a smuggling run through the harbor fog, a chase that goes loud, a rescue in the alleys, and one last sunset getaway. Five jobs, one night, and a wanted level that only ever climbs.

## What makes it different

- **Three ways to move** — on foot, by car, and by boat, each with its own handling. The harbor water is drivable; boats drift wide and carve different lines than cars.
- **Heat, not just stars** — a Heat meter builds when the police *see* you commit a crime and decays while you stay hidden or sit in the fog. Heat boiling over becomes a wanted star.
- **Ghost Mode** — slip into a harbor fog bank and press G: you vanish from police sight and stars bleed away, one by one.
- **A day cycle that matters** — police sight radius shrinks from 430px at golden hour to 235px at full night. Darkness is your friend.
- **The safehouse** — the one address the police will not enter. Get inside and the heat melts.
- **12 cargo crates, stunt jumps, a style meter** — jumps, near-misses and drifts pay style; crates pay cash.
- **Three synthesized radio stations** — VH-88 Golden FM (synthwave), VH-102 Harbor Jazz, VH-96 Night Lo-Fi — all WebAudio oscillators, plus engine hum and two-tone sirens. No audio files.
- **A bot that plays it** — `game/src/bot.js` drives the simulation headlessly and completes all five jobs with zero errors.

## How to play

```sh
node serve.ts
# open http://127.0.0.1:8080/game/index.html
```

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive / sail |
| E | Enter / exit a car or boat |
| G | Ghost Mode (inside harbor fog) |
| 1 / 2 / 3 | Radio station |
| M | Mute |

Follow the gold marker. Finish a job to bank its payout; collect crates for $50 each. Your progress saves to localStorage automatically.

## The five jobs

1. **THE DOCK PICKUP** ($500) — grab the package off the Fish Dock, deliver it to the garage on 15th.
2. **SMUGGLER'S TIDE** ($800) — take a boat, fish three floating crates out of the harbor, deliver to the hidden cove.
3. **GOLDEN HOUR RUN** ($1,000) — the pickup goes loud. Reach the checkpoint, then lose two stars of heat and get to the safehouse.
4. **COLD TRAIL RESCUE** ($1,200) — pull your driver out of the alley off 19th on foot, then drive them to the clinic.
5. **SUNSET GETAWAY** ($2,000) — drive to the Marina, take the boat, and reach the extraction point at the harbor mouth.

## Build it (the entrypoint)

```sh
node main.ts            # writes game/ + screenshots/ + dossier.json to ./output
MAKEFUN_OUTPUT_DIR=/output node main.ts
node game/src/bot.js    # autopilot: plays all five jobs headlessly
```

Screenshots are staged by `game/src/shots.js` (needs Playwright): it serves the game, opens each `?shot=` state in a headless browser at 1280×720, and captures the canvas into `screenshots/`.

## Files

- `game/index.html` — the game page
- `game/src/` — the game: `config`, `random`, `city`, `world`, `missions`, `render`, `audio`, `input`, `save`, `main`, `bot`, `shots`
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the output dir and writes `dossier.json`
- `serve.ts` — a tiny static server (Node stdlib only)
- `shots.json` — the four screenshot definitions
- `screenshots/` — start, drive, chase, complete

Built by an AI agent for make.fun's **Make GTA 6** bounty. [make.fun](https://make.fun/r/t7e39kme)
