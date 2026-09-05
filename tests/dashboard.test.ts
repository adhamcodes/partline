import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Artifact } from '../src/domain.js';
import { demoJob, demoRuntime, MockAdapter } from '../src/demo.js';
import { mission002Job } from '../src/live-validation.js';
import { runJob } from '../src/orchestrator.js';
import { reprocessTranscripts } from '../src/reprocess.js';
import { simulationGrant } from '../src/safety.js';
import { MemoryRunStore } from '../src/store.js';
import { createDashboardServer } from '../src/dashboard/server.js';
import { buildDashboardModel } from '../src/dashboard/view.js';

const transcript = readFileSync(new URL('fixtures/calle-timestamped-transcript.txt', import.meta.url), 'utf8').trimEnd();

async function dashboardModel() {
  const demo = await runJob(demoJob, new MockAdapter(), new MemoryRunStore(), demoRuntime, simulationGrant(demoJob));
  const now = '2026-09-05T02:00:00Z';
  const job = mission002Job({ region: 'BD', language: 'English', timezone: 'Asia/Dhaka', deadline: '2026-09-05T16:00:00+06:00', now });
  const live = reprocessTranscripts(Artifact.parse({
    schemaVersion: 1, mode: 'live', job, evaluatedAt: '2026-09-05T02:05:00Z', state: 'awaiting_human_decision',
    calls: [{ id: 'mission002-live-beacon-0', targetId: 'beacon', round: 0, questions: job.questions, state: 'completed', startedAt: now, attempts: 1, polls: 3, terminal: 'COMPLETED', transcript, evidence: [], issues: [] }],
    comparison: [], events: [], evidenceReviews: [], decision: { state: 'pending', executable: false },
  }));
  return buildDashboardModel(live, demo);
}

test('judge model makes comparison, real proof and safety boundary explicit', async () => {
  const model = await dashboardModel();
  assert.equal(model.operations.maxConcurrency, 2);
  assert.equal(model.operations.supplierCount, 4);
  assert.equal(model.operations.recommendation?.targetId, 'beacon');
  assert.equal(model.operations.recommendation?.total, 'USD 205.00');
  assert.equal(model.operations.suppliers.find(item => item.id === 'delta')?.outcome, 'does_not_meet');
  assert.equal(model.operations.suppliers.find(item => item.id === 'cedar')?.coverage, 0);
  assert.equal(model.operations.suppliers.find(item => item.id === 'beacon')?.clarification, 'completed');
  assert.deepEqual(model.realProof.unknownFields, ['constraints']);
  assert.equal(model.realProof.coverage, 88);
  assert.equal(model.realProof.callCount, 1);
  assert.equal(model.realProof.startAttempts, 1);
  assert.equal(model.realProof.sameCallClarification, true);
  assert.equal(model.realProof.evidence.length, 7);
  assert.equal(model.safety.executable, false);
  assert.equal(model.operations.replay.length, 6);
  const serialized = JSON.stringify(model);
  assert.doesNotMatch(serialized, /contactRef|runId|to_phone|phone_number/i);
});

test('read-only dashboard server exposes the UI and sanitized model', async () => {
  const model = await dashboardModel();
  const server = createDashboardServer({ root: process.cwd(), model });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
    const base = `http://127.0.0.1:${address.port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    const html = await page.text();
    assert.match(html, /Emergency sourcing console/);
    assert.match(html, /NO ORDER · NO RESERVATION · HUMAN APPROVAL REQUIRED/);
    const response = await fetch(`${base}/api/dashboard`);
    assert.equal(response.status, 200);
    const json = await response.text();
    assert.match(json, /Verified CALL-E execution/);
    assert.doesNotMatch(json, /contactRef|runId|to_phone|phone_number/i);
    const rejected = await fetch(`${base}/api/dashboard`, { method: 'POST' });
    assert.equal(rejected.status, 405);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('browser surface contains inspection and replay controls only', () => {
  const html = readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../dashboard/app.js', import.meta.url), 'utf8');
  assert.match(html, /Replay 6-second run/);
  assert.match(html, /Inspect real evidence/);
  assert.doesNotMatch(`${html}\n${script}`, /run_call|call start|live-test|place order|reserve now|purchase now/i);
  assert.doesNotMatch(script, /method:\s*['"]POST['"]/);
});
