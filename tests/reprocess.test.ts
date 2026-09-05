import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Artifact } from '../src/domain.js';
import { mission002Job } from '../src/live-validation.js';
import { reprocessTranscripts } from '../src/reprocess.js';

const transcript = readFileSync(new URL('fixtures/calle-timestamped-transcript.txt', import.meta.url), 'utf8').trimEnd();
const now = '2026-09-05T02:00:00Z';

test('existing Mission 002 transcript replays locally without adding a call', () => {
  const job = mission002Job({ region: 'BD', language: 'English', timezone: 'Asia/Dhaka', deadline: '2026-09-05T16:00:00+06:00', now });
  const artifact = Artifact.parse({
    schemaVersion: 1,
    mode: 'live',
    job,
    evaluatedAt: '2026-09-05T02:05:00Z',
    state: 'awaiting_human_decision',
    calls: [{ id: 'mission002-live-beacon-0', targetId: 'beacon', round: 0, questions: job.questions, state: 'completed', runId: 'opaque-test-run', startedAt: now, attempts: 1, polls: 3, terminal: 'COMPLETED', transcript, evidence: [], issues: [] }],
    comparison: [],
    events: [{ sequence: 1, type: 'call_terminal', callId: 'mission002-live-beacon-0' }],
    evidenceReviews: [],
    decision: { state: 'pending', executable: false },
  });
  const replayed = reprocessTranscripts(artifact);
  assert.equal(replayed.calls.length, 1);
  assert.equal(replayed.calls[0]!.attempts, 1);
  assert.equal(replayed.calls[0]!.evidence.length, 7);
  assert.equal(replayed.comparison[0]!.coverage, 7 / 8);
  assert.equal(replayed.comparison[0]!.eligibility, 'needs_verification');
  assert.deepEqual(replayed.comparison[0]!.reasons, ['constraints: missing']);
  assert.equal(replayed.comparison[0]!.readyBy, '2026-09-05T16:00:00+06:00');
  assert.equal(replayed.events.at(-1)!.type, 'transcript_reprocessed');
  assert.deepEqual(reprocessTranscripts(replayed), replayed);
});
