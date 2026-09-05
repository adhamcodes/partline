import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoJob, demoRuntime, fixtureResult, MockAdapter, quoteTranscript } from '../src/demo.js';
import { runJob } from '../src/orchestrator.js';
import { MemoryRunStore } from '../src/store.js';
import { simulationGrant } from '../src/safety.js';
import { AdapterError, type CallAdapter, type CallRequest, type PollResult } from '../src/adapters/adapter.js';
import { approveManualAction } from '../src/decision.js';
import { report } from '../src/report.js';
import type { Job } from '../src/domain.js';

const solo = (): Job => { const j = structuredClone(demoJob); j.targets = [j.targets[0]!]; return j; };
const execute = (job = demoJob, adapter: CallAdapter = new MockAdapter(), store = new MemoryRunStore()) => runJob(job, adapter, store, demoRuntime, simulationGrant(job));
class Controlled implements CallAdapter {
  readonly mode = 'mock' as const;
  starts = 0; polls = 0;
  startFn: (r: CallRequest) => Promise<{ runId: string }> = async r => ({ runId: `test-${r.callId}` });
  pollFn: (id: string) => Promise<PollResult> = async () => ({ state: 'terminal', result: fixtureResult(quoteTranscript()) });
  async start(r: CallRequest) { this.starts++; return this.startFn(r); }
  async poll(id: string) { this.polls++; return this.pollFn(id); }
}
test('full demo coordinates four suppliers, fixes contradiction, tolerates no answer', async () => {
  const adapter = new MockAdapter(); const result = await execute(demoJob, adapter);
  assert.equal(result.calls.length, 5); assert.equal(adapter.starts.length, 6);
  assert.equal(result.state, 'awaiting_human_decision');
  assert.equal(result.comparison[0]!.targetId, 'beacon'); assert.equal(result.comparison[0]!.totalMinor, 20500);
  assert.equal(result.comparison[0]!.eligibility, 'meets_requirements');
  assert.equal(result.calls.find(c => c.targetId === 'cedar')!.terminal, 'NO_ANSWER');
  assert.equal(result.comparison.find(r => r.targetId === 'delta')!.eligibility, 'does_not_meet');
  assert.deepEqual(result.calls.find(c => c.round === 1)!.questions.map(q => q.field).sort(), ['total_price', 'warranty']);
  assert.equal(result.decision.state, 'pending'); assert.equal(result.decision.executable, false);
  const brief = report(result); assert.match(brief, /SIMULATION/); assert.match(brief, /205.00/); assert.match(brief, /corrects/);
});
test('deterministic replay produces byte-identical artifacts', async () => {
  assert.equal(JSON.stringify(await execute()), JSON.stringify(await execute()));
});
test('completed job replay does not dispatch again', async () => {
  const store = new MemoryRunStore(); await execute(demoJob, new MockAdapter(), store);
  const adapter = new Controlled(); await execute(demoJob, adapter, store); assert.equal(adapter.starts, 0); assert.equal(adapter.polls, 0);
});
test('hard call budget blocks targets and followups without extra dialing', async () => {
  const j = structuredClone(demoJob); j.policy.maxCalls = 1;
  const adapter = new Controlled(); const result = await execute(j, adapter);
  assert.equal(adapter.starts, 1); assert.equal(result.calls.filter(c => c.state === 'blocked').length, 3);
});
test('safe planning retries are bounded', async () => {
  const adapter = new Controlled(); adapter.startFn = async () => { throw new AdapterError('safe_to_retry'); };
  const result = await execute(solo(), adapter); assert.equal(adapter.starts, 2); assert.equal(result.calls[0]!.state, 'failed');
});
test('uncertain start is never retried, including after restart', async () => {
  const adapter = new Controlled(); adapter.startFn = async () => { throw new AdapterError('uncertain_start'); };
  const store = new MemoryRunStore(); const j = solo();
  const result = await execute(j, adapter, store); assert.equal(result.state, 'needs_operator_review');
  await execute(j, adapter, store); assert.equal(adapter.starts, 1);
});
test('unknown native start errors are redacted and treated as uncertain', async () => {
  const adapter = new Controlled(); adapter.startFn = async () => { throw new Error(['Bearer', 'synthetic-value'].join(' ')); };
  const result = await execute(solo(), adapter); assert.equal(result.calls[0]!.state, 'uncertain'); assert.ok(!JSON.stringify(result).includes('synthetic-value'));
});
test('monitoring timeout preserves run identity and resumes polling only', async () => {
  const j = solo(); j.policy.maxPolls = 2; const store = new MemoryRunStore(); const adapter = new Controlled();
  adapter.pollFn = async () => ({ state: 'active' });
  const paused = await execute(j, adapter, store); assert.equal(paused.calls[0]!.state, 'monitoring_paused'); assert.ok(paused.calls[0]!.runId);
  adapter.pollFn = async () => ({ state: 'terminal', result: fixtureResult(quoteTranscript()) });
  const resumed = await execute(j, adapter, store); assert.equal(adapter.starts, 1); assert.equal(resumed.calls[0]!.state, 'completed');
});
test('transient status failures only retry reads', async () => {
  const adapter = new Controlled(); adapter.pollFn = async () => { if (adapter.polls < 3) throw new Error('transient'); return { state: 'terminal', result: fixtureResult(quoteTranscript()) }; };
  const result = await execute(solo(), adapter); assert.equal(adapter.starts, 1); assert.equal(adapter.polls, 3); assert.equal(result.calls[0]!.state, 'completed');
});
test('crash after dispatch intent does not redial on resume', async () => {
  const j = solo(); const store = new MemoryRunStore(); const initial = await execute(j);
  initial.calls[0]!.state = 'dispatching'; delete initial.calls[0]!.runId; initial.state = 'running'; await store.save(initial);
  const adapter = new Controlled(); const result = await execute(j, adapter, store);
  assert.equal(adapter.starts, 0); assert.equal(result.calls[0]!.state, 'uncertain');
});
test('no-answer and decline do not trigger redials or followups', async () => {
  for (const status of ['NO_ANSWER', 'DECLINED', 'VOICEMAIL'] as const) {
    const adapter = new Controlled(); adapter.pollFn = async () => ({ state: 'terminal', result: { ...fixtureResult(quoteTranscript()), status } });
    const result = await execute(solo(), adapter); assert.equal(adapter.starts, 1); assert.equal(result.calls.length, 1); assert.equal(result.calls[0]!.evidence.length, 0);
  }
});
test('persistent missing answers exhaust followups exactly once', async () => {
  const adapter = new Controlled(); adapter.pollFn = async () => ({ state: 'terminal', result: fixtureResult('Supplier: I do not know.') });
  const result = await execute(solo(), adapter); assert.equal(adapter.starts, 2); assert.equal(result.comparison[0]!.coverage, 0);
});
test('workers enforce max concurrent starts', async () => {
  let active = 0; let peak = 0; const adapter = new Controlled();
  adapter.startFn = async r => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); return { runId: r.callId }; };
  adapter.pollFn = async () => { active--; return { state: 'terminal', result: fixtureResult(quoteTranscript()) }; };
  const j = structuredClone(demoJob); await execute(j, adapter); assert.equal(peak, 2); assert.equal(active, 0);
});
test('approval is required before any dispatch and rejects changed jobs', async () => {
  const adapter = new Controlled(); const store = new MemoryRunStore();
  await assert.rejects(runJob(demoJob, adapter, store, demoRuntime)); assert.equal(adapter.starts, 0);
  await execute(demoJob, adapter, store); const changed = structuredClone(demoJob); changed.exactModel = 'DIFFERENT';
  await assert.rejects(execute(changed, adapter, store), /different scope/);
});
test('manual decision requires supported fresh evidence and never executes anything', async () => {
  const result = await execute();
  assert.throws(() => approveManualAction(result, 'delta', 'Operator', demoRuntime.now()));
  assert.throws(() => approveManualAction(result, 'beacon', '', demoRuntime.now()));
  assert.throws(() => approveManualAction(result, 'beacon', 'Operator', '2026-09-05T15:30:00Z'));
  assert.throws(() => approveManualAction(result, 'beacon', 'Operator', '2026-09-05T17:00:00Z'));
  const approved = approveManualAction(result, 'beacon', 'Operator', demoRuntime.now());
  assert.equal(approved.decision.state, 'approved_for_manual_action'); assert.equal(approved.decision.executable, false); assert.equal(result.decision.state, 'pending');
});
test('checkpoint failure before dispatch prevents outbound work', async () => {
  class BrokenStore extends MemoryRunStore {
    override async save(): Promise<void> { throw new Error('disk unavailable'); }
  }
  const adapter = new Controlled(); await assert.rejects(execute(solo(), adapter, new BrokenStore())); assert.equal(adapter.starts, 0);
});
test('run identity persistence failure leaves dispatch intent for safe recovery', async () => {
  class FailingIdentityStore extends MemoryRunStore {
    override async save(artifact: import('../src/domain.js').Artifact): Promise<void> {
      if (artifact.calls.some(c => c.runId)) throw new Error('disk full');
      return super.save(artifact);
    }
  }
  const j = solo(); const store = new FailingIdentityStore(); const adapter = new Controlled();
  await assert.rejects(execute(j, adapter, store), /checkpoint failed/);
  const checkpoint = await store.load(j.id); assert.equal(checkpoint!.calls[0]!.state, 'dispatching');
  await execute(j, adapter, store); assert.equal(adapter.starts, 1);
});
test('grant expiring during safe retry stops dispatch', async () => {
  const j = solo(); const adapter = new Controlled(); let now = demoRuntime.now();
  adapter.startFn = async () => { throw new AdapterError('safe_to_retry'); };
  const result = await runJob(j, adapter, new MemoryRunStore(), { now: () => now, sleep: async () => { now = j.deadline; } }, simulationGrant(j));
  assert.equal(adapter.starts, 1); assert.equal(result.calls[0]!.state, 'blocked');
});
