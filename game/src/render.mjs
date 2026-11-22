// NEON RAIN — Midnight Courier: the renderer.
// Turns a game state into a flat list of draw commands (rects, polygons,
// lines, text). The browser executes them on a canvas; the screenshot tool
// executes the same list with a software rasterizer, so a screenshot is a
// true render of the game's own code.

import { hash01, clamp, dist } from './rng.mjs';
import { WORLD_W, WORLD_H, ROAD_XS, ROAD_YS } from './city.mjs';
import { objectiveOf, clockText, rainLabel, policeSightRange } from './sim.mjs';

const W = 1280;
const H = 720;

function rotRect(cx, cy, w, h, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const hw = w / 2;
  const hh = h / 2;
  return [
    [cx + (-hw * c - -hh * s), cy + (-hw * s + -hh * c)],
    [cx + (hw * c - -hh * s), cy + (hw * s + -hh * c)],
    [cx + (hw * c - hh * s), cy + (hw * s + hh * c)],
    [cx + (-hw * c - hh * s), cy + (-hw * s + hh * c)],
  ];
}

export function renderScene(state, opts = {}) {
  const mode = opts.mode ?? 'game';
  const cmds = [];
  const rect = (x, y, w, h, c, a = 1) => cmds.push({ o: 'rect', x, y, w, h, c, a });
  const ellipse = (x, y, rx, ry, c, a = 1) => cmds.push({ o: 'ellipse', x, y, rx, ry, c, a });
  const circle = (x, y, r, c, a = 1) => cmds.push({ o: 'circle', x, y, r, c, a });
  const poly = (pts, c, a = 1) => cmds.push({ o: 'poly', pts, c, a });
  const line = (x1, y1, x2, y2, c, a = 1, w = 1) => cmds.push({ o: 'line', x1, y1, x2, y2, c, a, w });
  const text = (x, y, s, c, t, al = 'left', b = false) => cmds.push({ o: 'text', x, y, s, c, t, al, b });

  const p = state.player;
  let camX;
  let camY;
  if (mode === 'title') {
    camX = 1200 + Math.cos(state.tick * 0.0006) * 320;
    camY = 900 + Math.sin(state.tick * 0.0006) * 190;
  } else {
    camX = clamp(p.x, W / 2, WORLD_W - W / 2);
    camY = clamp(p.y, H / 2, WORLD_H - H / 2);
  }
  const X = (wx) => wx - camX + W / 2;
  const Y = (wy) => wy - camY + H / 2;
  const vis = { x0: camX - W / 2 - 80, x1: camX + W / 2 + 80, y0: camY - H / 2 - 80, y1: camY + H / 2 + 80 };
  const inView = (x, y, m = 0) => x > vis.x0 - m && x < vis.x1 + m && y > vis.y0 - m && y < vis.y1 + m;

  // --- sky / wet asphalt ---
  rect(0, 0, W, H, '#070a16');
  rect(X(0), Y(0), WORLD_W, WORLD_H, '#0d1122');
  rect(X(0), Y(0), WORLD_W, WORLD_H, '#131a33', 0.35);

  // --- roads ---
  for (const x of ROAD_XS) {
    if (x < vis.x0 || x > vis.x1) continue;
    rect(X(x - 32), Y(0), 64, WORLD_H, '#181e33');
    line(X(x - 32), Y(0), X(x - 32), Y(WORLD_H), '#2a3352', 0.8, 2);
    line(X(x + 32), Y(0), X(x + 32), Y(WORLD_H), '#2a3352', 0.8, 2);
    for (let y = 60; y < WORLD_H; y += 92) {
      if (y < vis.y0 || y > vis.y1) continue;
      rect(X(x - 2), Y(y), 4, 44, '#8a7a3a', 0.55);
    }
  }
  for (const y of ROAD_YS) {
    if (y < vis.y0 || y > vis.y1) continue;
    rect(X(0), Y(y - 32), WORLD_W, 64, '#181e33');
    line(X(0), Y(y - 32), X(WORLD_W), Y(y - 32), '#2a3352', 0.8, 2);
    line(X(0), Y(y + 32), X(WORLD_W), Y(y + 32), '#2a3352', 0.8, 2);
    for (let x = 60; x < WORLD_W; x += 92) {
      if (x < vis.x0 || x > vis.x1) continue;
      rect(X(x), Y(y - 2), 44, 4, '#8a7a3a', 0.55);
    }
  }
  // Crosswalks at every intersection.
  for (const y of ROAD_YS) {
    for (const x of ROAD_XS) {
      if (!inView(x, y, 60)) continue;
      for (let k = -2; k <= 2; k++) {
        rect(X(x + k * 12 - 4), Y(y - 26), 8, 12, '#cfd6ea', 0.28);
        rect(X(x + k * 12 - 4), Y(y + 14), 8, 12, '#cfd6ea', 0.28);
      }
    }
  }

  // --- alleys (dark cuts through blocks) ---
  for (const a of state.city.alleys) {
    if (!inView(a.x + a.w / 2, a.y + a.h / 2, 60)) continue;
    rect(X(a.x), Y(a.y), a.w, a.h, '#05070d');
  }

  // --- puddles: rain mirrors the neon ---
  for (const pd of state.city.puddles) {
    if (!inView(pd.x, pd.y, 60)) continue;
    ellipse(X(pd.x), Y(pd.y), pd.rx, pd.ry, '#1b3a5e', 0.5);
    ellipse(X(pd.x), Y(pd.y), pd.rx * 0.7, pd.ry * 0.6, '#2a6ea8', 0.28);
    line(X(pd.x - pd.rx * 0.6), Y(pd.y), X(pd.x + pd.rx * 0.6), Y(pd.y), '#00e5ff', 0.3, 2);
  }

  // --- buildings: dark towers, neon edges, lit windows ---
  for (const b of state.city.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
    rect(X(b.x), Y(b.y), b.w, b.h, b.color);
    rect(X(b.x + 8), Y(b.y + 8), b.w - 16, b.h - 16, '#0a0e1d', 0.6);
    // Neon edge: bright on the two lit sides.
    line(X(b.x), Y(b.y), X(b.x + b.w), Y(b.y), b.neon, 0.9, 3);
    line(X(b.x), Y(b.y), X(b.x), Y(b.y + b.h), b.neon, 0.55, 2);
    const cols = Math.max(2, Math.floor(b.w / 34));
    const rows = Math.max(2, Math.floor(b.h / 30));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = b.x + 14 + c * ((b.w - 28) / cols);
        const wy = b.y + 14 + r * ((b.h - 28) / rows);
        const lit = hash01(b.x | 0, (b.y | 0) + r * 31 + c * 7) < 0.42;
        rect(X(wx), Y(wy), 13, 10, lit ? '#ffd166' : '#1c2742', lit ? 0.85 : 1);
      }
    }
  }

  // --- hidden packages ---
  for (const pkg of state.city.packages) {
    if (pkg.taken || !inView(pkg.x, pkg.y, 40)) continue;
    const pulse = 0.6 + 0.4 * Math.sin(state.tick * 0.08 + pkg.id);
    circle(X(pkg.x), Y(pkg.y), 12 + pulse * 3, '#ffe14d', 0.25);
    poly([
      [X(pkg.x), Y(pkg.y - 9)], [X(pkg.x + 8), Y(pkg.y)],
      [X(pkg.x), Y(pkg.y + 9)], [X(pkg.x - 8), Y(pkg.y)],
    ], '#ffe14d', 0.95);
  }

  // --- landmarks ---
  const obj = objectiveOf(state);
  for (const l of state.city.landmarks) {
    if (!inView(l.x, l.y, 90)) continue;
    const isObj = obj && ((obj.kind === 'pickup' && state.jobs[state.jobIndex]?.from === l.id) ||
      (obj.kind === 'deliver' && state.jobs[state.jobIndex]?.to === l.id));
    if (isObj) {
      // Objective beacon: a column of light and a pulsing ring.
      const pulse = 0.5 + 0.5 * Math.sin(state.tick * 0.1);
      poly([
        [X(l.x) - 16, Y(l.y)], [X(l.x) + 16, Y(l.y)],
        [X(l.x) + 5, Y(l.y) - 260], [X(l.x) - 5, Y(l.y) - 260],
      ], '#ffe14d', 0.16 + pulse * 0.1);
      circle(X(l.x), Y(l.y), 26 + pulse * 10, '#ffe14d', 0.35);
      circle(X(l.x), Y(l.y), 10, '#ffe14d');
      text(X(l.x), Y(l.y) - 44, 15, '#ffe14d', obj.kind === 'pickup' ? 'PICKUP' : 'DROP OFF', 'center', true);
    } else {
      circle(X(l.x), Y(l.y), 6, '#7ee0ff', 0.8);
    }
    text(X(l.x), Y(l.y) + 22, 12, '#9fb4d8', l.name, 'center');
  }

  // --- parked vehicles ---
  for (const v of state.vehicles) {
    if (!v.parked || !inView(v.x, v.y, 60)) continue;
    const col = v.kind === 'bike' ? '#39ff88' : '#5da8ff';
    poly(rotRect(X(v.x), Y(v.y), v.kind === 'bike' ? 26 : 40, v.kind === 'bike' ? 12 : 20, v.angle), col, 0.85);
    text(X(v.x), Y(v.y) - 22, 11, '#9fb4d8', v.kind === 'bike' ? 'BIKE' : 'CAR', 'center');
  }

  // --- pedestrians ---
  for (const ped of state.peds) {
    const px = ped.vertical ? ped.fixed : ped.pos;
    const py = ped.vertical ? ped.pos : ped.fixed;
    if (!inView(px, py, 20)) continue;
    circle(X(px), Y(py), 5, ped.hue, 0.9);
    circle(X(px), Y(py), 9, ped.hue, 0.2);
  }

  // --- traffic ---
  for (const t of state.traffic) {
    if (!inView(t.x, t.y, 80)) continue;
    const pts = rotRect(X(t.x), Y(t.y), 40, 20, t.angle);
    poly(pts, t.color);
    poly(rotRect(X(t.x), Y(t.y), 20, 16, t.angle), '#0a0e1d', 0.8);
    // Headlights and their beam.
    const fx = Math.cos(t.angle);
    const fy = Math.sin(t.angle);
    poly([
      [X(t.x) + fx * 20, Y(t.y) + fy * 20],
      [X(t.x) + fx * 150 - fy * 26, Y(t.y) + fy * 150 + fx * 26],
      [X(t.x) + fx * 150 + fy * 26, Y(t.y) + fy * 150 - fx * 26],
    ], '#ffe9a8', 0.13);
    circle(X(t.x) + fx * 21 - fy * 7, Y(t.y) + fy * 21 + fx * 7, 3, '#fff3c4');
    circle(X(t.x) + fx * 21 + fy * 7, Y(t.y) + fy * 21 - fx * 7, 3, '#fff3c4');
  }

  // --- police ---
  for (const c of state.police) {
    if (!inView(c.x, c.y, 90)) continue;
    poly(rotRect(X(c.x), Y(c.y), 42, 21, c.angle), '#1c2438');
    poly(rotRect(X(c.x), Y(c.y), 22, 17, c.angle), '#dfe6f5', 0.9);
    const flash = (state.tick >> 4) % 2 === 0;
    circle(X(c.x) - Math.sin(c.angle) * 6, Y(c.y) + Math.cos(c.angle) * 6, 5, flash ? '#ff2d2d' : '#2d7bff');
    circle(X(c.x) + Math.sin(c.angle) * 6, Y(c.y) - Math.cos(c.angle) * 6, 5, flash ? '#2d7bff' : '#ff2d2d');
    circle(X(c.x), Y(c.y), 26, flash ? '#ff2d2d' : '#2d7bff', 0.16);
  }

  // --- helicopter spotlight ---
  if (state.heli.active) {
    const h = state.heli;
    const sx = X(h.x);
    const sy = Y(h.y);
    poly([
      [sx - 26, sy], [sx + 26, sy],
      [X(p.x) + 34, Y(p.y) + 10], [X(p.x) - 34, Y(p.y) + 10],
    ], '#fff3c4', 0.13);
    ellipse(sx, sy, 26, 12, '#232c44');
    line(sx - 34, sy, sx + 34, sy, '#9fb4d8', 0.9, 2);
    circle(sx, sy, 4, '#ff2d2d');
  }

  // --- the player ---
  const slipGlow = p.slipActive > 0;
  ellipse(X(p.x), Y(p.y), 26, 14, slipGlow ? '#00e5ff' : '#ff2d78', slipGlow ? 0.4 : 0.22);
  if (p.mode === 'foot') {
    circle(X(p.x), Y(p.y), 11, '#ffe14d');
    circle(X(p.x), Y(p.y), 16, '#ffe14d', 0.25);
    line(X(p.x), Y(p.y), X(p.x) + Math.cos(p.angle) * 18, Y(p.y) + Math.sin(p.angle) * 18, '#ffe14d', 1, 3);
  } else {
    const isBike = p.mode === 'bike';
    poly(rotRect(X(p.x), Y(p.y), isBike ? 34 : 46, isBike ? 14 : 22, p.angle), isBike ? '#39ff88' : '#ff2d78');
    poly(rotRect(X(p.x), Y(p.y), isBike ? 16 : 22, isBike ? 10 : 17, p.angle), '#0a0e1d', 0.85);
    const fx = Math.cos(p.angle);
    const fy = Math.sin(p.angle);
    poly([
      [X(p.x) + fx * 23, Y(p.y) + fy * 23],
      [X(p.x) + fx * 170 - fy * 30, Y(p.y) + fy * 170 + fx * 30],
      [X(p.x) + fx * 170 + fy * 30, Y(p.y) + fy * 170 - fx * 30],
    ], '#ffe9a8', 0.16);
    circle(X(p.x) + fx * 24 - fy * 8, Y(p.y) + fy * 24 + fx * 8, 3.5, '#fff3c4');
    circle(X(p.x) + fx * 24 + fy * 8, Y(p.y) + fy * 24 - fx * 8, 3.5, '#fff3c4');
    if (slipGlow) {
      poly([
        [X(p.x) - fx * 20, Y(p.y) - fy * 20],
        [X(p.x) - fx * 90 - fy * 12, Y(p.y) - fy * 90 + fx * 12],
        [X(p.x) - fx * 90 + fy * 12, Y(p.y) - fy * 90 - fx * 12],
      ], '#00e5ff', 0.35);
    }
  }

  // --- rain: streaks seeded by the tick, heavier when the storm peaks ---
  const streaks = Math.floor(40 + state.rain * 90);
  const block = state.tick >> 2;
  for (let i = 0; i < streaks; i++) {
    const rx = hash01(i, block) * W;
    const ry = hash01(i, block + 501) * H;
    const len = 10 + state.rain * 18 + hash01(i, block + 9) * 8;
    line(rx, ry, rx - len * 0.22, ry + len, '#7fb2ff', 0.16 + state.rain * 0.22, 1);
  }
  for (let i = 0; i < Math.floor(state.rain * 14); i++) {
    const sx = hash01(i, block + 77) * W;
    const sy = hash01(i, block + 78) * H;
    circle(sx, sy, 2 + hash01(i, block + 79) * 3, '#7fb2ff', 0.25);
  }

  // --- HUD ---
  // Top-left: money and the active job.
  rect(16, 14, 330, 86, '#05070d', 0.72);
  text(28, 40, 15, '#9fb4d8', 'JUNO REYES  ·  MIDNIGHT COURIER', 'left', true);
  text(28, 68, 26, '#ffe14d', `$${state.money}`, 'left', true);
  if (obj) {
    const label = obj.kind === 'pickup'
      ? `JOB ${state.jobIndex + 1}/5 · PICK UP @ ${obj.name}`
      : `JOB ${state.jobIndex + 1}/5 · DELIVER @ ${obj.name}`;
    text(28, 90, 14, '#e8eefc', label, 'left', true);
  } else {
    text(28, 90, 14, '#39ff88', 'NIGHT COMPLETE · ALL 5 JOBS DONE', 'left', true);
  }
  // Job timer bar.
  if (obj && obj.kind === 'deliver' && obj.job.limit > 0) {
    const frac = clamp(obj.timeLeft / obj.job.limit, 0, 1);
    rect(28, 100, 200, 6, '#1c2742');
    rect(28, 100, 200 * frac, 6, frac > 0.3 ? '#39ff88' : '#ff2d2d');
    const secs = Math.ceil(obj.timeLeft / 60);
    text(236, 108, 12, '#9fb4d8', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 'left');
  }
  // Top-right: wanted, clock, rain.
  rect(W - 246, 14, 230, 108, '#05070d', 0.72);
  text(W - 234, 38, 13, '#9fb4d8', 'WANTED', 'left', true);
  for (let i = 0; i < 5; i++) {
    circle(W - 210 + i * 26, 58, 8, i < p.wanted ? '#ff2d2d' : '#1c2742', i < p.wanted ? 1 : 1);
    if (i >= p.wanted) circle(W - 210 + i * 26, 58, 8, '#2a3352', 0.6);
  }
  text(W - 28, 40, 15, '#e8eefc', clockText(state), 'right', true);
  text(W - 28, 84, 13, '#7fb2ff', `RAIN: ${rainLabel(state.rain)}`, 'right', true);
  rect(W - 228, 92, 200, 6, '#1c2742');
  rect(W - 228, 92, 200 * state.rain, 6, '#00a8cc');
  text(W - 28, 112, 12, '#9fb4d8', `SIGHT ${Math.round(policeSightRange(state.rain))}m`, 'right');

  // Bottom-left: slipstream meter.
  rect(16, H - 64, 260, 48, '#05070d', 0.72);
  text(28, H - 44, 13, '#9fb4d8', 'SLIPSTREAM', 'left', true);
  rect(28, H - 34, 200, 10, '#1c2742');
  rect(28, H - 34, 200 * (p.slip / 100), 10, p.slipActive > 0 ? '#00e5ff' : '#00a8cc');
  if (p.slipActive > 0) text(28, H - 14, 13, '#00e5ff', 'GHOSTED — POLICE LOST YOU', 'left', true);
  else if (p.slip >= 99) text(28, H - 14, 13, '#00e5ff', 'READY — PRESS SPACE', 'left', true);
  else text(28, H - 14, 12, '#5a6a8a', 'Tuck behind traffic to charge', 'left');

  // Bottom-right: minimap.
  const mw = 230;
  const mh = 170;
  const mx = W - mw - 16;
  const my = H - mh - 16;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  rect(mx, my, mw, mh, '#05070d', 0.78);
  for (const x of ROAD_XS) line(mx + x * sx, my, mx + x * sx, my + mh, '#2a3352', 0.9, 1);
  for (const y of ROAD_YS) line(mx, my + y * sy, mx + mw, my + y * sy, '#2a3352', 0.9, 1);
  for (const b of state.city.buildings) {
    rect(mx + b.x * sx, my + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy), '#1a2138');
  }
  for (const pkg of state.city.packages) {
    if (!pkg.taken) circle(mx + pkg.x * sx, my + pkg.y * sy, 2, '#ffe14d');
  }
  if (obj) {
    circle(mx + obj.x * sx, my + obj.y * sy, 5, '#ffe14d');
    circle(mx + obj.x * sx, my + obj.y * sy, 9, '#ffe14d', 0.4);
  }
  for (const t of state.traffic) circle(mx + t.x * sx, my + t.y * sy, 2, '#8a97b5');
  for (const c of state.police) circle(mx + c.x * sx, my + c.y * sy, 3, '#ff2d2d');
  // Player arrow.
  const px = mx + p.x * sx;
  const py = my + p.y * sy;
  poly([
    [px + Math.cos(p.angle) * 9, py + Math.sin(p.angle) * 9],
    [px + Math.cos(p.angle + 2.5) * 7, py + Math.sin(p.angle + 2.5) * 7],
    [px + Math.cos(p.angle - 2.5) * 7, py + Math.sin(p.angle - 2.5) * 7],
  ], '#ffffff');
  text(mx + 8, my + 14, 11, '#9fb4d8', 'NEON CITY', 'left', true);

  // Bottom-centre: controls.
  text(W / 2, H - 18, 12, '#5a6a8a', 'WASD drive · E enter / exit vehicle · SPACE slipstream · 1/2/3 radio · M mute', 'center');

  // --- overlays ---
  if (mode === 'title') {
    rect(0, 0, W, H, '#05070d', 0.42);
    text(W / 2, 250, 92, '#ff2d78', 'NEON RAIN', 'center', true);
    text(W / 2, 310, 34, '#00e5ff', 'M I D N I G H T   C O U R I E R', 'center', true);
    text(W / 2, 360, 18, '#e8eefc', 'Juno Reyes runs packages through a city that never stops raining.', 'center');
    text(W / 2, 392, 18, '#e8eefc', 'Five jobs. Twelve hidden packages. The police never sleep.', 'center');
    text(W / 2, 470, 20, '#ffe14d', 'PRESS ENTER TO START THE NIGHT', 'center', true);
    text(W / 2, 510, 14, '#9fb4d8', 'On foot, by car, or by bike — steal what you need, slipstream the traffic,', 'center');
    text(W / 2, 532, 14, '#9fb4d8', 'and vanish from the radar when the rain gets heavy.', 'center');
  }
  if (mode === 'complete' || state.status === 'complete') {
    rect(0, 0, W, H, '#05070d', 0.42);
    rect(W / 2 - 330, 170, 660, 300, '#0a0e1d', 0.92);
    line(W / 2 - 330, 170, W / 2 + 330, 170, '#39ff88', 1, 3);
    text(W / 2, 240, 48, '#39ff88', 'NIGHT COMPLETE', 'center', true);
    text(W / 2, 290, 18, '#e8eefc', 'All five jobs delivered. Mara Voss pays in full.', 'center');
    text(W / 2, 340, 20, '#ffe14d', `EARNED  $${state.money}`, 'center', true);
    text(W / 2, 376, 16, '#9fb4d8', `Packages found  ${state.packagesTaken} / 12   ·   Distance  ${Math.round(state.distance / 100) / 10} km`, 'center');
    text(W / 2, 404, 16, '#9fb4d8', `Time  ${clockText(state)}   ·   Crashes  ${state.crashes}`, 'center');
    text(W / 2, 448, 15, '#e8eefc', 'PRESS ENTER TO DRIVE ANOTHER NIGHT', 'center', true);
  }
  if (slipGlow) {
    text(W / 2, 130, 22, '#00e5ff', 'SLIPSTREAM', 'center', true);
  }
  return cmds;
}
