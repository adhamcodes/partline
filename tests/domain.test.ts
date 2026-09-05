import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Job, Value, Artifact } from '../src/domain.js';
import { demoJob } from '../src/demo.js';
import { assertNoSecrets, checkGrant, redact, redactPhone, simulationGrant } from '../src/safety.js';

test('accepts complete job and rejects unexpected keys', () => {
  assert.equal(Job.parse(demoJob).targets.length, 4);
  assert.equal(Job.safeParse({ ...demoJob, api_key: 'synthetic' }).success, false);
});
for (const [label, mutate] of [
  ['invalid contact reference', (j: Job) => { j.targets[0]!.contactRef = 'not-a-ref'; }],
  ['duplicate target ID', (j: Job) => { j.targets[1]!.id = j.targets[0]!.id; }],
  ['duplicate contact reference', (j: Job) => { j.targets[1]!.contactRef = j.targets[0]!.contactRef; }],
  ['missing required question', (j: Job) => { j.questions.pop(); }],
  ['duplicate question', (j: Job) => { j.questions.push(j.questions[0]!); }],
  ['unbounded concurrency', (j: Job) => { j.policy.concurrency = 100; }],
  ['unbounded retry', (j: Job) => { j.policy.maxStartRetries = 100; }],
  ['zero quantity', (j: Job) => { j.quantity = 0; }],
  ['overlong base ID', (j: Job) => { j.id = 'a'.repeat(33); }],
  ['deadline without timezone', (j: Job) => { j.deadline = '2026-09-05T16:00:00'; }],
  ['invalid timezone', (j: Job) => { j.timezone = 'made/up'; }],
  ['past deadline', (j: Job) => { j.deadline = '2026-09-04T16:00:00Z'; }],
] as const) test(`rejects ${label}`, () => { const j = structuredClone(demoJob); mutate(j); assert.equal(Job.safeParse(j).success, false); });
test('money uses integer minor units and a known price basis', () => {
  assert.equal(Value.safeParse({ kind: 'money', minor: 10.2, currency: 'USD', basis: 'total_including_tax' }).success, false);
  assert.equal(Value.safeParse({ kind: 'money', minor: 100, currency: 'USD', basis: 'per_unit' }).success, false);
  assert.equal(Value.safeParse({ kind: 'money', minor: 100, currency: 'JPY', basis: 'total_including_tax' }).success, false);
});
test('call grants bind exact request, contacts, limits and mode', () => {
  const grant = simulationGrant(demoJob);
  checkGrant(demoJob, grant, 'mock', demoJob.createdAt);
  assert.throws(() => checkGrant(demoJob, grant, 'live', demoJob.createdAt));
  assert.throws(() => checkGrant(demoJob, grant, 'mock', demoJob.deadline));
  const changed = structuredClone(demoJob); changed.targets[0]!.contactRef = 'fixture:changed';
  assert.throws(() => checkGrant(changed, grant, 'mock', changed.createdAt));
  assert.throws(() => checkGrant(demoJob, undefined, 'mock', demoJob.createdAt));
  assert.throws(() => checkGrant(demoJob, { ...grant, expiresAt: 'invalid' }, 'mock', demoJob.createdAt));
});
test('exact E.164 phone variants are redacted before persistence', () => {
  assert.equal(redactPhone('Destination +1 (202) 555-0101 accepted', '+12025550101'), 'Destination [REDACTED_PHONE]accepted');
  assert.throws(() => redactPhone('text', '555-0101'));
});
test('sensitive fields and credential values are blocked without echoing them', () => {
  const synthetic = ['Bearer', 'unit-test-secret'].join(' ');
  assert.notEqual(redact(synthetic), synthetic);
  assert.throws(() => assertNoSecrets({ summary: synthetic }), /Sensitive content rejected/);
  assert.throws(() => assertNoSecrets({ access_token: 'unit-test-only' }), /Sensitive field rejected/);
  const dummyUrl = new URL('https://example.invalid/auth'); dummyUrl.searchParams.set('code', 'synthetic');
  assert.equal(redact(dummyUrl.toString()), '[REDACTED_URL]');
  assert.throws(() => Artifact.parse({ schemaVersion: 2 }));
});
