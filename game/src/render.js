// Drawing only: the world's state and the current screen in, pixels out. The camera
// follows Mara across the 3200x2400 city; the Sunset Clock tints the scene from
// afternoon gold to neon night; the HUD, the minimap and the panels sit on top.
import { FIELD, FONT, LANDMARKS, PALETTE, ROADS_X, ROADS_Y, ROAD_HALF, WORLD } from './config.js';
import { JOBS } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WRECKED = 'wrecked';
export const SCREEN_COMPLETE = 'complete';
export const SCREEN_FAILED = 'failed';
export const SCREEN_STORY = 'story';
export const SCREEN_HELP = 'help';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const cam = { x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function font(size) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    return fonts.get(size);
  }

  function text(value, x, y, size, color, align = 'left', baseline = 'alphabetic') {
    ctx.font = font(size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(value, x, y);
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGround(world) {
    const night = world.nightness();
    // Grass base, then the beach and the bay.
    ctx.fillStyle = night > 0.5 ? '#16241a' : PALETTE.grass;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(3046, 0, WORLD.width - 3046, WORLD.height);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, WORLD.waterY, WORLD.width, WORLD.height - WORLD.waterY);
    // The pier, jutting into the bay.
    ctx.fillStyle = '#5a4632';
    ctx.fillRect(1535, WORLD.waterY - 8, 130, 388);
    ctx.fillStyle = '#6e573d';
    ctx.fillRect(1545, WORLD.waterY - 8, 110, 388);
    // Roads and sidewalks.
    for (const x of ROADS_X) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(x - ROAD_HALF - 12, 0, (ROAD_HALF + 12) * 2, WORLD.waterY);
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(x - ROAD_HALF, 0, ROAD_HALF * 2, WORLD.waterY);
    }
    for (const y of ROADS_Y) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(0, y - ROAD_HALF - 12, WORLD.width, (ROAD_HALF + 12) * 2);
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(0, y - ROAD_HALF, WORLD.width, ROAD_HALF * 2);
    }
    // Lane dashes.
    ctx.fillStyle = PALETTE.asphaltLine;
    for (const x of ROADS_X) {
      for (let y = 40; y < WORLD.waterY; y += 80) ctx.fillRect(x - 2, y, 4, 34);
    }
    for (const y of ROADS_Y) {
      for (let x = 40; x < WORLD.width; x += 80) ctx.fillRect(x, y - 2, 34, 4);
    }
    // The stunt ramp.
    const ramp = world.city.ramp;
    ctx.save();
    ctx.translate(ramp.x, ramp.y);
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(-40, -26, 80, 52);
    ctx.fillStyle = '#111';
    ctx.font = font(16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RAMP', 0, 0);
    ctx.restore();
  }

  function drawBuildings(world) {
    const night = world.nightness();
    for (const b of world.city.buildings) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x, b.y + b.h - 8, b.w, 8);
      // Windows, lit when the night comes on.
      const cols = Math.max(2, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 34));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const wx = b.x + 12 + (i * (b.w - 24)) / Math.max(1, cols - 1);
          const wy = b.y + 12 + (j * (b.h - 24)) / Math.max(1, rows - 1);
          ctx.fillStyle = night > 0.4 && ((i * 7 + j * 3 + b.floors) % 3 !== 0)
            ? 'rgba(255, 214, 120, 0.9)' : 'rgba(0,0,0,0.35)';
          ctx.fillRect(wx, wy, 10, 12);
        }
      }
      if (b.label) {
        text(b.label, b.x + b.w / 2, b.y + b.h / 2, 15, '#ffffff', 'center', 'middle');
      }
    }
    // Neon signs glow once the sun is down.
    if (night > 0.25) {
      ctx.save();
      ctx.globalAlpha = night;
      ctx.shadowBlur = 14;
      for (const s of world.city.signs) {
        ctx.shadowColor = s.color;
        ctx.fillStyle = s.color;
        ctx.font = font(15);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.text, s.x, s.y);
      }
      ctx.restore();
    }
  }

  function drawPackages(world) {
    const t = world.time;
    for (const p of world.city.packages) {
      if (p.taken) continue;
      const pulse = 1 + Math.sin(t * 4 + p.index) * 0.15;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(-7 * pulse, -7 * pulse, 14 * pulse, 14 * pulse);
      ctx.restore();
    }
  }

  function drawCarShape(car, night, isPlayer) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (isPlayer && night > 0.4) {
      // Headlights cut the dark ahead of the car.
      const grad = ctx.createRadialGradient(30, 0, 4, 30, 0, 190);
      grad.addColorStop(0, 'rgba(255, 240, 180, 0.30)');
      grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(24, -8);
      ctx.lineTo(200, -52);
      ctx.lineTo(200, 52);
      ctx.lineTo(24, 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 30, 17, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = car.color;
    rr(-27, -13, 54, 26, 8);
    ctx.fill();
    ctx.fillStyle = '#101418';
    rr(-6, -10, 16, 20, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(12, -10, 4, 20);
    // Headlights and tail lights.
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(25, -10, 3, 5);
    ctx.fillRect(25, 5, 3, 5);
    ctx.fillStyle = '#ff2d2d';
    ctx.fillRect(-28, -10, 3, 5);
    ctx.fillRect(-28, 5, 3, 5);
    if (car.kind === 'cop') {
      const phase = Math.floor(car.x + car.y + (car.speed || 0)) % 2 === 0;
      ctx.fillStyle = phase ? '#ff2d2d' : '#2d7bff';
      ctx.fillRect(-4, -13, 8, 5);
      ctx.fillStyle = phase ? '#2d7bff' : '#ff2d2d';
      ctx.fillRect(-4, 8, 8, 5);
    }
    ctx.restore();
  }

  function drawPeds(world) {
    for (const ped of world.peds) {
      if (ped.down > 0) {
        ctx.fillStyle = ped.color;
        ctx.beginPath();
        ctx.arc(ped.x, ped.y, 9, 0, TAU);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(ped.x, ped.y, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 3, 0, TAU);
      ctx.fill();
    }
    for (const fc of world.footCops) {
      ctx.fillStyle = '#1e4fd8';
      ctx.beginPath();
      ctx.arc(fc.x, fc.y, 9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(fc.x, fc.y, 3, 0, TAU);
      ctx.fill();
    }
  }

  function drawPlayer(world) {
    const p = world.player;
    if (p.car) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    if (p.invuln === 0 || Math.floor(p.invuln * 10) % 2 === 1) {
      ctx.fillStyle = PALETTE.player;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(8, 0, 4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawObjective(world) {
    const obj = world.objective;
    if (!obj) return;
    const pulse = 1 + Math.sin(world.time * 5) * 0.18;
    ctx.save();
    ctx.translate(obj.x, obj.y);
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 34 * pulse, 0, TAU);
    ctx.stroke();
    const grad = ctx.createLinearGradient(0, -90, 0, 0);
    grad.addColorStop(0, 'rgba(255, 209, 102, 0)');
    grad.addColorStop(1, 'rgba(255, 209, 102, 0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(-5, -90, 10, 90);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(-10, -4);
    ctx.lineTo(10, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Off-screen arrow at the view edge.
    const sx = cam.x + FIELD.width / 2;
    const sy = cam.y + FIELD.height / 2;
    const dx = obj.x - sx;
    const dy = obj.y - sy;
    if (Math.abs(dx) > FIELD.width / 2 - 60 || Math.abs(dy) > FIELD.height / 2 - 60) {
      const ang = Math.atan2(dy, dx);
      const ax = sx + Math.cos(ang) * (FIELD.width / 2 - 80);
      const ay = sy + Math.sin(ang) * (FIELD.height / 2 - 80);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      text(`${Math.round(Math.hypot(dx, dy))}m`, ax, ay - 22, 15, PALETTE.gold, 'center', 'middle');
    }
  }

  function drawNight(world) {
    const night = world.nightness();
    if (night <= 0) return;
    ctx.fillStyle = `rgba(8, 12, 42, ${night * 0.52})`;
    ctx.fillRect(cam.x - 40, cam.y - 40, FIELD.width + 80, FIELD.height + 80);
    // Golden hour washes the city orange before the night falls.
    if (night < 0.5) {
      ctx.fillStyle = `rgba(255, 110, 30, ${(0.5 - night) * 0.16})`;
      ctx.fillRect(cam.x - 40, cam.y - 40, FIELD.width + 80, FIELD.height + 80);
    }
  }

  function drawMinimap(world) {
    const mw = 208;
    const mh = 156;
    const mx = FIELD.width - mw - 16;
    const my = 16;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 12, 24, 0.82)';
    ctx.fillRect(mx - 6, my - 6, mw + 12, mh + 12);
    ctx.strokeStyle = '#3a4157';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 6, my - 6, mw + 12, mh + 12);
    ctx.fillStyle = '#0d2b45';
    ctx.fillRect(mx, my + mh - 8, mw, 8);
    ctx.strokeStyle = '#565d73';
    for (const x of ROADS_X) {
      ctx.beginPath();
      ctx.moveTo(mx + x * sx, my);
      ctx.lineTo(mx + x * sx, my + mh);
      ctx.stroke();
    }
    for (const y of ROADS_Y) {
      ctx.beginPath();
      ctx.moveTo(mx, my + y * sy);
      ctx.lineTo(mx + mw, my + y * sy);
      ctx.stroke();
    }
    for (const p of world.city.packages) {
      if (p.taken) continue;
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(mx + p.x * sx - 2, my + p.y * sy - 2, 4, 4);
    }
    for (const cop of world.cops) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(mx + cop.x * sx, my + cop.y * sy, 3, 0, TAU);
      ctx.fill();
    }
    const obj = world.objective;
    if (obj) {
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(mx + obj.x * sx, my + obj.y * sy, 4 + Math.sin(world.time * 5) * 1.5, 0, TAU);
      ctx.fill();
    }
    const p = world.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(mx + px * sx, my + py * sy, 4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.arc(mx + px * sx, my + py * sy, 6, 0, TAU);
    ctx.stroke();
    // The camera's view rectangle.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(mx + cam.x * sx, my + cam.y * sy, FIELD.width * sx, FIELD.height * sy);
    ctx.restore();
  }

  function drawHud(world, ui) {
    const p = world.player;
    const night = world.nightness();
    // Top-left: cash, wanted, health, style.
    ctx.textBaseline = 'top';
    text(`$${p.cash}`, 20, 16, 30, PALETTE.gold);
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < p.wanted ? '★' : '☆';
    text(stars, 20, 52, 26, p.wanted > 0 ? PALETTE.wanted : '#6b7280');
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(20, 88, 150, 12);
    ctx.fillStyle = PALETTE.health;
    ctx.fillRect(20, 88, 150 * (p.health / 100), 12);
    text(`STYLE ${Math.round(p.style)}`, 20, 106, 16, PALETTE.style);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(20, 126, 150, 8);
    ctx.fillStyle = PALETTE.style;
    ctx.fillRect(20, 126, 150 * (p.style / 100), 8);
    // The Sunset Clock.
    const clockLabel = night < 0.25 ? 'AFTERNOON' : night < 0.6 ? 'GOLDEN HOUR' : night < 0.9 ? 'DUSK' : 'NIGHT';
    text(`${night < 0.6 ? '☀' : '☾'} ${clockLabel}`, 20, 142, 16, PALETTE.text);
    // Speed, when driving.
    if (p.car) {
      text(`${Math.round(Math.abs(p.car.speed) * 0.36)} km/h`, 20, 164, 22, PALETTE.text);
    }
    // Job tracker, top centre.
    const m = world.missions;
    if (m.status === 'active') {
      const job = JOBS[m.jobIndex];
      text(`JOB ${m.jobIndex + 1}/5 — ${job.title}`, FIELD.width / 2, 16, 22, PALETTE.text, 'center', 'top');
      const obj = world.objective;
      if (obj) text(obj.label, FIELD.width / 2, 44, 16, PALETTE.muted, 'center', 'top');
      if (m.timer > 0) text(`⏱ ${Math.ceil(m.timer)}s`, FIELD.width / 2, 66, 20, '#ff9f1c', 'center', 'top');
      if (m.jobIndex === 3 && m.progress > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(FIELD.width / 2 - 110, 68, 220, 10);
        ctx.fillStyle = PALETTE.gold;
        ctx.fillRect(FIELD.width / 2 - 110, 68, 220 * (m.progress / 25), 10);
      }
    } else if (m.status === 'idle') {
      text('FREE ROAM — press Enter to start the next job', FIELD.width / 2, 16, 18, PALETTE.muted, 'center', 'top');
    }
    // Packages found.
    const found = world.city.packages.filter((pk) => pk.taken).length;
    text(`◆ ${found}/12 packages`, FIELD.width - 240, 182, 15, '#00e5ff', 'left', 'top');
    // Radio, bottom-left.
    text(`${ui.muted ? '🔇 MUTED' : '♪ ' + ui.station}`, 20, FIELD.height - 34, 16, PALETTE.muted);
    text('WASD drive · E enter/exit car · R radio · M mute · P pause', 20, FIELD.height - 58, 13, 'rgba(255,255,255,0.45)');
    // Flash message, centre.
    if (p.flash && p.flashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.flashTimer);
      text(p.flash, FIELD.width / 2, FIELD.height - 130, 24, PALETTE.gold, 'center', 'top');
      ctx.restore();
    }
    drawMinimap(world);
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = 640;
    const lineH = 30;
    const h = 150 + lines.length * lineH + 56;
    const x = (FIELD.width - w) / 2;
    const y = (FIELD.height - h) / 2;
    ctx.fillStyle = 'rgba(8, 10, 20, 0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent ?? PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 62, 40, accent ?? PALETTE.gold, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 116 + i * lineH, 19, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + h - 26, 20, PALETTE.text, 'center');
  }

  function draw(world, screen, ui) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Camera: follow Mara, clamped to the city.
    const p = world.player;
    const fx = p.car ? p.car.x : p.x;
    const fy = p.car ? p.car.y : p.y;
    cam.x = clamp(fx - FIELD.width / 2, 0, WORLD.width - FIELD.width);
    cam.y = clamp(fy - FIELD.height / 2, 0, WORLD.height - FIELD.height);
    if (screen === SCREEN_TITLE) {
      cam.x = 960;
      cam.y = 480;
    }
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x - cam.x * view.scale, view.y - cam.y * view.scale);
    drawGround(world);
    drawBuildings(world);
    drawPackages(world);
    for (const car of world.cars) {
      if (car === p.car) continue;
      drawCarShape(car, world.nightness(), false);
    }
    if (p.car) drawCarShape(p.car, world.nightness(), true);
    drawPeds(world);
    drawPlayer(world);
    drawObjective(world);
    drawNight(world);
    // HUD and panels are drawn in screen space.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawPanel('NEON BAY', [
        'Sunset Getaway — Mara Voss, getaway driver,',
        'fresh out of prison and back on the streets of Neon Bay.',
        'Five jobs for Dante Cole. One pier at the end of it all.',
        '',
        `Best cash: $${ui.best}   ·   ${ui.savedJobs}/5 jobs done`,
      ], 'Press Enter or click to start', PALETTE.neon[0]);
    } else {
      drawHud(world, ui);
      if (screen === SCREEN_PAUSED) {
        drawPanel('PAUSED', ['The bay waits for no one. Except now.'], 'Press P to keep driving');
      } else if (screen === SCREEN_BUSTED) {
        drawPanel('BUSTED', ['The NBPD took Mara in. Dante posts bail,', 'but the night takes ten percent.'], 'Press Enter to walk out of the precinct', PALETTE.wanted);
      } else if (screen === SCREEN_WRECKED) {
        drawPanel('WRECKED', ['The car is scrap. Mara walks away.', 'Dante has another one waiting at the garage.'], 'Press Enter to get back in the game', PALETTE.wanted);
      } else if (screen === SCREEN_FAILED) {
        drawPanel("TIME'S UP", ['The sun set on that run.', 'Dante is not a patient man. Try it again.'], 'Press Enter to retry the job', PALETTE.wanted);
      } else if (screen === SCREEN_COMPLETE) {
        const c = world.missions.lastComplete;
        drawPanel('JOB COMPLETE', [
          `${c.title} — paid $${c.pay}`,
          `Cash so far: $${world.player.cash}`,
          world.missions.lastComplete.index === 4 ? '' : 'Next job is waiting at the garage.',
        ], 'Press Enter for the next job', PALETTE.gold);
      } else if (screen === SCREEN_STORY) {
        drawPanel('SUNSET GETAWAY', [
          'Five jobs. One pier. The loot is yours,',
          'and Neon Bay is yours to drive.',
          `Final cash: $${world.player.cash}`,
        ], 'Press Enter to keep driving Neon Bay', PALETTE.gold);
      } else if (screen === SCREEN_HELP) {
        drawPanel('HOW TO PLAY', [
          'WASD / arrows — drive or walk · E — enter or leave a car',
          'Shift — handbrake drift · R — change radio · M — mute',
          'Steal a fresh car to drop a wanted star.',
          'Near misses, drifts and air time raise your style —',
          'and style multiplies every payout.',
        ], 'Press Enter to play');
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
