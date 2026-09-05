import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileRunStore } from '../store.js';
import { buildDashboardModel, type DashboardModel } from './view.js';

const staticFiles = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/styles.css', 'styles.css'],
]);
const contentTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function headers(response: ServerResponse, type: string): void {
  response.setHeader('Content-Type', type);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
}

export async function dashboardData(root = process.cwd()) {
  const store = new FileRunStore(resolve(root, '.runs'));
  const [live, demo] = await Promise.all([store.load('mission002-live'), store.load('partline-demo')]);
  if (!live || !demo) throw new Error('Required judge artifacts absent; run the deterministic demo and restore the sanitized Mission 002 artifact');
  return buildDashboardModel(live, demo);
}

export function createDashboardServer({ root = process.cwd(), model }: { root?: string; model?: DashboardModel } = {}) {
  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method !== 'GET') { response.statusCode = 405; response.end('Method not allowed'); return; }
      if (path === '/health') { headers(response, 'application/json; charset=utf-8'); response.end(JSON.stringify({ ok: true, mode: 'read_only' })); return; }
      if (path === '/api/dashboard') { headers(response, 'application/json; charset=utf-8'); response.end(JSON.stringify(model ?? await dashboardData(root))); return; }
      const file = staticFiles.get(path);
      if (!file) { response.statusCode = 404; response.end('Not found'); return; }
      headers(response, contentTypes[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(resolve(root, 'dashboard', file)));
    } catch {
      response.statusCode = 500;
      headers(response, 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'Dashboard data unavailable' }));
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PARTLINE_DASHBOARD_PORT ?? 4173);
  const server = createDashboardServer();
  server.listen(port, '127.0.0.1', () => console.log(`PARTLINE judge console: http://127.0.0.1:${port}`));
}
