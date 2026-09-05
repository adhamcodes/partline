import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CalleAdapter, type CliRunner } from '../src/adapters/calle.js';
import { mission002ContactRef, mission002Grant, mission002Job } from '../src/live-validation.js';
import { runJob } from '../src/orchestrator.js';
import { MemoryRunStore } from '../src/store.js';

const testPhone = '+12025550101';
const now = '2026-09-05T02:00:00Z';
const input = { region: 'US', language: 'English', timezone: 'America/New_York', deadline: '2026-09-05T16:00:00-04:00', now };
class FakeRunner implements CliRunner {
  readonly args: string[][] = [];
  constructor(private readonly replies: unknown[]) {}
  async run(args: string[]) { this.args.push(args); return this.replies.shift(); }
}

test('Mission 002 job is exactly one target, one call, no redial or follow-up', () => {
  const job = mission002Job(input);
  assert.equal(job.targets.length, 1);
  assert.deepEqual(job.policy, { concurrency: 1, maxCalls: 1, maxFollowupsPerTarget: 0, maxStartRetries: 0, maxPolls: 60, pollIntervalMs: 10000 });
  assert.equal(job.targets[0]!.contactRef, mission002ContactRef);
  assert.ok(!JSON.stringify(job).includes(testPhone));
  assert.match(job.request, /do not order, reserve, purchase, schedule, or make any commitment/i);
});

test('Mission 002 requires a future offset-qualified 16:00 deadline', () => {
  assert.throws(() => mission002Job({ ...input, deadline: '2026-09-05T16:00:00' }));
  assert.throws(() => mission002Job({ ...input, deadline: now }));
});

test('real adapter mapping makes one start submission and stores no number', async () => {
  const job = mission002Job(input);
  const grant = mission002Grant(job, testPhone);
  const runner = new FakeRunner([
    { ok: true, run_id: 'mission-run' },
    { ok: true, result: { structuredContent: { run_id: 'mission-run', status: 'COMPLETED', result: { transcript: 'Supplier: Availability: yes\nSupplier: The authorized destination is +1 (202) 555-0101' } } } },
  ]);
  const adapter = new CalleAdapter(runner, {
    enableLive: true,
    grant,
    now: () => now,
    resolvePhone: reference => reference === mission002ContactRef ? testPhone : '',
    redactionPhones: () => [testPhone],
  });
  const artifact = await runJob(job, adapter, new MemoryRunStore(), { now: () => now, sleep: async () => {} }, grant);
  assert.equal(runner.args.filter(args => args[0] === 'call' && args[1] === 'start').length, 1);
  assert.equal(runner.args.filter(args => args[0] === 'call' && args[1] === 'status').length, 1);
  assert.equal(artifact.calls.length, 1);
  assert.equal(artifact.calls[0]!.attempts, 1);
  assert.ok(!JSON.stringify(artifact).includes(testPhone));
  assert.ok(!JSON.stringify(artifact).includes('555-0101'));
  assert.match(artifact.calls[0]!.transcript ?? '', /REDACTED_PHONE/);
});

test('grant rejects a different destination before the CLI runs', async () => {
  const job = mission002Job(input);
  const grant = mission002Grant(job, testPhone);
  const runner = new FakeRunner([]);
  const adapter = new CalleAdapter(runner, { enableLive: true, grant, now: () => now, resolvePhone: () => '+12025550199' });
  await assert.rejects(adapter.start({ callId: 'mission002-live-beacon-0', job, target: job.targets[0]!, questions: job.questions, round: 0 }));
  assert.equal(runner.args.length, 0);
});
