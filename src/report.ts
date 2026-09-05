import type { Artifact, Value } from './domain.js';
import { assertNoSecrets } from './safety.js';

const valueText = (value?: Value): string => {
  if (!value) return 'unknown';
  if (value.kind === 'money') return `${value.currency} ${(value.minor / 100).toFixed(2)} total incl. tax`;
  if (value.kind === 'instant_bound') return `on or before ${value.latest}`;
  return String(value.value);
};
const plain = (s: string) => s.replace(/[|\r\n\x00-\x1f\x7f]/g, ' ').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('[', '&#91;').replaceAll(']', '&#93;');
export function report(artifact: Artifact): string {
  assertNoSecrets(artifact);
  const lines = [
    '# PARTLINE / decision brief', '',
    artifact.mode === 'mock' ? '**SIMULATION — fictional suppliers and transcripts. No calls or stock verification occurred.**' : '**LIVE EVIDENCE — supplier claims, not independently verified inventory.**', '',
    plain(artifact.job.request), '',
    `State: ${artifact.state}. Decision: ${artifact.decision.state}. Consequential execution: disabled.`,
    `Evidence evaluated at ${artifact.evaluatedAt}; recheck before acting.`, '',
    '| Supplier | Result | Total | Ready | Evidence coverage |', '| --- | --- | --- | --- | --- |',
    ...artifact.comparison.map(row => `| ${plain(artifact.job.targets.find(t => t.id === row.targetId)!.name)} | ${row.eligibility} | ${row.totalMinor !== undefined ? `${artifact.job.currency} ${(row.totalMinor / 100).toFixed(2)}` : 'unknown'} | ${row.readyAt ?? (row.readyBy ? `on or before ${row.readyBy}` : 'unknown')} | ${Math.round(row.coverage * 100)}% |`), '',
    'Coverage measures answered required fields; it is not a probability of correctness. Compatibility is a supplier label claim, not engineering certification.', '',
  ];
  for (const row of artifact.comparison) {
    lines.push(`## ${row.targetId}`, '', `Assessment: ${row.reasons.join('; ') || 'all required fields supported'}`, '');
    for (const cell of row.cells) lines.push(`- ${cell.field}: ${cell.state}; ${plain(valueText(cell.value))}; evidence: ${cell.evidenceIds.join(', ') || 'none'}`);
    lines.push('');
  }
  lines.push('## Call evidence', '');
  for (const call of artifact.calls) {
    lines.push(`### ${call.id}`, '', `Round ${call.round}; ${call.state}; ${call.terminal ?? 'no terminal result'}; ${call.attempts} start attempt(s).`, '');
    for (const e of call.evidence) lines.push(`- ${e.id} / ${e.source} / ${e.observedAt} / transcript characters ${e.start}:${e.end}: ${plain(e.quote)}${e.supersedes.length ? ` [corrects ${e.supersedes.join(', ')}]` : ''}`);
    if (call.issues.length) lines.push(`Validation issues: ${call.issues.join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}
