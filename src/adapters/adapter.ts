import type { Job, Question, Result, Target } from '../domain.js';

export type CallRequest = { callId: string; job: Job; target: Target; questions: Question[]; round: number };
export type PollResult = { state: 'active' } | { state: 'terminal'; result: Result };
export class AdapterError extends Error {
  constructor(public readonly kind: 'safe_to_retry' | 'uncertain_start' | 'invalid_response' | 'policy_blocked' | 'poll_failed') {
    super(kind); this.name = 'AdapterError';
  }
}
export interface CallAdapter {
  readonly mode: 'mock' | 'live';
  start(request: CallRequest): Promise<{ runId: string }>;
  poll(runId: string): Promise<PollResult>;
}
