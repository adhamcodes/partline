import { Artifact, type Artifact as RunArtifact } from './domain.js';
import { compare } from './comparison.js';
import { assertNoSecrets } from './safety.js';

export function approveManualAction(input: RunArtifact, targetId: string, reviewer: string, at: string): RunArtifact {
  const artifact = Artifact.parse(input);
  if (artifact.state !== 'awaiting_human_decision' || !reviewer.trim() || reviewer.length > 100 || !Number.isFinite(Date.parse(at))) throw new Error('Human decision unavailable');
  if (Date.parse(at) >= Date.parse(artifact.job.deadline)) throw new Error('Deadline has passed; reverify availability');
  const current = compare(artifact.job, artifact.calls, at);
  if (current.find(c => c.targetId === targetId)?.eligibility !== 'meets_requirements') throw new Error('Target requires verification or does not meet requirements');
  artifact.comparison = current;
  artifact.evaluatedAt = at;
  artifact.decision = { state: 'approved_for_manual_action', targetId, reviewer, approvedAt: at, executable: false };
  assertNoSecrets(artifact);
  return artifact;
}
