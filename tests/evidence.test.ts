import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Call, Evidence, Field, Result, Value } from '../src/domain.js';
import { demoJob, demoRuntime, fixtureResult, quoteTranscript } from '../src/demo.js';
import { assess, canonical, extractTranscript, ingest } from '../src/evidence.js';
import { compare, followup } from '../src/comparison.js';

const call: Call = { id: 'test-atlas-0', targetId: 'atlas', round: 0, questions: demoJob.questions, state: 'completed', attempts: 1, polls: 1, evidence: [], issues: [] };
function complete(): Call { return { ...call, ...ingest(call, fixtureResult(quoteTranscript()), demoRuntime.now(), []) }; }
function replace(c: Call, field: Field, value: Value) { c.evidence.find(e => e.field === field)!.value = value; }
test('eight answers have exact traceable supplier spans', () => {
  const c = complete(); assert.equal(c.evidence.length, 8);
  for (const e of c.evidence) { assert.equal(c.transcript!.slice(e.start, e.end), e.quote); assert.equal(e.callId, c.id); }
  assert.equal(assess(demoJob, c.evidence, demoRuntime.now()).issues.length, 0);
});
test('forged quotes, wrong types, invalid spans and secret text are rejected', () => {
  const result = fixtureResult(quoteTranscript());
  result.claims[0]!.quote = 'fabricated'; result.claims[1]!.value = { kind: 'quantity', value: 2 }; result.claims[2]!.end = 1;
  const accepted = ingest(call, result, demoRuntime.now(), []);
  assert.equal(accepted.evidence.length, 5); assert.ok(accepted.issues.includes('unverifiable_quote'));
  const sensitive: Result = { ...fixtureResult(quoteTranscript()), transcript: quoteTranscript() + '\n' + ['Bearer', 'unit-test-secret'].join(' ') };
  const safe = ingest(call, sensitive, demoRuntime.now(), []);
  assert.equal(safe.evidence.length, 0); assert.ok(safe.issues.includes('redaction_requires_review')); assert.ok(!safe.transcript.includes('unit-test-secret'));
});
test('contradictory claims never use last-write-wins', () => {
  const c = complete(); const prior = c.evidence.find(e => e.field === 'total_price')!;
  c.evidence.push({ ...prior, id: 'contradiction', value: { kind: 'money', minor: 100, currency: 'USD', basis: 'total_including_tax' } });
  const row = compare(demoJob, [c], demoRuntime.now())[0]!;
  assert.equal(row.confidence, 'conflicted'); assert.equal(row.totalMinor, undefined);
  assert.ok(followup(demoJob, [c], 'atlas', demoRuntime.now()).some(q => q.field === 'total_price' && q.prompt.includes('contradiction')));
});
test('correction can supersede only same-target same-field earlier evidence', () => {
  const previous = complete().evidence;
  const r = fixtureResult('Supplier: Warranty: Correction: 6 months'); r.claims[0]!.supersedes = [previous.find(e => e.field === 'warranty')!.id];
  assert.equal(ingest({ ...call, id: 'followup' }, r, demoRuntime.now(), previous).evidence.length, 1);
  r.claims[0]!.supersedes = [previous.find(e => e.field === 'model')!.id];
  assert.equal(ingest(call, r, demoRuntime.now(), previous).evidence.length, 0);
});
test('freshness and uncertainty are explicit, not invented probabilities', () => {
  const c = complete(); c.evidence[0]!.certainty = 'tentative';
  assert.equal(assess(demoJob, c.evidence, demoRuntime.now()).cells.find(c => c.field === 'availability')!.state, 'tentative');
  assert.equal(assess(demoJob, c.evidence, '2026-09-05T15:06:00Z').issues.length, 8);
  assert.equal(assess(demoJob, c.evidence, '2026-09-05T12:00:00Z').issues.length, 8);
});
test('missing facts plan targeted questions only', () => {
  const c = complete(); c.evidence = c.evidence.filter(e => e.field !== 'warranty');
  assert.deepEqual(followup(demoJob, [c], 'atlas', demoRuntime.now()).map(q => q.field), ['warranty']);
});
test('unstructured prose, unit prices and fuzzy times remain unknown', () => {
  assert.deepEqual(extractTranscript('Agent: Model: MX-240\nWe probably have some. About $50 each before tax. Ready after lunch.'), []);
  assert.equal(extractTranscript('Supplier: Total including tax: USD 1.25')[0]!.value.kind, 'money');
  assert.deepEqual(extractTranscript('AI: Exact model: ACME MX-240\nExact model: ACME MX-240'), []);
});
test('timestamped CALL-E BOT/USER dialogue preserves recipient-backed provenance', () => {
  const transcript = readFileSync(new URL('fixtures/calle-timestamped-transcript.txt', import.meta.url), 'utf8').trimEnd();
  const job = { ...demoJob, deadline: '2026-09-05T16:00:00+06:00', timezone: 'Asia/Dhaka' };
  const claims = extractTranscript(transcript, job);
  assert.deepEqual(claims.map(claim => claim.field).sort(), ['availability', 'fulfillment', 'model', 'quantity', 'ready_at', 'total_price', 'warranty']);
  for (const evidence of claims) {
    assert.equal(transcript.slice(evidence.start, evidence.end), evidence.quote);
    assert.match(evidence.quote, /\[\d\d:\d\d:\d\d\] USER:/);
  }
  assert.deepEqual(claims.find(claim => claim.field === 'availability')!.value, { kind: 'boolean', value: true });
  assert.deepEqual(claims.find(claim => claim.field === 'model')!.value, { kind: 'text', value: 'ACME MX-240' });
  assert.deepEqual(claims.find(claim => claim.field === 'quantity')!.value, { kind: 'quantity', value: 2 });
  assert.deepEqual(claims.find(claim => claim.field === 'total_price')!.value, { kind: 'money', currency: 'USD', minor: 20500, basis: 'total_including_tax' });
  assert.deepEqual(claims.find(claim => claim.field === 'fulfillment')!.value, { kind: 'text', value: 'pickup' });
  assert.deepEqual(claims.find(claim => claim.field === 'ready_at')!.value, { kind: 'instant_bound', latest: '2026-09-05T16:00:00+06:00' });
  assert.deepEqual(claims.find(claim => claim.field === 'warranty')!.value, { kind: 'text', value: 'none' });
  assert.match(claims.find(claim => claim.field === 'quantity')!.quote, /BOT: How many/);
  assert.match(claims.find(claim => claim.field === 'total_price')!.quote, /BOT: including tax and any fees/);
  assert.match(claims.find(claim => claim.field === 'fulfillment')!.quote, /BOT: Is pickup available/);
  assert.equal(claims.some(claim => claim.field === 'constraints'), false);
});
test('confirmed unavailable supplier does not receive pointless followups', () => {
  const c = complete(); c.evidence = c.evidence.filter(e => e.field === 'availability'); replace(c, 'availability', { kind: 'boolean', value: false });
  assert.deepEqual(followup(demoJob, [c], 'atlas', demoRuntime.now()), []);
});
test('canonical normalization preserves meaningful model punctuation', () => {
  assert.equal(canonical({ kind: 'text', value: '  Acme   MX-240 ' }), 'ACME MX-240');
  assert.notEqual(canonical({ kind: 'text', value: 'MX240' }), canonical({ kind: 'text', value: 'MX-240' }));
});
for (const [field, value, reason] of [
  ['availability', { kind: 'boolean', value: false }, 'not_available'],
  ['model', { kind: 'text', value: 'ACME MX-120' }, 'exact_model_mismatch'],
  ['quantity', { kind: 'quantity', value: 1 }, 'insufficient_quantity'],
  ['ready_at', { kind: 'instant', value: '2026-09-05T17:00:00Z' }, 'misses_deadline'],
  ['fulfillment', { kind: 'text', value: 'delivery' }, 'fulfillment_mismatch'],
] as const) test(`comparison enforces ${reason}`, () => {
  const c = complete(); replace(c, field, value); const row = compare(demoJob, [c], demoRuntime.now()).find(r => r.targetId === 'atlas')!;
  assert.equal(row.eligibility, 'does_not_meet'); assert.ok(row.reasons.includes(reason));
});
test('foreign currency is never converted or ranked as equivalent', () => {
  const c = complete(); replace(c, 'total_price', { kind: 'money', currency: 'EUR', minor: 1, basis: 'total_including_tax' });
  const row = compare(demoJob, [c], demoRuntime.now()).find(r => r.targetId === 'atlas')!;
  assert.equal(row.totalMinor, undefined); assert.equal(row.eligibility, 'needs_verification');
});
test('supplier constraints require human review', () => {
  const c = complete(); replace(c, 'constraints', { kind: 'text', value: 'advance payment required' });
  assert.equal(compare(demoJob, [c], demoRuntime.now()).find(r => r.targetId === 'atlas')!.eligibility, 'needs_verification');
});
test('repeated identical quotes do not inflate coverage', () => {
  const c = complete(); c.evidence = Array.from({ length: 20 }, (_, i) => ({ ...c.evidence[0]!, id: `copy-${i}` } as Evidence));
  assert.equal(compare(demoJob, [c], demoRuntime.now()).find(r => r.targetId === 'atlas')!.coverage, 1 / 8);
});
