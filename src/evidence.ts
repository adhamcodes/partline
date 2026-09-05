import { Claim, Currency, type Call, type Cell, type Evidence, type Field, type Issue, type Job, type Result, type Value } from './domain.js';
import { redact } from './safety.js';

const expected: Record<Field, Value['kind']> = { availability: 'boolean', model: 'text', quantity: 'quantity', total_price: 'money', ready_at: 'instant', fulfillment: 'text', warranty: 'text', constraints: 'text' };
export function canonical(value: Value): string {
  if (value.kind === 'text') return value.value.trim().replace(/\s+/g, ' ').toUpperCase();
  if (value.kind === 'instant') return new Date(value.value).toISOString();
  return JSON.stringify(value);
}
export function ingest(call: Call, result: Result, observedAt: string, previous: Evidence[]): { transcript: string; evidence: Evidence[]; issues: string[] } {
  const transcript = redact(result.transcript);
  const evidence: Evidence[] = [];
  const issues: string[] = [];
  for (const [index, candidate] of result.claims.entries()) {
    const parsed = Claim.safeParse(candidate);
    if (!parsed.success) { issues.push('invalid_claim'); continue; }
    const c = parsed.data;
    if (transcript !== result.transcript) { issues.push('redaction_requires_review'); continue; }
    if (c.end <= c.start || transcript.slice(c.start, c.end) !== c.quote || redact(JSON.stringify(c)) !== JSON.stringify(c)) { issues.push('unverifiable_quote'); continue; }
    if (c.value.kind !== expected[c.field]) { issues.push('wrong_claim_type'); continue; }
    // A later statement does not silently erase earlier evidence. Corrections must explicitly cite it.
    if (c.supersedes.some(id => !previous.some(e => e.id === id && e.targetId === call.targetId && e.field === c.field && (e.callId !== call.id || e.end <= c.start))) || (c.supersedes.length > 0 && (c.certainty !== 'explicit' || !/\b(?:correct|correction|actually|instead)\b/i.test(c.quote)))) { issues.push('invalid_correction'); continue; }
    evidence.push({ ...c, id: `${call.id}-e${index}`, callId: call.id, targetId: call.targetId, observedAt, source: result.source });
  }
  return { transcript, evidence, issues: [...new Set(issues)] };
}
export function assess(job: Job, evidence: Evidence[], now: string): { cells: Cell[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const superseded = new Set(evidence.flatMap(e => e.supersedes));
  const cells = job.questions.map(q => {
    const all = evidence.filter(e => e.field === q.field);
    const active = all.filter(e => !superseded.has(e.id));
    const fresh = active.filter(e => Date.parse(now) >= Date.parse(e.observedAt) && Date.parse(now) - Date.parse(e.observedAt) <= job.maxAgeMinutes * 60000);
    const evidenceIds = all.map(e => e.id);
    let cell: Cell = { field: q.field, state: 'unknown', evidenceIds };
    let reason: Issue['reason'] | undefined;
    if (!active.length) reason = 'missing';
    else if (!fresh.length || fresh.length !== active.length) { cell.state = 'stale'; reason = 'stale'; }
    else if (new Set(fresh.map(e => canonical(e.value))).size > 1) { cell.state = 'contradicted'; reason = 'contradiction'; }
    else if (fresh.every(e => e.certainty === 'tentative')) { cell.state = 'tentative'; reason = 'tentative'; }
    else { cell = { ...cell, state: 'supported', value: fresh[0]!.value }; }
    if (reason && q.required) issues.push({ field: q.field, reason, evidenceIds });
    return cell;
  });
  return { cells, issues };
}
// Conservative fallback: accepts explicitly labelled supplier statements only.
// Prose without labels remains unknown; it is never filled from a summary.
export function extractTranscript(transcript: string): Result['claims'] {
  const claims: Result['claims'] = [];
  const patterns: [Field, RegExp, (s: string) => Value | undefined][] = [
    ['availability', /^Supplier:\s*Availability:\s*(yes|no)\.?$/gmi, s => ({ kind: 'boolean', value: s.toLowerCase() === 'yes' })],
    ['model', /^Supplier:\s*Exact model:\s*([^\r\n]+)$/gmi, s => ({ kind: 'text', value: s.trim() })],
    ['quantity', /^Supplier:\s*Quantity:\s*(\d+)\s*(?:units)?\.?$/gmi, s => ({ kind: 'quantity', value: Number(s) })],
    ['total_price', /^Supplier:\s*Total including tax:\s*([A-Z]{3}\s+\d+(?:\.\d{1,2})?)\s*$/gm, s => { const [currency, amount] = s.split(/\s+/); const parsed = Currency.safeParse(currency); if (!parsed.success) return undefined; return { kind: 'money', currency: parsed.data, minor: Math.round(Number(amount) * 100), basis: 'total_including_tax' }; }],
    ['ready_at', /^Supplier:\s*Ready at:\s*(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d))\s*$/gm, s => ({ kind: 'instant', value: s })],
    ['fulfillment', /^Supplier:\s*Fulfillment:\s*(pickup|delivery)\s*$/gmi, s => ({ kind: 'text', value: s.toLowerCase() })],
    ['warranty', /^Supplier:\s*Warranty:\s*([^\r\n]+)$/gmi, s => ({ kind: 'text', value: s.trim() })],
    ['constraints', /^Supplier:\s*Constraints:\s*([^\r\n]+)$/gmi, s => ({ kind: 'text', value: s.trim() })],
  ];
  for (const [field, pattern, convert] of patterns) for (const match of transcript.matchAll(pattern)) {
    const value = convert(match[1]!);
    const claim = Claim.safeParse({ field, value, quote: match[0], start: match.index, end: match.index + match[0].length, certainty: 'explicit', supersedes: [] });
    if (claim.success) claims.push(claim.data);
  }
  return claims;
}
