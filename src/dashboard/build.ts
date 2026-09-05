import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { assertNoSecrets } from '../safety.js';
import { dashboardData } from './server.js';

const portableFiles = ['index.html', 'styles.css', 'app.js', 'data.js', 'BUILD-INFO.json'] as const;

function assertBuildDestination(root: string, output: string): void {
  const path = relative(root, output);
  if (!path || path.startsWith('..') || resolve(root, path) !== output) throw new Error('Judge build destination must be inside the repository');
}

export async function buildJudgePackage(root = process.cwd(), output = resolve(root, 'dist', 'judge')): Promise<{ output: string; files: readonly string[] }> {
  const resolvedRoot = resolve(root);
  const resolvedOutput = resolve(output);
  assertBuildDestination(resolvedRoot, resolvedOutput);
  const model = await dashboardData(resolvedRoot);
  assertNoSecrets(model);

  await rm(resolvedOutput, { recursive: true, force: true });
  await mkdir(resolve(resolvedOutput, 'proof', 'mission-002'), { recursive: true });
  const sourceIndex = await readFile(resolve(resolvedRoot, 'dashboard', 'index.html'), 'utf8');
  const portableIndex = sourceIndex
    .replace('href="/styles.css"', 'href="./styles.css"')
    .replace('src="/data.js"', 'src="./data.js"')
    .replace('src="/app.js"', 'src="./app.js"');
  await writeFile(resolve(resolvedOutput, 'index.html'), portableIndex, 'utf8');
  await copyFile(resolve(resolvedRoot, 'dashboard', 'styles.css'), resolve(resolvedOutput, 'styles.css'));
  await copyFile(resolve(resolvedRoot, 'dashboard', 'app.js'), resolve(resolvedOutput, 'app.js'));
  await writeFile(resolve(resolvedOutput, 'data.js'), `window.__PARTLINE_DATA__=${JSON.stringify(model)};\n`, 'utf8');
  const integrity = JSON.parse(await readFile(resolve(resolvedRoot, 'proof', 'mission-002', 'integrity.json'), 'utf8')) as { bundleSha256: string };
  await writeFile(resolve(resolvedOutput, 'BUILD-INFO.json'), `${JSON.stringify({ schemaVersion: 1, mode: 'offline_read_only', dataSource: 'tracked_sanitized_proof_and_deterministic_simulation', proofBundleSha256: integrity.bundleSha256 }, null, 2)}\n`, 'utf8');
  for (const file of ['README.md', 'transcript.sanitized.txt', 'validation.json', 'integrity.json']) {
    const destination = resolve(resolvedOutput, 'proof', 'mission-002', file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(resolvedRoot, 'proof', 'mission-002', file), destination);
  }
  return { output: resolvedOutput, files: portableFiles };
}
