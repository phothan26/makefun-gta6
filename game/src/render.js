// MARSHLIGHT renderer: draws the marsh, the boats, the HUD and the
// minimap on a 2D canvas. Everything is drawn in code — no images.
// Terrain is drawn from the same polylines world.js uses, so what you
// see is exactly what the simulation collides with.
import { terrainAt, tideAt, inReeds, MAP_W, MAP_H } from './world.js';
import { timeOfDay, currentJob, objectiveText } from './sim.js';

const WATER = '#14503c';
const WATER_DEEP = '#0e3a2b';
const MUD = '#6b4a2f';
const ROAD = '#b99b6b';
const REED = '#3f7a3a';
const LAND = '#2c4632';
const GOLD = '#e0a92e';
const RUST = '#b4552d';
const BONE = '#e8ddc4';

const MAIN_CH = [
  [300, -40], [340, 300], [280, 600], [360, 900],
  [320, 1200], [420, 1500], [380, 1840],
];
const SIDE_A = [[340, 300], [700, 260], [1100, 320], [1500, 280]];
const SIDE_B = [[360, 900], [800, 950], [1300, 900], [1700, 950]];
const SOUTH_CH = [[400, 1500], [900, 1600], [1500, 1650], [2000, 1600]];
const REEDS = [
  [470, 450, 120, 80], [700, 700, 140, 90], [250, 1100, 110, 90],
  [600, 1400, 150, 90], [1000, 600, 120, 80], [1400, 1300, 140, 90],
  [1800, 500, 120, 80], [900, 1620, 130, 80],
];

function strokePolyline(ctx, pts, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

function drawTerrain(ctx, s, cam) {
  ctx.fillStyle = LAND;
  ctx.fillRect(cam.x, cam.y, cam.w, cam.h);
  // Water channels.
  strokePolyline(ctx, MAIN_CH, 150, WATER);
  strokePolyline(ctx, SOUTH_CH, 110, WATER);
  const tide = tideAt(s.tick);
  strokePolyline(ctx, SIDE_A, 100, tide > 0 ? WATER : MUD);
  strokePolyline(ctx, SIDE_B, 100, tide > 0 ? WATER : MUD);
  // Roads (bridges cross the water).
  ctx.fillStyle = ROAD;
  ctx.fillRect(250, 150, 1850, 70);
  ctx.fillRect(2000, 150, 90, 1550);
  ctx.fillRect(400, 1620, 1690, 70);
  ctx.strokeStyle = '#8a6f45';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(250, 185); ctx.lineTo(2100, 185);
  ctx.moveTo(2045, 150); ctx.lineTo(2045, 1700);
  ctx.moveTo(400, 1655); ctx.lineTo(2090, 1655);
  ctx.stroke();
  ctx.setLineDash([]);
  // Reed beds.
  for (const [x, y, rx, ry] of REEDS) {
    ctx.fillStyle = REED;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5da244';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const px = x + Math.cos(a) * rx * 0.7, py = y + Math.sin(a) * ry * 0.7;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 16); ctx.stroke();
    }
  }
  // Animated water shimmer (from the tick, so screenshots are stable).
  ctx.strokeStyle = 'rgba(232, 221, 196, 0.10)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const wx = 200 + ((i * 173 + s.tick * 0.4) % 2000);
    const wy = 150 + ((i * 311) % 1500);
    if (terrainAt(wx, wy, s.tick) !== 'water') continue;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.quadraticCurveTo(wx + 18, wy - 5, wx + 36, wy);
    ctx.stroke();
  }
  // Cypress trees.
  for (const t of s.world.trees) {
    ctx.fillStyle = '#1e3d24';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f6b35';
    ctx.beginPath(); ctx.arc(t.x - 4, t.y - 4, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(t.x - 2, t.y + t.r * 0.5, 4, 8);
  }
  // Docks and buildings.
  drawDock(ctx, 330, 290, 'Beau\u2019s Bait Shop');
  drawDock(ctx, 420, 900, 'Stilt House');
  drawDock(ctx, 2000, 1600, 'Far Dock');
  drawDock(ctx, 400, 1750, 'South Dock');
  // Bait shop hut.
  ctx.fillStyle = RUST;
  ctx.fillRect(268, 168, 64, 44);
  ctx.fillStyle = '#7a3a1e';
  ctx.beginPath(); ctx.moveTo(260, 170); ctx.lineTo(300, 140); ctx.lineTo(340, 170); ctx.closePath(); ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('BAIT', 282, 196);
  // Stilt house.
  ctx.fillStyle = '#8a6f45';
  ctx.fillRect(430, 872, 56, 40);
  ctx.fillStyle = '#5d4a2c';
  ctx.fillRect(436, 912, 6, 18); ctx.fillRect(474, 912, 6, 18);
  // Supply caches (unfound only).
  for (const c of s.world.caches) {
    if (c.found) continue;
    ctx.fillStyle = GOLD;
    ctx.fillRect(c.x - 8, c.y - 8, 16, 16);
    ctx.strokeStyle = '#7a5a10';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x - 8, c.y - 8, 16, 16);
    ctx.beginPath(); ctx.moveTo(c.x - 8, c.y); ctx.lineTo(c.x + 8, c.y); ctx.stroke();
  }
  // Gators.
  for (const g of s.world.gators) {
    ctx.fillStyle = '#223d1e';
    ctx.beginPath(); ctx.ellipse(g.x, g.y, 22, 9, Math.sin(g.phase) * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8ddc4';
    ctx.beginPath(); ctx.arc(g.x + 14, g.y - 4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(g.x + 14, g.y + 4, 2.5, 0, Math.PI * 2); ctx.fill();
  }
}

function drawDock(ctx, x, y, label) {
  ctx.fillStyle = '#8a6f45';
  ctx.fillRect(x - 34, y - 10, 68, 20);
  ctx.strokeStyle = '#5d4a2c';
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(x + i * 13, y - 10); ctx.lineTo(x + i * 13, y + 10); ctx.stroke();
  }
  ctx.fillStyle = BONE;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y - 18);
  ctx.textAlign = 'left';
}

