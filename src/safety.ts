import { createHash } from 'node:crypto';
import type { Job } from './domain.js';

// Values, not just secret-shaped keys, must be checked before output or storage.
export function redact(text: string): string {
  return text
    .replace(/https?:\/\/[^\s<>"']+/gi, '[REDACTED_URL]')
    .replace(/\bBearer\s+[^\s,;"']+/gi, '[REDACTED_CREDENTIAL]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_CREDENTIAL]')
    .replace(/\b(?:access[_ -]?token|refresh[_ -]?token|confirm[_ -]?token|api[_ -]?key|authorization[_ -]?code|client[_ -]?secret|password)\s*[=:]\s*["']?[^\s,"';]+/gi, '[REDACTED_CREDENTIAL]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|calle_live_[A-Za-z0-9_-]+)\b/g, '[REDACTED_CREDENTIAL]');
}
export function assertNoSecrets(value: unknown): void {
  if (typeof value === 'string' && redact(value) !== value) throw new Error('Sensitive content rejected');
  if (Array.isArray(value)) value.forEach(assertNoSecrets);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (/^(?:access_token|refresh_token|confirm_token|authorization|api_key|callback_url|login_url|password|client_secret)$/i.test(key)) throw new Error('Sensitive field rejected');
    assertNoSecrets(item);
  }
}
export const fingerprint = (job: Job): string => createHash('sha256').update(JSON.stringify(job)).digest('hex');
export type CallGrant = Readonly<{ jobFingerprint: string; mode: 'mock' | 'live'; purpose: 'information_only'; expiresAt: string; maxCalls: number }>;
export function checkGrant(job: Job, grant: CallGrant | undefined, mode: 'mock' | 'live', now: string): void {
  if (!grant || grant.mode !== mode || grant.purpose !== 'information_only' || grant.jobFingerprint !== fingerprint(job) || Date.parse(grant.expiresAt) <= Date.parse(now) || !Number.isFinite(Date.parse(grant.expiresAt)) || grant.maxCalls < job.policy.maxCalls) throw new Error('Call approval absent, expired, or out of scope');
}
export function simulationGrant(job: Job): CallGrant {
  return Object.freeze({ jobFingerprint: fingerprint(job), mode: 'mock', purpose: 'information_only', expiresAt: job.deadline, maxCalls: job.policy.maxCalls });
}
