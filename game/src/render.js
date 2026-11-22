// The renderer: one canvas, everything procedural. The city is drawn top-down with a
// camera that follows the player; the time of day tints the whole frame (golden hour
// slides into neon night), and the HUD, minimap and menus are drawn on top.
import { FIELD, FONT, PALETTE, TIME, WORLD } from './config.js';
import { JOBS } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BRIEF = 'brief';
export const SCREEN_COMPLETE = 'complete';
export const SCREEN_FAILED = 'failed';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_HOWTO = 'howto';

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}

function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * t)},${Math.round(ca[1] + (cb[1] - ca[1]) * t)},${Math.round(ca[2] + (cb[2] - ca[2]) * t)})`;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smooth(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Day cycle: 0 day, 1 deep night. The sun sets across every mission. */
export function nightFactor(dayT) {
  return smooth(TIME.sunsetStart, TIME.nightStart, dayT) * (1 - smooth(TIME.dawnStart, 0.98, dayT));
}

function dayLabel(dayT) {
  if (dayT < TIME.sunsetStart) return 'DAY';
  if (dayT < TIME.nightStart) return 'GOLDEN HOUR';
  if (dayT < TIME.dawnStart) return 'NEON NIGHT';
  return 'DAWN';
}

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = FIELD.width;
  let viewH = FIELD.height;

  function resize() {
    const scale = Math.min(window.innerWidth / FIELD.width, window.innerHeight / FIELD.height);
    viewW = FIELD.width;
    viewH = FIELD.height;
    canvas.width = Math.floor(FIELD.width * scale * (window.devicePixelRatio || 1));
    canvas.height = Math.floor(FIELD.height * scale * (window.devicePixelRatio || 1));
    canvas.style.width = `${Math.floor(FIELD.width * scale)}px`;
    canvas.style.height = `${Math.floor(FIELD.height * scale)}px`;
  }
  window.addEventListener('resize', resize);
  resize();

  function drawSkyTint(dayT, night) {
    // A warm wash at sunset, a blue darkening at night, drawn over the world.
    const sunset = smooth(TIME.sunsetStart - 0.05, TIME.nightStart, dayT) * (1 - smooth(0.5, 0.7, dayT));
    if (sunset > 0) {
      const g = ctx.createLinearGradient(0, 0, viewW, 0);
      g.addColorStop(0, `rgba(255, 94, 58, ${0.22 * sunset})`);
      g.addColorStop(1, 'rgba(255, 94, 58, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    if (night > 0) {
      ctx.fillStyle = `rgba(16, 10, 46, ${0.34 * night})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  function drawWorld(world) {
    const city = world.city;
    const dayT = world.dayT;
    const night = world.nightFactor;
    const cam = world.camera;
    ctx.save();
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x + (world.shakeX || 0), -cam.y + (world.shakeY || 0));

    // Ground: water, sand, grass. The ground rects run well past the map's
    // edges so the camera never shows the void past a border.
    ctx.fillStyle = night > 0.5 ? PALETTE.waterNight : PALETTE.waterDay;
    ctx.fillRect(-2000, -2000, WORLD.waterX + 2000, WORLD.height + 4000);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(WORLD.waterX, -2000, WORLD.beachX - WORLD.waterX, WORLD.height + 4000);
    ctx.fillStyle = night > 0.5 ? PALETTE.grassNight : PALETTE.grass;
    ctx.fillRect(WORLD.beachX, -2000, WORLD.width - WORLD.beachX + 2000, WORLD.height + 4000);
    // Water shimmer, a function of sim time only.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const y = ((i * 317 + world.time * 22) % WORLD.height);
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(58, y);
      ctx.stroke();
    }
    // Park.
    ctx.fillStyle = night > 0.5 ? '#24402a' : '#6da055';
    ctx.fillRect(city.park.x0, city.park.y0, city.park.x1 - city.park.x0, city.park.y1 - city.park.y0);
    for (const t of city.trees) {
      ctx.fillStyle = night > 0.5 ? '#1d3a24' : '#3f7a37';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Roads.
    ctx.fillStyle = night > 0.5 ? PALETTE.asphaltNight : PALETTE.asphalt;
    for (const ax of WORLD.avenues) ctx.fillRect(ax - WORLD.roadHalf, 0, WORLD.roadHalf * 2, WORLD.height);
    for (const sy of WORLD.streets) ctx.fillRect(0, sy - WORLD.roadHalf, WORLD.width, WORLD.roadHalf * 2);
    // Sidewalk edges.
    ctx.strokeStyle = night > 0.5 ? PALETTE.sidewalkNight : PALETTE.sidewalk;
    ctx.lineWidth = 6;
    for (const ax of WORLD.avenues) {
      ctx.beginPath(); ctx.moveTo(ax - WORLD.roadHalf, 0); ctx.lineTo(ax - WORLD.roadHalf, WORLD.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax + WORLD.roadHalf, 0); ctx.lineTo(ax + WORLD.roadHalf, WORLD.height); ctx.stroke();
    }
    for (const sy of WORLD.streets) {
      ctx.beginPath(); ctx.moveTo(0, sy - WORLD.roadHalf); ctx.lineTo(WORLD.width, sy - WORLD.roadHalf); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, sy + WORLD.roadHalf); ctx.lineTo(WORLD.width, sy + WORLD.roadHalf); ctx.stroke();
    }
    // Centre dashes.
    ctx.fillStyle = PALETTE.roadLine;
    for (const ax of WORLD.avenues) {
      for (let y = 20; y < WORLD.height; y += 70) ctx.fillRect(ax - 3, y, 6, 34);
    }
    for (const sy of WORLD.streets) {
      for (let x = 20; x < WORLD.width; x += 70) ctx.fillRect(x, sy - 3, 34, 6);
    }
    // Pier.
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(-140, 1210, 210, 80);
    ctx.fillStyle = '#5d4327';
    for (let x = -130; x < 60; x += 26) ctx.fillRect(x, 1212, 4, 76);
    // Buildings with windows and neon signs.
    for (const b of city.buildings) {
      const shadow = b.height / 5;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(b.x + shadow, b.y + shadow, b.w, b.h);
      ctx.fillStyle = night > 0.5 ? PALETTE.buildingNight[0] : b.color;
      ctx.fillStyle = night > 0.5 ? shadeBuilding(b) : b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // Windows: lit at night, dark by day.
      const cols = Math.max(2, Math.floor(b.w / 26));
      const rows = Math.max(2, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const lit = hash(b.x + i * 13, b.y + j * 17) < (night > 0.4 ? 0.55 : 0.12);
          ctx.fillStyle = lit ? '#ffd97a' : 'rgba(20,24,40,0.55)';
          ctx.fillRect(b.x + 8 + i * ((b.w - 16) / cols), b.y + 8 + j * ((b.h - 16) / rows), 10, 12);
        }
      }
      // Neon sign: a glowing bar and, for landmarks, the name.
      if (b.sign >= 0) {
        const color = PALETTE.neon[b.sign];
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 14 + 10 * night;
        ctx.fillStyle = color;
        ctx.fillRect(b.x + b.w / 2 - 26, b.y - 6, 52, 7);
        if (b.name) {
          ctx.font = `bold 13px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = color;
          ctx.fillText(b.name, b.x + b.w / 2, b.y - 14);
        }
        ctx.restore();
      }
    }
    // Stunt ramps.
    for (const ramp of city.ramps) {
      ctx.save();
      ctx.translate(ramp.x, ramp.y);
      ctx.rotate(ramp.angle);
      ctx.fillStyle = '#ff6b35';
      ctx.beginPath();
      ctx.moveTo(-26, 18); ctx.lineTo(26, 18); ctx.lineTo(14, -18); ctx.lineTo(-14, -18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffe600';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('RAMP', 0, 4);
      ctx.restore();
    }
    // Neon packages.
    for (const pkg of city.packages) {
      if (pkg.taken) continue;
      const pulse = 0.6 + 0.4 * Math.sin(world.time * 4 + pkg.id);
      ctx.save();
      ctx.shadowColor = '#ff2e88';
      ctx.shadowBlur = 16 * pulse;
      ctx.fillStyle = '#ff2e88';
      ctx.beginPath();
      ctx.arc(pkg.x, pkg.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('$', pkg.x, pkg.y + 4);
    }
    // Taxi stands.
    for (const stand of city.taxiStands) {
      ctx.fillStyle = 'rgba(255, 214, 10, 0.85)';
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', stand.x, stand.y - 18);
      ctx.strokeStyle = 'rgba(255, 214, 10, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(stand.x, stand.y, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Objective beacon.
    const objective = world.objective;
    if (objective) {
      const pulse = 0.5 + 0.5 * Math.sin(world.time * 5);
      ctx.save();
      ctx.fillStyle = `rgba(255, 230, 0, ${0.12 + 0.1 * pulse})`;
      ctx.fillRect(objective.x - 3, -100, 6, WORLD.height + 200);
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(objective.x, objective.y, 26 + 8 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.moveTo(objective.x, objective.y - 14);
      ctx.lineTo(objective.x + 10, objective.y);
      ctx.lineTo(objective.x, objective.y + 14);
      ctx.lineTo(objective.x - 10, objective.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Parked cars, traffic, cops, then the player.
    for (const car of world.parked) drawCar(world, car);
    for (const car of world.traffic) drawCar(world, car);
    for (const car of world.cops) drawCar(world, car);
    for (const ped of world.peds) drawPed(world, ped);
    for (const cop of world.footCops) drawFootCop(world, cop);
    if (world.player.car) drawCar(world, world.player.car, true);
    else drawPlayerOnFoot(world);
    // Particles.
    for (const p of world.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.kind === 'smoke' ? '#9a9a9a' : '#ffd60a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.kind === 'smoke' ? 8 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Popups.
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = 'center';
    for (const pop of world.popups) {
      ctx.globalAlpha = Math.max(0, pop.life);
      ctx.fillStyle = pop.color || '#fff';
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    drawSkyTint(dayT, night);
  }

  function shadeBuilding(b) {
    const idx = Math.abs(Math.floor(b.x + b.y)) % PALETTE.buildingNight.length;
    return PALETTE.buildingNight[idx];
  }

  function drawCar(world, car, isPlayer = false) {
    const night = world.nightFactor;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Neon underglow for the player's car at night.
    if (isPlayer && night > 0.3) {
      ctx.save();
      ctx.shadowColor = '#ff2e88';
      ctx.shadowBlur = 22;
      ctx.fillStyle = 'rgba(255,46,136,0.5)';
      roundRect(ctx, -24, -13, 48, 26, 8);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -22, -11, 46, 24, 7);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundRect(ctx, -23, -12, 46, 24, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,24,40,0.85)';
    roundRect(ctx, -8, -9, 14, 18, 4);
    ctx.fill();
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, -14);
    }
    if (car.kind === 'cop') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-4, -12, 8, 24);
      // Light bar, flashing with sim time.
      const phase = Math.floor(world.time * 4) % 2 === 0;
      ctx.fillStyle = phase ? '#ff2e2e' : '#2e6bff';
      ctx.fillRect(-6, -13, 12, 5);
      ctx.fillStyle = phase ? '#2e6bff' : '#ff2e2e';
      ctx.fillRect(-6, 8, 12, 5);
    }
    // Headlights at night: a pale cone ahead.
    if (night > 0.4) {
      ctx.fillStyle = `rgba(255, 240, 180, ${0.14 * night})`;
      ctx.beginPath();
      ctx.moveTo(22, -8);
      ctx.lineTo(120, -34);
      ctx.lineTo(120, 34);
      ctx.lineTo(22, 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPed(world, ped) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.down) {
      ctx.rotate(1.2);
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3 - 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFootCop(world, cop) {
    ctx.save();
    ctx.translate(cop.x, cop.y);
    ctx.fillStyle = '#1d3a6e';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(0, -3, 5, 0, Math.PI * 2);
    ctx.fill();
    if (cop.bust > 0) {
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 16, -Math.PI / 2, -Math.PI / 2 + (cop.bust / 1.5) * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayerOnFoot(world) {
    const p = world.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(Math.cos(p.angle) * 10, Math.sin(p.angle) * 10);
    ctx.lineTo(Math.cos(p.angle + 2.6) * 8, Math.sin(p.angle + 2.6) * 8);
    ctx.lineTo(Math.cos(p.angle - 2.6) * 8, Math.sin(p.angle - 2.6) * 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawMinimap(world) {
    const w = 216;
    const h = 152;
    const x0 = viewW - w - 14;
    const y0 = 14;
    const sx = w / WORLD.width;
    const sy = h / WORLD.height;
    ctx.save();
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, x0 - 6, y0 - 6, w + 12, h + 12, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    ctx.fillStyle = '#1d2b1f';
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = '#2e86ab';
    ctx.fillRect(x0, y0, WORLD.waterX * sx, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (const ax of WORLD.avenues) {
      ctx.beginPath();
      ctx.moveTo(x0 + ax * sx, y0);
      ctx.lineTo(x0 + ax * sx, y0 + h);
      ctx.stroke();
    }
    for (const sy2 of WORLD.streets) {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + sy2 * sy);
      ctx.lineTo(x0 + w, y0 + sy2 * sy);
      ctx.stroke();
    }
    const dot = (x, y, color, r = 3) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x0 + x * sx, y0 + y * sy, r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (world.objective) dot(world.objective.x, world.objective.y, '#ffe600', 5);
    for (const cop of world.cops) dot(cop.x, cop.y, '#ff3b30');
    if (world.missions.fare) dot(world.missions.fare.stand.x, world.missions.fare.stand.y, '#ffd60a', 4);
    dot(world.player.x, world.player.y, '#fff', 4);
    ctx.restore();
  }

  function drawHud(world, ui) {
    const p = world.player;
    // Top-left: cash and wanted stars.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, 12, 12, 210, 64, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(`$${p.cash.toLocaleString('en-US')}`, 24, 40);
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < p.wanted ? '#ff3b30' : 'rgba(255,255,255,0.25)';
      ctx.font = '20px sans-serif';
      ctx.fillText('★', 24 + i * 26, 66);
    }
    // Top-centre: objective and timer.
    if (world.objective) {
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.panel;
      const label = world.objective.label;
      ctx.font = `bold 16px ${FONT}`;
      const tw = ctx.measureText(label).width;
      roundRect(ctx, viewW / 2 - tw / 2 - 16, 12, tw + 32, 34, 8);
      ctx.fill();
      ctx.fillStyle = '#ffe600';
      ctx.fillText(label, viewW / 2, 35);
    }
    if (world.missions.status === 'active' && world.missions.timer > 0) {
      const t = Math.max(0, Math.ceil(world.missions.timer));
      ctx.textAlign = 'center';
      ctx.fillStyle = t <= 10 ? '#ff3b30' : '#fff';
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, viewW / 2, 76);
    }
    drawMinimap(world);
    // Under the minimap: time of day and radio.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillText(`${dayLabel(world.dayT)}  ·  ${ui.radio}`, viewW - 14, 196);
    // Bottom-left: speed or health.
    ctx.textAlign = 'left';
    if (p.car) {
      const kmh = Math.round(Math.abs(p.car.speed) * 0.24);
      ctx.fillStyle = PALETTE.panel;
      roundRect(ctx, 12, viewH - 66, 150, 54, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 28px ${FONT}`;
      ctx.fillText(`${kmh}`, 24, viewH - 28);
      ctx.font = `14px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('km/h', 82, viewH - 28);
    } else {
      ctx.fillStyle = PALETTE.panel;
      roundRect(ctx, 12, viewH - 66, 210, 54, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText('HEALTH', 24, viewH - 42);
      ctx.fillStyle = '#333';
      ctx.fillRect(24, viewH - 34, 180, 10);
      ctx.fillStyle = p.health > 30 ? '#2ecc71' : '#ff3b30';
      ctx.fillRect(24, viewH - 34, 180 * (p.health / 100), 10);
    }
    // Bottom-right: style meter and packages.
    const taken = world.city.packages.filter((k) => k.taken).length;
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, viewW - 222, viewH - 66, 210, 54, 8);
    ctx.fill();
    ctx.fillStyle = '#ff2e88';
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText(`STYLE ${Math.floor(p.style)}`, viewW - 24, viewH - 42);
    ctx.fillStyle = '#333';
    ctx.fillRect(viewW - 198, viewH - 34, 174, 10);
    ctx.fillStyle = '#ff2e88';
    ctx.fillRect(viewW - 198, viewH - 34, 174 * Math.min(1, p.style / 200), 10);
    ctx.fillStyle = '#fff';
    ctx.font = `13px ${FONT}`;
    ctx.fillText(`◆ ${taken}/12`, viewW - 24, viewH - 14);
    // Bottom-centre: contextual hint.
    const hint = p.car
      ? 'WASD drive · SPACE handbrake · E exit car · R radio · M mute · P pause'
      : 'WASD walk · SHIFT run · E steal car · F punch · J next job · P pause';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font = `13px ${FONT}`;
    const hw = ctx.measureText(hint).width;
    roundRect(ctx, viewW / 2 - hw / 2 - 10, viewH - 30, hw + 20, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#ddd';
    ctx.fillText(hint, viewW / 2, viewH - 15);
  }

  function panel(title, lines, buttons, selected) {
    const w = 620;
    const h = 150 + lines.length * 30 + buttons.length * 46;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2;
    ctx.fillStyle = 'rgba(8, 6, 20, 0.72)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelBorder;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff2e88';
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillText(title, viewW / 2, y + 48);
    ctx.fillStyle = '#fff';
    ctx.font = `16px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, viewW / 2, y + 88 + i * 30);
    });
    const rects = [];
    buttons.forEach((label, i) => {
      const by = y + 110 + lines.length * 30 + i * 46;
      const sel = i === selected;
      ctx.fillStyle = sel ? '#ff2e88' : 'rgba(255,255,255,0.12)';
      roundRect(ctx, x + 60, by, w - 120, 36, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillText(label, viewW / 2, by + 24);
      rects.push({ id: label, x: x + 60, y: by, w: w - 120, h: 36 });
    });
    return rects;
  }

  function drawTitle(world, ui) {
    // The city at golden hour behind the menu, slowly panning.
    const cx = 1600 + Math.cos(world.time * 0.05) * 500;
    const cy = 1200 + Math.sin(world.time * 0.04) * 300;
    world.camera.x = cx;
    world.camera.y = cy;
    world.camera.zoom = 0.75;
    drawWorld(world);
    ctx.fillStyle = 'rgba(10, 6, 24, 0.45)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = '#ff2e88';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffe600';
    ctx.font = `bold 92px ${FONT}`;
    ctx.fillText('NEON BAY', viewW / 2, 190);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillText('S U N S E T   G E T A W A Y', viewW / 2, 236);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `16px ${FONT}`;
    ctx.fillText('An open-world crime story in a city that never stops glowing.', viewW / 2, 268);
    const buttons = [];
    let y = 330;
    const labels = [];
    if (ui.hasSave) labels.push('CONTINUE');
    labels.push('NEW GAME');
    if (ui.unlockedJob > 0) labels.push(`JOBS — ${ui.unlockedJob} of ${JOBS.length} done`);
    labels.push('HOW TO PLAY');
    labels.forEach((label, i) => {
      const sel = i === ui.selected;
      ctx.fillStyle = sel ? '#ff2e88' : 'rgba(16,12,32,0.8)';
      roundRect(ctx, viewW / 2 - 190, y, 380, 44, 10);
      ctx.fill();
      ctx.strokeStyle = sel ? '#ffe600' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText(label, viewW / 2, y + 29);
      buttons.push({ id: label, x: viewW / 2 - 190, y, w: 380, h: 44 });
      y += 56;
    });
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `14px ${FONT}`;
    ctx.fillText('WASD move / drive · E steal car · SPACE handbrake · R radio · M mute · P pause', viewW / 2, viewH - 30);
    if (ui.bestStyle > 0) ctx.fillText(`Best style ${ui.bestStyle} · Cash $${ui.cash.toLocaleString('en-US')}`, viewW / 2, viewH - 54);
    return buttons;
  }

  return {
    resize,
    draw(world, screen, ui) {
      ctx.clearRect(0, 0, viewW, viewH);
      // The canvas backing store is scaled; draw in logical 1280x720 space.
      const dpr = window.devicePixelRatio || 1;
      const scaleX = canvas.width / viewW / dpr;
      const scaleY = canvas.height / viewH / dpr;
      ctx.save();
      ctx.scale(scaleX, scaleY);
      let buttons = [];
      if (screen === SCREEN_TITLE) {
        buttons = drawTitle(world, ui);
      } else if (screen === SCREEN_HOWTO) {
        drawWorld(world);
        buttons = panel('HOW TO PLAY', [
          'WASD / arrows — walk or drive. SHIFT — run. SPACE — handbrake drift.',
          'E — steal the nearest car, or step out. F — punch. J — take the next job.',
          'R — change radio station. M — mute. P — pause.',
          'Stealing a car raises your wanted level. Swap cars to shed a star.',
          'Break line of sight and stay clean, and the heat cools off.',
          'Near-misses, drifts and stunt ramps build STYLE — it pays out at job end.',
          'Gold $ packages hide all over Neon Bay. Taxi fares pay between jobs.',
          'The sun sets as you play: at night the neon burns and the cops see less.',
        ], ['BACK'], ui.selected);
      } else if (screen === SCREEN_BRIEF) {
        drawWorld(world);
        const job = JOBS[ui.jobIndex];
        buttons = panel(job.title, [
          `From: ${job.client}`,
          ...wrapText(job.briefing, 62),
          `Reward: $${job.reward} + style bonus`,
          job.timeLimit ? `Time limit: ${job.timeLimit}s` : 'No time limit — take the city at your pace.',
        ], ['START JOB', 'BACK'], ui.selected);
      } else if (screen === SCREEN_COMPLETE) {
        drawWorld(world);
        const job = JOBS[ui.jobIndex];
        buttons = panel('JOB COMPLETE', [
          `${job.title} — done.`,
          `Payout: $${world.missions.lastPayout} (job $${job.reward} + style $${world.missions.lastStyleBonus})`,
          `Cash: $${world.player.cash.toLocaleString('en-US')}`,
          ui.jobIndex + 1 < JOBS.length ? `Next: ${JOBS[ui.jobIndex + 1].title}` : 'That was the last job. Neon Bay is yours — free roam on.',
        ], ['CONTINUE'], ui.selected);
      } else if (screen === SCREEN_FAILED) {
        drawWorld(world);
        buttons = panel('JOB FAILED', [
          world.missions.failReason || 'The job fell apart.',
          'Dante is not angry. Dante is disappointed. Try again.',
        ], ['RETRY JOB', 'FREE ROAM'], ui.selected);
      } else if (screen === SCREEN_BUSTED) {
        drawWorld(world);
        buttons = panel(ui.bustedTitle || 'BUSTED', [
          ui.bustedLine || 'The NBPD caught up with you.',
          `Lost $${ui.bustedLost || 0} to fines and hospital bills.`,
          'You wake up at St. Marina. The city is still out there.',
        ], ['BACK TO THE STREETS'], ui.selected);
      } else if (screen === SCREEN_PAUSED) {
        drawWorld(world);
        buttons = panel('PAUSED', [
          `Cash $${world.player.cash.toLocaleString('en-US')} · Jobs done ${ui.unlockedJob}/${JOBS.length} · Packages ${world.city.packages.filter((k) => k.taken).length}/12`,
          `Radio: ${ui.radio} (R to change) · ${ui.muted ? 'Muted' : 'Sound on'} (M to toggle)`,
        ], ['RESUME', 'RESTART JOB', 'QUIT TO TITLE'], ui.selected);
      } else {
        drawWorld(world);
        drawHud(world, ui);
      }
      ctx.restore();
      return buttons;
    },
  };
}

function wrapText(text, width) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      lines.push(line.trim());
      line = word;
    } else {
      line += ' ' + word;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}
