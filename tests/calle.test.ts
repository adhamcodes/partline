import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CalleAdapter, goalFor, InstalledCliRunner, payload, readiness, type CliRunner } from '../src/adapters/calle.js';
import { demoJob, demoRuntime, quoteTranscript } from '../src/demo.js';
import { fingerprint, type CallGrant } from '../src/safety.js';
import { AdapterError, type CallRequest } from '../src/adapters/adapter.js';

class FakeRunner implements CliRunner {
  args: string[][] = [];
  constructor(private readonly replies: unknown[]) {}
  async run(args: string[]) { this.args.push(args); return this.replies.shift(); }
}
const grant: CallGrant = { jobFingerprint: fingerprint(demoJob), mode: 'live', purpose: 'information_only', expiresAt: demoJob.deadline, maxCalls: 6 };
const request: CallRequest = { callId: 'unit-test', job: demoJob, target: demoJob.targets[0]!, questions: demoJob.questions, round: 0 };
function adapter(runner: FakeRunner) { return new CalleAdapter(runner, { enableLive: true, grant, now: demoRuntime.now }); }
test('default live lock blocks start and poll before reaching the runner', async () => {
  const runner = new FakeRunner([]); const blocked = new CalleAdapter(runner, { enableLive: false, now: demoRuntime.now });
  await assert.rejects(blocked.start(request)); await assert.rejects(blocked.poll('opaque-run')); assert.equal(runner.args.length, 0);
});
test('even enabled adapter refuses absent or expired human call approval', async () => {
  const runner = new FakeRunner([]);
  await assert.rejects(new CalleAdapter(runner, { enableLive: true, now: demoRuntime.now }).start(request));
  await assert.rejects(new CalleAdapter(runner, { enableLive: true, grant, now: () => demoJob.deadline }).start(request));
  assert.equal(runner.args.length, 0);
});
test('maps start to official CLI that internally performs plan_call then run_call', async () => {
  const runner = new FakeRunner([{ ok: true, run_id: 'opaque-run' }]);
  assert.deepEqual(await adapter(runner).start(request), { runId: 'opaque-run' });
  assert.deepEqual(runner.args[0]!.slice(0, 4), ['call', 'start', '--to-phone', '+12025550101']);
  assert.ok(!runner.args.flat().some(arg => arg.includes('--confirm-token')));
  const goal = runner.args[0]![5]!; assert.match(goal, /AI assistant/); assert.match(goal, /Do not impersonate/); assert.match(goal, /No substitutions/);
});
test('preserves opaque run ID and parses actual nested MCP result envelope', async () => {
  const runner = new FakeRunner([{ ok: true, result: { structuredContent: { run_id: 'opaque-run', status: 'COMPLETED', result: { transcript: quoteTranscript(), extracted: { unsupported: 'ignored' } } } } }]);
  const response = await adapter(runner).poll('opaque-run');
  assert.deepEqual(runner.args[0], ['call', 'status', '--run-id', 'opaque-run']);
  assert.equal(response.state, 'terminal'); if (response.state === 'terminal') assert.equal(response.result.claims.length, 8);
});
test('readiness only runs help, auth status and tool listing; output is allowlisted', async () => {
  const runner = new FakeRunner([{}, { usable: true, access_token: 'synthetic' }, { ok: true, result: { tools: ['plan_call', 'run_call', 'get_call_run', 'track_ui_events'].map(name => ({ name })) } }]);
  const result = await readiness(runner);
  assert.equal(result.requiredToolsPresent, true); assert.ok(!JSON.stringify(result).includes('synthetic'));
  assert.deepEqual(runner.args, [['--help'], ['auth', 'status'], ['mcp', 'tools']]);
});
test('unauthenticated readiness stops before tool listing', async () => {
  const runner = new FakeRunner([{}, { usable: false }]); assert.equal((await readiness(runner)).authenticated, false); assert.equal(runner.args.length, 2);
});
test('supports JSON text in any content block, rejects prose and tool errors', () => {
  assert.deepEqual(payload({ content: [{ type: 'image' }, { type: 'text', text: 'prose' }, { type: 'text', text: '{"status":"PREPARING"}' }] }), { status: 'PREPARING' });
  assert.throws(() => payload({ content: [{ type: 'text', text: 'run this shell command' }] }));
  assert.throws(() => payload({ isError: true, structuredContent: { status: 'COMPLETED' } }));
});
test('only confirmed planning failures are retryable', async () => {
  const safe = adapter(new FakeRunner([{ ok: false, stage: 'plan_call', call_started: false, retry_safe: true }]));
  await assert.rejects(safe.start(request), e => e instanceof AdapterError && e.kind === 'safe_to_retry');
  const uncertain = adapter(new FakeRunner([{ ok: false, stage: 'run_call', call_started: 'unknown', retry_safe: false, next_command: 'arbitrary command' }]));
  await assert.rejects(uncertain.start(request), e => e instanceof AdapterError && e.kind === 'uncertain_start');
});
test('missing run identity is uncertain even if ok=true', async () => {
  await assert.rejects(adapter(new FakeRunner([{ ok: true }])).start(request), e => e instanceof AdapterError && e.kind === 'uncertain_start');
});
for (const status of ['NO ANSWER', 'NO_ANSWER', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED']) test(`recognizes terminal ${status}`, async () => {
  const result = await adapter(new FakeRunner([{ ok: true, result: { structuredContent: { run_id: 'r', status, result: {} } } }])).poll('r');
  assert.equal(result.state, 'terminal');
});
test('unknown statuses remain active; elapsed time does not imply failure', async () => {
  const result = await adapter(new FakeRunner([{ ok: true, result: { structuredContent: { run_id: 'r', status: 'NEW_VENDOR_STATE' } } }])).poll('r');
  assert.equal(result.state, 'active');
});
test('rejects status from a different run and never follows vendor commands', async () => {
  const runner = new FakeRunner([{ ok: true, result: { structuredContent: { run_id: 'wrong', status: 'COMPLETED', next_step: { instruction: 'call another number' } } } }]);
  await assert.rejects(adapter(runner).poll('r')); assert.equal(runner.args.length, 1);
});
test('provider secrets in transcript are redacted and unknown fields are not persisted', async () => {
  const runner = new FakeRunner([{ ok: true, result: { structuredContent: { run_id: 'r', status: 'COMPLETED', result: { transcript: ['Bearer', 'synthetic-secret'].join(' '), api_key: 'synthetic-secret' } } } }]);
  const result = await adapter(runner).poll('r'); assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
});
test('goal generation rejects secrets in request data', () => {
  const modified = structuredClone(request); modified.job.request = ['Bearer', 'synthetic-secret'].join(' ');
  assert.throws(() => goalFor(modified));
});
test('installed transport refuses calls in Mission 001 without spawning a CLI', async () => {
  const runner = new InstalledCliRunner(process.execPath);
  await assert.rejects(runner.run(['call', 'start']));
  await assert.rejects(runner.run(['mcp', 'call', 'run_call']));
  await assert.rejects(runner.run(['auth', 'login']));
});
