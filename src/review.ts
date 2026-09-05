import { z } from 'zod';
import { Artifact, Claim, Id, Instant, type Artifact as RunArtifact } from './domain.js';
import { ingest } from './evidence.js';
import { compare } from './comparison.js';
import { assertNoSecrets } from './safety.js';

export const EvidenceReview = z.object({ callId: Id, reviewer: z.string().trim().min(1).max(100), reviewedAt: Instant, claims: z.array(Claim).min(1).max(100) }).strict();
/** Operator annotations bridge unsupported vendor transcript formats.
 * Quote spans are checked mechanically; semantic correctness remains the reviewer's responsibility.
 */
export function reviewEvidence(input: RunArtifact, inputReview: unknown): RunArtifact {
  const artifact = Artifact.parse(input); const review = EvidenceReview.parse(inputReview); assertNoSecrets(review);
  const call = artifact.calls.find(c => c.id === review.callId);
  if (!call || call.state !== 'completed' || call.terminal !== 'COMPLETED' || !call.transcript || !call.startedAt) throw new Error('Only completed calls with transcripts can be reviewed');
  if (Date.parse(review.reviewedAt) < Date.parse(call.startedAt)) throw new Error('Review predates call');
  const accepted = ingest(call, { status: 'COMPLETED', transcript: call.transcript, claims: review.claims, source: 'human_review' }, call.evidence[0]?.observedAt ?? call.startedAt, artifact.calls.flatMap(c => c.evidence));
  if (accepted.evidence.length !== review.claims.length || accepted.issues.length) throw new Error('Evidence review contains unverifiable claims');
  const offset = call.evidence.length;
  const appended = accepted.evidence.map((e, i) => ({ ...e, id: `${call.id}-h${offset + i}` }));
  call.evidence.push(...appended);
  artifact.events.push({ sequence: artifact.events.length + 1, type: 'human_evidence_review', callId: call.id });
  artifact.evidenceReviews.push({ callId: call.id, reviewer: review.reviewer, reviewedAt: review.reviewedAt, evidenceIds: appended.map(e => e.id) });
  artifact.evaluatedAt = review.reviewedAt;
  artifact.comparison = compare(artifact.job, artifact.calls, review.reviewedAt);
  artifact.decision = { state: 'pending', executable: false };
  assertNoSecrets(artifact); return artifact;
}