function drawVehicle(ctx, x, y, heading, kind) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  if (kind === 'airboat') {
    ctx.fillStyle = '#c8ccd0';
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = RUST;
    ctx.fillRect(-24, -8, 14, 16);
    ctx.fillStyle = '#3a3f45';
    ctx.beginPath(); ctx.arc(-26, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-26, -10); ctx.lineTo(-26, 10); ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.fillRect(8, -4, 8, 8);
  } else {
    ctx.fillStyle = '#7a2e2e';
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(-12, -8, 8, 4); ctx.fillRect(-12, 4, 8, 4);
    ctx.fillRect(6, -8, 8, 4); ctx.fillRect(6, 4, 8, 4);
  }
  ctx.restore();
}

function drawPlayer(ctx, s) {
  const p = s.player;
  if (p.mode === 'foot') {
    ctx.fillStyle = '#e8ddc4';
    ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = RUST;
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
  }
  if (s.hasClient) {
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CLIENT ABOARD', p.x, p.y - 34);
    ctx.textAlign = 'left';
  }
}

function drawPolice(ctx, s) {
  for (const b of s.boats) {
    drawVehicle(ctx, b.x, b.y, b.heading, 'airboat');
    ctx.fillStyle = '#2456c8';
    ctx.fillRect(b.x - 8, b.y - 14, 16, 5);
    if (b.mode === 'chase') {
      ctx.fillStyle = Math.floor(s.tick / 15) % 2 === 0 ? '#ff3b30' : '#3b82ff';
      ctx.beginPath(); ctx.arc(b.x, b.y - 18, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const c of s.cars) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.heading);
    ctx.fillStyle = '#1c2733';
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8ddc4';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, 3);
    ctx.textAlign = 'left';
    ctx.restore();
  }
  if (s.heli.active) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(s.heli.x + 24, s.heli.y + 30, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(s.heli.x, s.heli.y);
    ctx.rotate(s.tick * 0.3);
    ctx.fillStyle = '#3a3f45';
    ctx.fillRect(-26, -2, 52, 4);
    ctx.restore();
    ctx.fillStyle = '#5a6270';
    ctx.beginPath(); ctx.ellipse(s.heli.x, s.heli.y, 14, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 244, 180, 0.18)';
    ctx.beginPath(); ctx.moveTo(s.heli.x - 8, s.heli.y + 8); ctx.lineTo(s.heli.x + 8, s.heli.y + 8);
    ctx.lineTo(s.player.x + 20, s.player.y); ctx.lineTo(s.player.x - 20, s.player.y);
    ctx.closePath(); ctx.fill();
  }
}

