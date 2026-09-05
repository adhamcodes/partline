import { Job, type Job as SourcingJob } from './domain.js';
import { demoJob } from './demo.js';
import { contactFingerprint, fingerprint, type CallGrant } from './safety.js';

export const mission002Approval = 'MISSION-002-ONE-CALL';
export const mission002ContactRef = 'ephemeral:mission002-recipient';
export const mission002RunId = 'mission002-live';

export type Mission002Input = {
  region: string;
  language: string;
  timezone: string;
  deadline: string;
  now: string;
};

export function mission002Job(input: Mission002Input): SourcingJob {
  if (!/^\d{4}-\d{2}-\d{2}T16:00:00(?:Z|[+-]\d{2}:\d{2})$/.test(input.deadline)) throw new Error('Mission 002 deadline must be an offset-qualified 16:00 timestamp');
  if (Date.parse(input.deadline) <= Date.parse(input.now)) throw new Error('Mission 002 deadline has passed');
  return Job.parse({
    id: mission002RunId,
    request: 'Role-play test only: We need two ACME MX-240 contactors for pickup today before 16:00. Exact model only. Collect information only; do not order, reserve, purchase, schedule, or make any commitment.',
    exactModel: 'ACME MX-240',
    quantity: 2,
    currency: 'USD',
    requiredFulfillment: 'pickup',
    createdAt: input.now,
    deadline: input.deadline,
    timezone: input.timezone,
    maxAgeMinutes: 60,
    targets: [{ id: 'beacon', name: 'Beacon Supply (consenting role-play)', contactRef: mission002ContactRef, region: input.region.toUpperCase(), language: input.language }],
    questions: structuredClone(demoJob.questions),
    policy: { concurrency: 1, maxCalls: 1, maxFollowupsPerTarget: 0, maxStartRetries: 0, maxPolls: 60, pollIntervalMs: 10000 },
  });
}

export function mission002Grant(job: SourcingJob, phone: string): CallGrant {
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Phone must be E.164');
  return Object.freeze({
    jobFingerprint: fingerprint(job),
    contactFingerprints: { beacon: contactFingerprint(phone) },
    mode: 'live',
    purpose: 'information_only',
    expiresAt: job.deadline,
    maxCalls: 1,
  });
}
