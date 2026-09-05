import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileRunStore } from '../src/store.js';
import { runJob } from '../src/orchestrator.js';
import { demoJob, demoRuntime, MockAdapter } from '../src/demo.js';
import { simulationGrant } from '../src/safety.js';

test('atomic file store round trips a complete run and rejects path traversal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'partline-test-'));
  try {
    const store = new FileRunStore(dir); const result = await runJob(demoJob, new MockAdapter(), store, demoRuntime, simulationGrant(demoJob));
    assert.deepEqual(await store.load(demoJob.id), result);
    assert.equal(await store.load('absent'), undefined);
    await assert.rejects(store.load('../token')); await assert.rejects(store.acquire('../token'));
    const release = await store.acquire(demoJob.id); await assert.rejects(store.acquire(demoJob.id), /locked/); await release();
    assert.ok((await readFile(join(dir, `${demoJob.id}.json`), 'utf8')).endsWith('\n'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('store prevents sensitive content from reaching an artifact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'partline-test-'));
  try {
    const store = new FileRunStore(dir); const result = await runJob(demoJob, new MockAdapter(), store, demoRuntime, simulationGrant(demoJob));
    result.calls[0]!.transcript = ['Bearer', 'synthetic-secret'].join(' ');
    await assert.rejects(store.save(result), /Sensitive/);
    assert.ok(!(await readFile(join(dir, `${demoJob.id}.json`), 'utf8')).includes('synthetic-secret'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
