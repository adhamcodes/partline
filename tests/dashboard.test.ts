import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoJob, demoRuntime, MockAdapter } from '../src/demo.js';
import { runJob } from '../src/orchestrator.js';
import { loadSanitizedProof } from '../src/proof.js';
import { simulationGrant } from '../src/safety.js';
import { MemoryRunStore } from '../src/store.js';
import { createDashboardServer, dashboardData } from '../src/dashboard/server.js';
import { buildDashboardModel, formatOperationalInstant } from '../src/dashboard/view.js';

async function dashboardModel() {
  const demo = await runJob(demoJob, new MockAdapter(), new MemoryRunStore(), demoRuntime, simulationGrant(demoJob));
  const { proof } = await loadSanitizedProof();
  return buildDashboardModel(proof, demo);
}

test('judge model makes comparison, real proof and safety boundary explicit', async () => {
  const model = await dashboardModel();
  assert.equal(model.operations.maxConcurrency, 2);
  assert.equal(model.generatedFrom, 'versioned_sanitized_proof');
  assert.equal(model.operations.supplierCount, 4);
  assert.equal(model.operations.recommendation?.targetId, 'beacon');
  assert.equal(model.operations.recommendation?.total, 'USD 205.00');
  assert.equal(model.operations.recommendation?.savings, 'USD 43.00 cheaper than Atlas Parts');
  assert.deepEqual(model.operations.recommendation?.rejectedAlternative, { name: 'Delta Depot', total: 'USD 80.00', reason: 'Wrong model · rejected' });
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
  assert.equal(model.incident.timezone, 'UTC');
  assert.equal(model.incident.deadlineLabel, '05 Sept · 16:00 UTC');
  assert.equal(model.realProof.timezone, 'Asia/Dhaka');
  assert.equal(model.realProof.deadlineLabel, '05 Sept · 16:00 Asia/Dhaka (UTC+06:00)');
  const atlas = model.operations.timeline.lanes.find(lane => lane.targetId === 'atlas')?.segments[0];
  const beacon = model.operations.timeline.lanes.find(lane => lane.targetId === 'beacon')?.segments[0];
  assert.ok(atlas && beacon);
  assert.ok(atlas.start < beacon.end && beacon.start < atlas.end, 'Atlas and Beacon recorded execution windows must overlap');
  assert.equal(model.operations.timeline.lanes.find(lane => lane.targetId === 'beacon')?.segments[1]?.label, 'clarification');
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
    assert.match(json, /REAL CALL-E VALIDATION/);
    assert.doesNotMatch(json, /contactRef|runId|to_phone|phone_number/i);
    const bundled = await fetch(`${base}/data.js`);
    assert.equal(bundled.status, 200);
    assert.match(await bundled.text(), /versioned_sanitized_proof/);
    const rejected = await fetch(`${base}/api/dashboard`, { method: 'POST' });
    assert.equal(rejected.status, 405);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('clean-checkout dashboard data uses tracked proof rather than ignored run state', async () => {
  const model = await dashboardData(process.cwd());
  assert.equal(model.realProof.callCount, 1);
  assert.equal(model.realProof.evidence.length, 7);
  assert.deepEqual(model.realProof.unknownFields, ['constraints']);
  const serverSource = readFileSync(new URL('../src/dashboard/server.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(serverSource, /\.runs|FileRunStore|mission002-live|partline-demo\.json/);
});

test('browser surface contains inspection and replay controls only', () => {
  const html = readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../dashboard/app.js', import.meta.url), 'utf8');
  assert.match(html, /Replay 6-second run/);
  assert.match(html, /Inspect real evidence/);
  assert.match(html, /PARTLINE calls suppliers in parallel, converts their speech into traceable evidence/);
  assert.match(html, /REAL CALL-E VALIDATION/);
  assert.match(html, /SIMULATION · ZERO CALLS/);
  assert.match(html, /Purchase \/ reservation<\/dt><dd>NONE/);
  assert.doesNotMatch(`${html}\n${script}`, /run_call|call start|live-test|place order|reserve now|purchase now/i);
  assert.doesNotMatch(script, /method:\s*['"]POST['"]/);
});

test('timezone labels never reinterpret live Asia/Dhaka time as UTC', () => {
  assert.equal(formatOperationalInstant('2026-09-05T16:00:00Z', 'UTC'), '05 Sept · 16:00 UTC');
  const live = formatOperationalInstant('2026-09-05T16:00:00+06:00', 'Asia/Dhaka');
  assert.equal(live, '05 Sept · 16:00 Asia/Dhaka (UTC+06:00)');
  assert.doesNotMatch(live, /16:00 UTC$/);
  assert.equal(formatOperationalInstant('2026-09-05T14:30:00Z', 'UTC'), '05 Sept · 14:30 UTC');
});
