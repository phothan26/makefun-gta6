// Screenshot staging for Vice Harbor. Serves the game with serve.ts,
// opens it in a headless browser at 1280x720, stages each of the four
// shot states (?shot=...), and captures the canvas as a JPEG into
// screenshots/. Run: node game/src/shots.js [outDir]
// Needs Playwright: either installed where Node can find it, or pointed
// at with PLAYWRIGHT_MODULE=/path/to/node_modules/playwright.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SHOTS = JSON.parse(readFileSync(join(ROOT, 'shots.json'), 'utf8')).shots;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (e) {
    const mod = process.env.PLAYWRIGHT_MODULE;
    if (mod) return await import(mod);
    throw new Error('playwright not found: npm install playwright, or set PLAYWRIGHT_MODULE=/path/to/node_modules/playwright');
  }
}

function waitFor(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url, { method: 'HEAD' })
        .then((r) => (r.ok ? resolve(true) : retry()))
        .catch(() => retry());
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error('server did not come up: ' + url));
      else setTimeout(tick, 200);
    };
    tick();
  });
}

async function main() {
  const outDir = process.argv[2] || join(ROOT, 'screenshots');
  mkdirSync(outDir, { recursive: true });
  const port = 8123 + Math.floor(Math.random() * 500);
  const server = spawn('node', ['serve.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  try {
    await waitFor('http://127.0.0.1:' + port + '/game/index.html', 15000);
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('pageerror', (e) => { throw new Error('page error: ' + e.message); });
      for (const shot of SHOTS) {
        await page.goto('http://127.0.0.1:' + port + '/game/index.html?shot=' + shot.id + '&seed=7', { waitUntil: 'load' });
        await page.waitForFunction(() => window.__game && window.__game.game, null, { timeout: 10000 });
        await page.waitForTimeout(600);
        const canvas = page.locator('#game');
        const file = join(outDir, shot.file);
        await canvas.screenshot({ path: file, type: 'jpeg', quality: 88 });
        const buf = readFileSync(file);
        const sha = createHash('sha256').update(buf).digest('hex');
        const size = statSync(file).size;
        console.log(shot.id + ' -> ' + shot.file + ' ' + size + ' bytes sha256 ' + sha.slice(0, 16) + '...');
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill('SIGTERM');
  }
  console.log('screenshots done in ' + outDir);
}

main().catch((e) => {
  console.error('SHOTS FAILED: ' + e.message);
  process.exit(1);
});
