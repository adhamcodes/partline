import { Artifact, Job, Result, type Call, type Question } from './domain.js';
import { type CallAdapter, AdapterError } from './adapters/adapter.js';
import { compare, followup } from './comparison.js';
import { ingest } from './evidence.js';
import { assertNoSecrets, checkGrant, fingerprint, type CallGrant } from './safety.js';
import type { RunStore } from './store.js';

export type Runtime = { now(): string; sleep(ms: number): Promise<void> };
export async function runJob(input: Job, adapter: CallAdapter, store: RunStore, clock: Runtime, grant?: CallGrant): Promise<Artifact> {
  const job = Job.parse(input); assertNoSecrets(job);
  checkGrant(job, grant, adapter.mode, clock.now());
  const release = await store.acquire(job.id);
  try {
    const prior = await store.load(job.id);
    if (prior && (fingerprint(prior.job) !== fingerprint(job) || prior.mode !== adapter.mode)) throw new Error('Existing run has different scope');
    const artifact: Artifact = prior ?? { schemaVersion: 1, mode: adapter.mode, job, evaluatedAt: clock.now(), state: 'running', calls: [], comparison: [], events: [], evidenceReviews: [], decision: { state: 'pending', executable: false } };
    if (prior && prior.state === 'awaiting_human_decision') {
      artifact.comparison = compare(job, artifact.calls, clock.now()); artifact.evaluatedAt = clock.now();
      await store.save(artifact); return artifact;
    }
    artifact.state = 'running';
    const event = (type: string, call?: Call) => artifact.events.push({ sequence: artifact.events.length + 1, type, ...(call ? { callId: call.id } : {}) });
    let persistenceFailed = false;
    const save = async () => {
      if (persistenceFailed) throw new Error('Persistence unavailable');
      try { await store.save(artifact); } catch { persistenceFailed = true; throw new Error('Checkpoint failed'); }
    };
    const add = (targetId: string, round: number, questions: Question[]): Call => {
      const call: Call = { id: `${job.id}-${targetId}-${round}`, targetId, round, questions, state: 'queued', attempts: 0, polls: 0, evidence: [], issues: [] };
      artifact.calls.push(call); event(round === 0 ? 'target_queued' : 'followup_planned', call); return call;
    };
    if (!prior) { job.targets.forEach(t => add(t.id, 0, job.questions)); await save(); }
    for (const call of artifact.calls) {
      if (call.state === 'dispatching') { call.state = 'uncertain'; call.failure = 'uncertain_start'; event('interrupted_dispatch_requires_review', call); }
      if (call.state === 'monitoring_paused' && call.runId) { call.state = 'active'; event('monitoring_resumed', call); }
    }
    await save();
    // Reservation count is updated synchronously before any await. It includes uncertain starts.
    let reserved = artifact.calls.filter(c => c.attempts > 0).length;
    const processCall = async (call: Call): Promise<void> => {
      if (call.state === 'queued') {
        if (reserved >= Math.min(job.policy.maxCalls, grant!.maxCalls) || Date.parse(clock.now()) >= Date.parse(job.deadline)) {
          call.state = 'blocked'; call.failure = 'policy_blocked'; event('budget_or_deadline_blocked', call); await save(); return;
        }
        try { checkGrant(job, grant, adapter.mode, clock.now()); } catch { call.state = 'blocked'; call.failure = 'policy_blocked'; await save(); return; }
        reserved++;
        for (let retry = 0; retry <= job.policy.maxStartRetries; retry++) {
          if (persistenceFailed) throw new Error('Dispatch halted after checkpoint failure');
          try { checkGrant(job, grant, adapter.mode, clock.now()); } catch { call.state = 'blocked'; call.failure = 'policy_blocked'; await save(); return; }
          call.state = 'dispatching'; call.attempts++; event('dispatch_intent_saved', call); await save();
          let started: { runId: string };
          try {
            started = await adapter.start({ callId: call.id, job, target: job.targets.find(t => t.id === call.targetId)!, questions: call.questions, round: call.round });
            if (typeof started.runId !== 'string' || !started.runId.length) throw new AdapterError('uncertain_start');
            assertNoSecrets(started.runId);
          } catch (error) {
            const kind = error instanceof AdapterError ? error.kind : 'uncertain_start';
            if (kind === 'safe_to_retry' && retry < job.policy.maxStartRetries) { event('safe_prestart_retry', call); await save(); await clock.sleep(250 * 2 ** retry); continue; }
            call.state = kind === 'uncertain_start' || !(error instanceof AdapterError) ? 'uncertain' : 'failed';
            call.failure = call.state === 'uncertain' ? 'uncertain_start' : kind === 'policy_blocked' ? 'policy_blocked' : 'start_rejected';
            event(call.failure, call); await save(); return;
          }
          call.runId = started.runId; call.startedAt = clock.now(); call.state = 'active'; event('run_identity_saved', call); await save(); break;
        }
      }
      if (call.state !== 'active' || !call.runId) return;
      // CLI start already performs a best-effort first status query internally.
      // Subsequent application polling follows the documented initial grace period.
      if (adapter.mode === 'live' && call.polls === 0) await clock.sleep(60000);
      for (let poll = 0; poll < job.policy.maxPolls; poll++) {
        if (poll > 0) await clock.sleep(adapter.mode === 'live' ? Math.max(10000, job.policy.pollIntervalMs) : job.policy.pollIntervalMs);
        call.polls++;
        let outcome;
        try { outcome = await adapter.poll(call.runId); }
        catch { event('status_read_failed', call); await save(); continue; }
        if (outcome.state === 'active') { event('call_in_progress', call); await save(); continue; }
        const parsed = Result.safeParse(outcome.result);
        if (!parsed.success) { call.state = 'monitoring_paused'; call.failure = 'invalid_response'; event('invalid_result_requires_review', call); await save(); return; }
        call.terminal = parsed.data.status;
        call.state = parsed.data.status === 'COMPLETED' ? 'completed' : 'failed';
        if (call.state === 'failed') call.failure = 'terminal_failure';
        // Use the saved start time conservatively; delayed retrieval must not refresh old stock claims.
        const accepted = ingest(call, { ...parsed.data, claims: call.state === 'completed' ? parsed.data.claims : [] }, call.startedAt ?? clock.now(), artifact.calls.flatMap(c => c.evidence));
        Object.assign(call, accepted); event('call_terminal', call); await save(); return;
      }
      call.state = 'monitoring_paused'; call.failure = 'poll_limit'; event('monitoring_paused_not_cancelled', call); await save();
    };
    let cursor = 0;
    const worker = async () => {
      while (!persistenceFailed && cursor < job.targets.length) {
        const target = job.targets[cursor++]!;
        const calls = artifact.calls.filter(c => c.targetId === target.id).sort((a, b) => a.round - b.round);
        let current = calls.at(-1)!;
        await processCall(current);
        while (current.state === 'completed' && current.round < job.policy.maxFollowupsPerTarget) {
          const questions = followup(job, artifact.calls, target.id, clock.now());
          if (!questions.length) break;
          // No-answer, decline, and uncertain outcomes never cause an automatic redial.
          current = add(target.id, current.round + 1, questions); await save(); await processCall(current);
        }
      }
    };
    // Wait for every worker even if persistence fails; never release a lock while dispatch is in flight.
    const workers = await Promise.allSettled(Array.from({ length: Math.min(job.policy.concurrency, job.targets.length) }, worker));
    if (workers.some(result => result.status === 'rejected')) throw new Error('Run checkpoint failed; operator review required');
    artifact.comparison = compare(job, artifact.calls, clock.now());
    artifact.evaluatedAt = clock.now();
    artifact.state = artifact.calls.some(c => ['uncertain', 'monitoring_paused'].includes(c.state)) ? 'needs_operator_review' : 'awaiting_human_decision';
    event('comparison_ready'); await save(); return artifact;
  } finally { await release(); }
}
