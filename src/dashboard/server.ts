import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoJob, demoRuntime, MockAdapter } from '../demo.js';
import { runJob } from '../orchestrator.js';
import { loadSanitizedProof } from '../proof.js';
import { simulationGrant } from '../safety.js';
import { MemoryRunStore } from '../store.js';
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
  const [{ proof }, demo] = await Promise.all([
    loadSanitizedProof(root),
    runJob(demoJob, new MockAdapter(), new MemoryRunStore(), demoRuntime, simulationGrant(demoJob)),
  ]);
  return buildDashboardModel(proof, demo);
}

export function createDashboardServer({ root = process.cwd(), model }: { root?: string; model?: DashboardModel } = {}) {
  const resolvedModel = model ? Promise.resolve(model) : dashboardData(root);
  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method !== 'GET') { response.statusCode = 405; response.end('Method not allowed'); return; }
      if (path === '/health') { headers(response, 'application/json; charset=utf-8'); response.end(JSON.stringify({ ok: true, mode: 'read_only' })); return; }
      if (path === '/api/dashboard') { headers(response, 'application/json; charset=utf-8'); response.end(JSON.stringify(await resolvedModel)); return; }
      if (path === '/data.js') { headers(response, 'text/javascript; charset=utf-8'); response.end(`window.__PARTLINE_DATA__=${JSON.stringify(await resolvedModel)};`); return; }
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
