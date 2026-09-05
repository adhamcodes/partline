import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const files = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/styles.css', 'styles.css'], ['/data.js', 'data.js'],
  ['/BUILD-INFO.json', 'BUILD-INFO.json'], ['/proof/mission-002/README.md', 'proof/mission-002/README.md'],
  ['/proof/mission-002/transcript.sanitized.txt', 'proof/mission-002/transcript.sanitized.txt'],
  ['/proof/mission-002/validation.json', 'proof/mission-002/validation.json'], ['/proof/mission-002/integrity.json', 'proof/mission-002/integrity.json'],
]);
const contentTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

function safeHeaders(response: ServerResponse, type: string): void {
  response.setHeader('Content-Type', type);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
}

export function createStaticJudgeServer(root = resolve(process.cwd(), 'dist', 'judge')) {
  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method !== 'GET') { response.statusCode = 405; response.end('Method not allowed'); return; }
      const file = files.get(path);
      if (!file) { response.statusCode = 404; response.end('Not found'); return; }
      safeHeaders(response, contentTypes[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(resolve(root, file)));
    } catch {
      response.statusCode = 500;
      response.end('Judge package unavailable');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PARTLINE_JUDGE_PORT ?? 4173);
  createStaticJudgeServer().listen(port, '127.0.0.1', () => console.log(`PARTLINE portable judge build: http://127.0.0.1:${port}`));
}