function drawHUD(ctx, s, w, h, radio, muted) {
  const tod = timeOfDay(s);
  ctx.fillStyle = 'rgba(10, 20, 14, 0.72)';
  ctx.fillRect(12, 12, 300, 86);
  // Wanted stars.
  ctx.font = '22px sans-serif';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < s.wanted ? '★' : '☆';
  ctx.fillStyle = s.wanted > 0 ? '#ffcf3d' : '#8a9a8e';
  ctx.fillText(stars, 22, 40);
  // Health bar.
  ctx.fillStyle = '#222';
  ctx.fillRect(22, 50, 140, 12);
  ctx.fillStyle = s.health > 40 ? '#4caf50' : '#ff3b30';
  ctx.fillRect(22, 50, 140 * Math.max(0, s.health) / 100, 12);
  ctx.fillStyle = BONE;
  ctx.font = '13px sans-serif';
  ctx.fillText(`$${s.cash}`, 22, 82);
  ctx.fillText(`Style ${Math.round(s.style)}`, 110, 82);
  ctx.fillText(`Caches ${s.report.cachesFound}/12`, 200, 82);
  // Time, tide, radio.
  ctx.fillStyle = 'rgba(10, 20, 14, 0.72)';
  ctx.fillRect(w - 252, 12, 240, 86);
  ctx.fillStyle = BONE;
  ctx.font = '15px sans-serif';
  ctx.fillText(`${tod.label}  ·  ${tod.hour < 12 ? 'morning' : tod.hour < 17 ? 'day' : 'dusk'}`, w - 240, 38);
  ctx.fillText(`Tide ${tideAt(s.tick) > 0 ? 'HIGH ▲' : 'low ▼'}`, w - 240, 60);
  ctx.fillText(`${muted ? '🔇 muted' : '♪ ' + radio}`, w - 240, 82);
  // Objective.
  const job = currentJob(s);
  ctx.fillStyle = 'rgba(10, 20, 14, 0.72)';
  ctx.fillRect(12, h - 64, 560, 52);
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(job ? `JOB ${job.id}/5 · ${job.name}` : 'STORY COMPLETE', 22, h - 42);
  ctx.fillStyle = BONE;
  ctx.font = '13px sans-serif';
  ctx.fillText(objectiveText(s), 22, h - 22);
  if (s.carrying) {
    ctx.fillStyle = '#ff9d5c';
    ctx.fillText('CARRYING CONTRABAND — stay out of sight', 340, h - 22);
  }
}

