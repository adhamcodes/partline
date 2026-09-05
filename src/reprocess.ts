import { Artifact, type Artifact as RunArtifact, type Evidence } from './domain.js';
import { compare } from './comparison.js';
import { extractTranscript, ingest } from './evidence.js';

/** Rebuild parser-owned evidence from already persisted transcripts. Never calls an adapter. */
export function reprocessTranscripts(input: RunArtifact): RunArtifact {
  const artifact = structuredClone(Artifact.parse(input));
  for (const call of artifact.calls) {
    if (call.state !== 'completed' || call.terminal !== 'COMPLETED' || !call.transcript) continue;
    const retained = call.evidence.filter(evidence => evidence.source !== 'transcript_parser');
    const previous: Evidence[] = artifact.calls.flatMap(other => other.id === call.id ? retained : other.evidence);
    const accepted = ingest(call, {
      status: 'COMPLETED',
      transcript: call.transcript,
      claims: extractTranscript(call.transcript, artifact.job),
      source: 'transcript_parser',
    }, call.startedAt ?? artifact.evaluatedAt, previous);
    call.transcript = accepted.transcript;
    call.evidence = [...retained, ...accepted.evidence];
    call.issues = accepted.issues;
    if (!artifact.events.some(event => event.type === 'transcript_reprocessed' && event.callId === call.id)) artifact.events.push({ sequence: artifact.events.length + 1, type: 'transcript_reprocessed', callId: call.id });
  }
  artifact.comparison = compare(artifact.job, artifact.calls, artifact.evaluatedAt);
  return Artifact.parse(artifact);
}
