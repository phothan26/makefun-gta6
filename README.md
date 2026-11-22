# Neon Bay — Sunset Getaway

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/phothan26/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/phothan26/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in a city that never stops glowing. You are Mara Voss, a getaway driver fresh out of prison, working jobs for fixer Dante Cole across Neon Bay — a sun-soaked coastal city where every mission runs on a sunset clock: golden hour slides into neon night, the cops see less in the dark, and the neon burns brighter.

## What is in the game

- **A city to explore on foot and by car** — grid streets, traffic, pedestrians, a beach, a pier, a park, and landmarks from Dante's Garage to the Neon Museum.
- **Driving with feel** — arcade physics, handbrake drifts, near-miss style points, stunt ramps, and a wanted system where swapping to a fresh car sheds a star (*Swap & Vanish*).
- **Five story jobs** — steal a car for the interview, a timed delivery before dark, taxi fares, losing a three-star tail, and a finale through police roadblocks to the pier.
- **The Sunset Clock** — the sun sets as you play; at night the neon signs glow, headlights cut the dark, and police eyesight shrinks.
- **Three synth radio stations** (Sunset FM, Bay Lo-Fi, Chase 104), engine and siren sounds — all synthesised in code, no audio files.
- **HUD with minimap**, wanted stars, cash, style meter, mission timer, health, and a save in localStorage (jobs, cash, hidden neon packages).

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network: every file the game loads sits under `game/`.

## Controls

WASD / arrows — walk or drive · SHIFT — run · SPACE — handbrake drift · E — steal a car / step out · F — punch · J — take the next job · R — radio station · M — mute · P — pause

## Screenshots

![Title screen](screenshots/1-start.jpg)
![Driving through Neon Bay at golden hour](screenshots/2-drive.jpg)
![A three-star chase at night](screenshots/3-chase.jpg)
![Job complete](screenshots/4-complete.jpg)

## How it is built

Plain JavaScript ES modules on one canvas — no engine, no assets, no network. The source is split by job so each file does one thing: `city.js` builds Neon Bay, `vehicles.js` drives the cars, `pedestrians.js` walks the people and the foot police, `missions.js` runs the five jobs and the taxi fares, `player.js` holds Mara, her cash and her wanted level, `audio.js` synthesises every sound, `render.js` paints the world and the HUD, `shots.js` stages the screenshots with a driving autopilot, and `main.js` runs the loop.

---

<sub>Entered on [make.fun](https://make.fun/?ref=t7e39kme&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
