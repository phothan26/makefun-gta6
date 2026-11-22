// Canvas rendering for Vice Harbor. Draws the world top-down, the
// entities, the HUD and the minimap. Everything is drawn from the game
// state and game.time only, so a given state always paints the same
// frame — the screenshots depend on that.
import { WORLD, ROADS, COLORS } from './config.js';
import { isWater, inFog } from './city.js';
import { currentStep } from './missions.js';
import { sightRadius } from './world.js';

const VIEW_W = 1280;
const VIEW_H = 720;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexLerp(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16);
  const b = parseInt(c2.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

function drawVehicle(ctx, x, y, angle, color, kind, label) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (kind === 'boat') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-6, -6, 14, 12);
    ctx.fillStyle = '#222';
    ctx.fillRect(22, -2, 6, 4);
  } else {
    ctx.fillStyle = '#111';
    ctx.fillRect(-20, -11, 40, 22);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-19, -10, 38, 20, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.85)';
    ctx.fillRect(6, -8, 8, 16);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(17, -8, 2, 4);
    ctx.fillRect(17, 4, 2, 4);
  }
  ctx.restore();
  if (label) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - 24);
  }
}

export function render(ctx, game, view) {
  const vw = view.w || VIEW_W;
  const vh = view.h || VIEW_H;
  const dark = game.dayT;
  const p = game.player;

  // Camera follows the player, clamped to the world.
  const camX = Math.max(vw / 2, Math.min(WORLD.w - vw / 2, p.x));
  const camY = Math.max(vh / 2, Math.min(WORLD.h - vh / 2, p.y));
  const ox = camX - vw / 2;
  const oy = camY - vh / 2;

  // Sky-tinted backdrop: golden hour warming into night blue.
  ctx.fillStyle = hexLerp('#f7b267', '#0b1026', dark);
  ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(-ox, -oy);

  // Water with a slow deterministic shimmer.
  ctx.fillStyle = hexLerp(COLORS.waterShallow, COLORS.waterDeep, dark);
  ctx.fillRect(WORLD.waterX, 0, WORLD.w - WORLD.waterX, WORLD.h);
  ctx.fillRect(WORLD.bayX, WORLD.bayY, WORLD.w - WORLD.bayX, WORLD.h - WORLD.bayY);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const wy = ((i * 173 + game.time * 12) % WORLD.h);
    ctx.beginPath();
    ctx.moveTo(WORLD.waterX + 20, wy);
    ctx.lineTo(WORLD.w - 60, wy + 30);
    ctx.stroke();
  }

  // Land.
  ctx.fillStyle = hexLerp(COLORS.land, '#17171d', dark);
  ctx.fillRect(0, 0, WORLD.waterX, WORLD.h);
  ctx.fillRect(0, 0, WORLD.bayX, WORLD.bayY);

  // Roads.
  ctx.fillStyle = hexLerp(COLORS.road, '#232329', dark);
  for (const ry of ROADS.h) ctx.fillRect(0, ry - ROADS.width / 2, WORLD.waterX, ROADS.width);
  for (const rx of ROADS.v) ctx.fillRect(rx - ROADS.width / 2, 0, ROADS.width, WORLD.bayY);
  // Lane dashes.
  ctx.strokeStyle = COLORS.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  for (const ry of ROADS.h) {
    ctx.beginPath();
    ctx.moveTo(0, ry);
    ctx.lineTo(WORLD.waterX, ry);
    ctx.stroke();
  }
  for (const rx of ROADS.v) {
    ctx.beginPath();
    ctx.moveTo(rx, 0);
    ctx.lineTo(rx, WORLD.bayY);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Docks.
  for (const d of game.city.docks) {
    ctx.fillStyle = hexLerp(COLORS.dock, '#4a3820', dark);
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.strokeStyle = COLORS.dockEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(d.name, d.x + 6, d.y + 16);
  }

  // Safehouse zone.
  ctx.strokeStyle = '#7dff8a';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(350, 350, 130, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#7dff8a';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SAFEHOUSE', 350, 350);

  // Buildings.
  for (const b of game.city.buildings) {
    ctx.fillStyle = hexLerp(COLORS.buildingRoof, '#2c2838', dark);
    ctx.fillRect(b[0], b[1], b[2], b[3]);
    ctx.strokeStyle = '#191622';
    ctx.lineWidth = 2;
    ctx.strokeRect(b[0], b[1], b[2], b[3]);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(b[0] + 8, b[1] + 8, b[2] - 16, 10);
  }

  // Ramps.
  for (const r of game.city.ramps) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate((r.a * Math.PI) / 180);
    ctx.fillStyle = COLORS.ramp;
    ctx.beginPath();
    ctx.moveTo(-24, 14);
    ctx.lineTo(0, -18);
    ctx.lineTo(24, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Crates.
  for (const c of game.city.crates) {
    if (c.taken) continue;
    ctx.fillStyle = COLORS.crate;
    ctx.fillRect(c.x - 11, c.y - 11, 22, 22);
    ctx.strokeStyle = '#7a5a00';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x - 11, c.y - 11, 22, 22);
    ctx.beginPath();
    ctx.moveTo(c.x - 11, c.y - 11);
    ctx.lineTo(c.x + 11, c.y + 11);
    ctx.moveTo(c.x + 11, c.y - 11);
    ctx.lineTo(c.x - 11, c.y + 11);
    ctx.stroke();
  }

  // Current objective marker.
  const s = currentStep(game);
  if (s && s.x !== undefined && s.y !== undefined && s.type !== 'enter') {
    const pulse = 1 + Math.sin(game.time * 4) * 0.12;
    ctx.strokeStyle = COLORS.waypoint;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.waypoint;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Parked vehicles.
  for (const v of game.city.cars) {
    if (v.taken) continue;
    drawVehicle(ctx, v.x, v.y, v.angle, v.color, 'car');
  }
  for (const v of game.city.boats) {
    if (v.taken) continue;
    drawVehicle(ctx, v.x, v.y, v.angle, v.color, 'boat');
  }

  // Police.
  for (const u of game.police) {
    drawVehicle(ctx, u.x, u.y, u.angle, COLORS.police, u.kind);
    const blink = Math.floor(game.time * 4) % 2 === 0;
    ctx.fillStyle = blink ? '#ff3b30' : '#3b82ff';
    ctx.beginPath();
    ctx.arc(u.x, u.y - 14, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,59,48,0.35)';
    ctx.beginPath();
    ctx.arc(u.x, u.y, sightRadius(game) * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Player.
  const pv = p.vehicle;
  if (pv) {
    drawVehicle(ctx, p.x, p.y, p.angle, pv.color, pv.kind);
    if (p.airborne > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 18, 26, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = game.ghost ? 'rgba(255,209,102,0.45)' : COLORS.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a4d00';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22);
    ctx.stroke();
  }
  if (game.ghost) {
    ctx.strokeStyle = 'rgba(125,255,138,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 22 + Math.sin(game.time * 6) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Fog banks (drawn over the world, translucent).
  for (const f of game.city.fog) {
    ctx.fillStyle = COLORS.fog;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, f.rx, f.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FOG — GHOST MODE', f.x, f.y);
  }

  ctx.restore();

  // Night darkens the whole frame; streetlights glow back.
  if (dark > 0.05) {
    ctx.fillStyle = 'rgba(6,8,24,' + (dark * 0.42).toFixed(3) + ')';
    ctx.fillRect(0, 0, vw, vh);
    for (const ry of ROADS.h) {
      for (const rx of ROADS.v) {
        const sx = rx - ox;
        const sy = ry - oy;
        if (sx < -40 || sy < -40 || sx > vw + 40 || sy > vh + 40) continue;
        const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 60);
        g.addColorStop(0, 'rgba(255,210,120,' + (0.25 * dark).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,210,120,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - 60, sy - 60, 120, 120);
      }
    }
  }

  drawHud(ctx, game, vw, vh);
  drawMinimap(ctx, game, vw, vh, ox, oy);
}

function bar(ctx, x, y, w, h, frac, fill, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  if (label) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + w + 8, y + h - 2);
  }
}

function drawHud(ctx, game, vw, vh) {
  ctx.textAlign = 'left';
  // Wanted stars.
  ctx.font = 'bold 26px sans-serif';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < game.wanted ? '★' : '☆';
  ctx.fillStyle = game.wanted > 0 ? '#ff3b30' : '#fff';
  ctx.fillText(stars, 16, 36);
  bar(ctx, 16, 48, 150, 10, game.heat / 100, '#ff7a1a', 'HEAT');
  bar(ctx, 16, 64, 150, 10, game.style / 100, '#7dff8a', 'STYLE');
  if (game.ghost) {
    ctx.fillStyle = '#7dff8a';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('GHOST MODE', 16, 96);
  }

  // Clock + money, top right.
  const hour = 17 + Math.floor(game.dayT * 3.5);
  const min = Math.floor((game.dayT * 3.5 % 1) * 60);
  const clock = (hour < 10 ? '0' : '') + hour + ':' + (min < 10 ? '0' : '') + min;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('$' + game.money, vw - 16, 32);
  ctx.font = '16px sans-serif';
  ctx.fillText(clock + (game.dayT > 0.7 ? ' — NIGHT' : ' — GOLDEN HOUR'), vw - 16, 56);
  ctx.textAlign = 'left';

  // Job tracker, bottom left.
  const job = game.jobs[game.jobIndex];
  const s = currentStep(game);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(12, vh - 96, 420, 84);
  if (job && s) {
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(job.name + '  •  $' + job.reward, 22, vh - 72);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText(s.text, 22, vh - 50);
    const d = Math.hypot(game.player.x - s.x, game.player.y - s.y);
    if (s.type !== 'enter' && s.type !== 'hide') {
      ctx.fillStyle = '#bbb';
      ctx.fillText(Math.round(d) + 'm', 22, vh - 30);
    }
  } else {
    ctx.fillStyle = '#7dff8a';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('ALL JOBS COMPLETE — $' + game.money, 22, vh - 58);
  }
  ctx.fillStyle = '#bbb';
  ctx.font = '12px sans-serif';
  ctx.fillText('Crates ' + game.cratesGot + '/12   •   WASD drive/walk   •   E enter/exit   •   G ghost (in fog)   •   1/2/3 radio', 22, vh - 14);

  // Events feed.
  ctx.font = '13px sans-serif';
  let ey = 120;
  for (const e of game.events.slice(-4)) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = ctx.measureText(e.text).width + 16;
    ctx.fillRect(16, ey - 14, w, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(e.text, 24, ey);
    ey += 24;
  }

  // Banner.
  if (game.banner) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(vw / 2 - 260, vh / 2 - 60, 520, 90);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(game.banner.text, vw / 2, vh / 2 - 18);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.fillText(game.banner.sub, vw / 2, vh / 2 + 14);
    ctx.textAlign = 'left';
  }
}

function drawMinimap(ctx, game, vw, vh, ox, oy) {
  const mw = 200;
  const mh = 150;
  const mx = vw - mw - 16;
  const my = vh - mh - 16;
  const sx = mw / WORLD.w;
  const sy = mh / WORLD.h;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
  ctx.fillStyle = '#14506e';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = '#2a2a33';
  ctx.fillRect(mx, my, WORLD.waterX * sx, mh);
  ctx.fillRect(mx, my, WORLD.bayX * sx, WORLD.bayY * sy);
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 1;
  for (const ry of ROADS.h) {
    ctx.beginPath();
    ctx.moveTo(mx, my + ry * sy);
    ctx.lineTo(mx + WORLD.waterX * sx, my + ry * sy);
    ctx.stroke();
  }
  for (const rx of ROADS.v) {
    ctx.beginPath();
    ctx.moveTo(mx + rx * sx, my);
    ctx.lineTo(mx + rx * sx, my + WORLD.bayY * sy);
    ctx.stroke();
  }
  // Fog.
  ctx.fillStyle = 'rgba(200,210,225,0.5)';
  for (const f of game.city.fog) {
    ctx.beginPath();
    ctx.ellipse(mx + f.x * sx, my + f.y * sy, f.rx * sx, f.ry * sy, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Objective.
  const s = currentStep(game);
  if (s && s.x !== undefined) {
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath();
    ctx.arc(mx + s.x * sx, my + s.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police.
  ctx.fillStyle = '#ff3b30';
  for (const u of game.police) {
    ctx.fillRect(mx + u.x * sx - 2, my + u.y * sy - 2, 4, 4);
  }
  // Player.
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(mx + game.player.x * sx, my + game.player.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(mx + (game.player.x - 640) * sx, my + (game.player.y - 360) * sy, 1280 * sx, 720 * sy);
}
