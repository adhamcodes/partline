import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceReview, reviewEvidence } from '../src/review.js';
import { runJob } from '../src/orchestrator.js';
import { demoJob, demoRuntime, MockAdapter } from '../src/demo.js';
import { MemoryRunStore } from '../src/store.js';
import { simulationGrant } from '../src/safety.js';

test('operator review retains provenance and cannot invent a transcript quote', async () => {
  const artifact = await runJob(demoJob, new MockAdapter(), new MemoryRunStore(), demoRuntime, simulationGrant(demoJob));
  const call = artifact.calls[0]!; const e = call.evidence[0]!;
  const review = EvidenceReview.parse({ callId: call.id, reviewer: 'Operator', reviewedAt: demoRuntime.now(), claims: [{ field: e.field, value: e.value, quote: e.quote, start: e.start, end: e.end, certainty: 'explicit' }] });
  const result = reviewEvidence(artifact, review);
  assert.equal(result.evidenceReviews.length, 1); assert.equal(result.calls[0]!.evidence.at(-1)!.source, 'human_review');
  assert.equal(result.calls[0]!.evidence.at(-1)!.observedAt, e.observedAt);
  review.claims[0]!.quote = 'invented'; assert.throws(() => reviewEvidence(artifact, review));
});
test('human review cannot make stale evidence fresh', async () => {
  const artifact = await runJob(demoJob, new MockAdapter(), new MemoryRunStore(), demoRuntime, simulationGrant(demoJob));
  const call = artifact.calls[0]!; const e = call.evidence[0]!;
  const result = reviewEvidence(artifact, { callId: call.id, reviewer: 'Operator', reviewedAt: '2026-09-05T15:30:00Z', claims: [{ field: e.field, value: e.value, quote: e.quote, start: e.start, end: e.end, certainty: 'explicit' }] });
  assert.equal(result.comparison.find(row => row.targetId === call.targetId)!.coverage, 0);
});
