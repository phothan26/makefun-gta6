// Tiny static server for VICE HARBOR (stdlib only, no dependencies).
// Serves the repository root so game/index.html and its modules load.
// Usage: node serve.ts  (PORT env, default 8080; SERVE_ROOT to change root)
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT: string = process.env.SERVE_ROOT || dirname(fileURLToPath(import.meta.url));
const PORT: number = parseInt(process.env.PORT || '8080', 10) || 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/game/index.html';
    const file = normalize(join(ROOT, rel));
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found\n');
      return;
    }
    const buf = readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('server error\n');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('VICE HARBOR serving ' + ROOT + ' on http://127.0.0.1:' + PORT + '/game/index.html');
});
