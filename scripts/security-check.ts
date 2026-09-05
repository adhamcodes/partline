import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Artifact } from '../src/domain.js';
import { assertNoSecrets } from '../src/safety.js';

const root = process.cwd();
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const findings: string[] = [];
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/,
  /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i,
  /https?:\/\/[^\s"'<>]+[?&](?:code|access_token|refresh_token|state)=[^\s"'<>]+/i,
  /["']?(?:api_key|access_token|refresh_token|client_secret)["']?\s*[:=]\s*["'][A-Za-z0-9._~-]{20,}["']/i,
];
for (const file of files) {
  if (/(?:^|\/)(?:\.env(?:\..*)?|token\.json|pending_login\.json)$|\.(pem|key)$/i.test(file)) { findings.push(`${file}: credential-file-name`); continue; }
  const contents = await readFile(join(root, file), 'utf8');
  patterns.forEach((pattern, i) => { if (pattern.test(contents)) findings.push(`${file}: pattern-${i + 1}`); });
}
let artifactCount = 0;
try {
  for (const file of await readdir(join(root, '.runs'))) if (file.endsWith('.json')) {
    const path = join(root, '.runs', file);
    try { const artifact = Artifact.parse(JSON.parse(await readFile(path, 'utf8'))); assertNoSecrets(artifact); artifactCount++; }
    catch { findings.push(`${relative(root, path)}: artifact-validation`); }
  }
} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
// Findings never contain the matching value or line content.
if (findings.length) { console.error(JSON.stringify({ result: 'FAIL', findings })); process.exitCode = 1; }
else console.log(JSON.stringify({ result: 'PASS', sourceFilesScanned: files.length, artifactsScanned: artifactCount, note: 'Pattern scan plus strict artifact validation; not a proof against every possible secret.' }));