function drawMinimap(ctx, s, w, h) {
  const mw = 220, mh = 165, mx = w - mw - 12, my = h - mh - 12;
  const kx = mw / MAP_W, ky = mh / MAP_H;
  ctx.fillStyle = 'rgba(10, 20, 14, 0.8)';
  ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
  ctx.fillStyle = '#0e3a2b';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = '#14503c';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(mx + 300 * kx, my); ctx.lineTo(mx + 340 * kx, my + 300 * ky);
  ctx.lineTo(mx + 280 * kx, my + 600 * ky); ctx.lineTo(mx + 360 * kx, my + 900 * ky);
  ctx.lineTo(mx + 320 * kx, my + 1200 * ky); ctx.lineTo(mx + 420 * kx, my + 1500 * ky);
  ctx.lineTo(mx + 380 * kx, my + 1800 * ky);
  ctx.stroke();
  ctx.strokeStyle = '#b99b6b';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(mx + 250 * kx, my + 185 * ky); ctx.lineTo(mx + 2100 * kx, my + 185 * ky); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mx + 2045 * kx, my + 150 * ky); ctx.lineTo(mx + 2045 * kx, my + 1700 * ky); ctx.stroke();
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(mx + x * kx, my + y * ky, r, 0, Math.PI * 2); ctx.fill();
  };
  for (const c of s.world.caches) if (!c.found) dot(c.x, c.y, GOLD, 2.5);
  for (const g of s.world.gators) dot(g.x, g.y, '#7cff6b', 2.5);
  for (const b of s.boats) dot(b.x, b.y, '#3b82ff', 3);
  const job = currentJob(s);
  if (job) {
    const t = { baitShop: [330, 290], stiltHouse: [420, 900], farDock: [2000, 1600], southDock: [400, 1750], gatorWest: [750, 940], gatorEast: [1350, 930], crateA1: [700, 280], crateA2: [1200, 300], crateB1: [1000, 930] };
    const cur = job.steps[s.stepIndex];
    if (cur && cur.at && t[cur.at]) {
      const [tx, ty] = t[cur.at];
      ctx.fillStyle = Math.floor(s.tick / 20) % 2 === 0 ? '#ffcf3d' : '#ff3b30';
      ctx.beginPath(); ctx.arc(mx + tx * kx, my + ty * ky, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  dot(s.player.x, s.player.y, '#ffffff', 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx - 4, my - 4, mw + 8, mh + 8);
}

export function renderGame(ctx, s, w, h, ui) {
  const p = s.player;
  const cam = {
    x: Math.max(0, Math.min(MAP_W - w, p.x - w / 2)),
    y: Math.max(0, Math.min(MAP_H - h, p.y - h / 2)),
    w, h,
  };
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawTerrain(ctx, s, cam);
  drawVehicle(ctx, s.car.x, s.car.y, s.car.heading, 'car');
  drawVehicle(ctx, s.airboat.x, s.airboat.y, s.airboat.heading, 'airboat');
  drawPlayer(ctx, s);
  drawPolice(ctx, s);
  ctx.restore();
  // Time-of-day tint.
  const tod = timeOfDay(s);
  const daylight = Math.sin((Math.PI * (tod.hour * 60 + tod.minute - 360)) / 720);
  if (daylight < 0.45) {
    ctx.fillStyle = `rgba(255, 150, 40, ${0.10 * (1 - daylight / 0.45)})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (ui.mode === 'title') drawTitle(ctx, s, w, h);
  else if (ui.mode === 'paused') drawPaused(ctx, w, h);
  else if (ui.mode === 'complete') drawComplete(ctx, s, w, h);
  else {
    drawHUD(ctx, s, w, h, ui.radio, ui.muted);
    drawMinimap(ctx, s, w, h);
    if (ui.toast && s.tick - ui.toast.tick < 240) {
      ctx.fillStyle = 'rgba(10, 20, 14, 0.85)';
      ctx.fillRect(w / 2 - 260, 110, 520, 44);
      ctx.fillStyle = GOLD;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ui.toast.text, w / 2, 138);
      ctx.textAlign = 'left';
    }
  }
}

function drawTitle(ctx, s, w, h) {
  ctx.fillStyle = 'rgba(8, 18, 12, 0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MARSHLIGHT', w / 2, h / 2 - 110);
  ctx.fillStyle = BONE;
  ctx.font = '24px sans-serif';
  ctx.fillText('Gator Country Run', w / 2, h / 2 - 70);
  ctx.font = '16px sans-serif';
  ctx.fillText('Willa "Marsh" Okafor runs the Leonida wetlands for Beau Toussaint.', w / 2, h / 2 - 30);
  ctx.fillText('Airboat, mud, gators, and the law — five jobs from dawn to dusk.', w / 2, h / 2 - 4);
  ctx.fillStyle = '#9fb3a4';
  ctx.font = '14px sans-serif';
  ctx.fillText('WASD / arrows — drive · E — enter / leave a vehicle · 1/2/3 — radio · M — mute · B — autopilot · Esc — pause', w / 2, h / 2 + 40);
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('Press ENTER to start', w / 2, h / 2 + 90);
  ctx.textAlign = 'left';
}

function drawPaused(ctx, w, h) {
  ctx.fillStyle = 'rgba(8, 18, 12, 0.7)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = BONE;
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', w / 2, h / 2);
  ctx.font = '16px sans-serif';
  ctx.fillText('Press Esc to keep running the marsh', w / 2, h / 2 + 36);
  ctx.textAlign = 'left';
}

function drawComplete(ctx, s, w, h) {
  ctx.fillStyle = 'rgba(8, 18, 12, 0.86)';
  ctx.fillRect(0, 0, w, h);
  const r = s.report;
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THE LAST RUN IS DONE', w / 2, 120);
  ctx.fillStyle = BONE;
  ctx.font = '18px sans-serif';
  ctx.fillText(`Willa "Marsh" Okafor · ${r.cachesFound}/12 caches · $${r.cash} earned · style ${r.style}`, w / 2, 160);
  ctx.font = '15px sans-serif';
  let y = 210;
  for (const j of r.jobs) {
    ctx.fillText(`${j.name} — $${j.cash} — ${Math.round(j.ticks / 60)}s`, w / 2, y);
    y += 28;
  }
  ctx.fillStyle = '#9fb3a4';
  ctx.fillText('Press ENTER to run the marsh again', w / 2, y + 30);
  ctx.textAlign = 'left';
}
