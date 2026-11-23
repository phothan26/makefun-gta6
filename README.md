# MARSHLIGHT — Gator Country Run

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/phothan26/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/phothan26/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the Leonida wetlands, built for make.fun's "Make GTA 6" bounty.

Willa "Marsh" Okafor runs goods through the swamp for Beau Toussaint: five story jobs from dawn to dusk, by airboat, by car, and on foot. The marsh has a tide that opens and closes side channels, a day cycle that changes how far the police can see, gator nests that are dangerous and useful at the same time, and a Mud Ghost trick — sit still in the reeds and the heat drops a star.

## What is in the game

- A 2400×1800 open marsh: winding main channel, two tide-gated side channels, a south-east channel to the Far Dock, dirt roads, reed beds, stilt houses and a bait shop.
- Three ways to move: airboat (fast on water, drifts wide, crosses mud at half speed), car (fast on roads), on foot (slow, slips into the reeds).
- Wanted level 0–5: police boats and cars chase, a helicopter joins at 3 stars. Hide in the reeds to lose the heat.
- Gators: they bite, and they scare the airboat — but police boats avoid their nests, so a gator channel is the safest escape route.
- Five story jobs (First Light, High Water, Gator Country, Mud Ghost, The Last Run), 12 hidden supply caches, a style meter, cash, and a dossier at the end of a run.
- HUD with wanted stars, health, cash, style, time of day, tide gauge and a live minimap; three WebAudio radio stations (Swamp Blues, Bayou Funk, Night Drive) plus synthesized sound effects; localStorage best-run save.
- An autopilot (press B) that plays the whole story by itself — the same autopilot the entrypoint runs headlessly to prove the game is beatable.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. WASD / arrows to drive, E to enter or leave a vehicle, 1/2/3 for radio, M to mute, B for autopilot, Esc to pause.

The entrypoint `main.ts` copies `game/` and `screenshots/` to `/output`, runs the autopilot for three seeds, and writes `run-report.json` and `dossier.json`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=t7e39kme&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
