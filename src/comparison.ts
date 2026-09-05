import type { Call, Comparison, Job, Question } from './domain.js';
import { assess, canonical } from './evidence.js';

export function compare(job: Job, calls: Call[], now: string): Comparison[] {
  const rows: Comparison[] = job.targets.map(target => {
    const evidence = calls.filter(c => c.targetId === target.id).flatMap(c => c.evidence);
    const { cells, issues } = assess(job, evidence, now);
    const row: Comparison = { targetId: target.id, eligibility: issues.length ? 'needs_verification' : 'meets_requirements', reasons: issues.map(i => `${i.field}: ${i.reason}`), cells, coverage: (job.questions.length - issues.length) / job.questions.length, confidence: issues.some(i => i.reason === 'contradiction') ? 'conflicted' : issues.length ? 'incomplete' : 'supported' };
    const value = (field: string) => cells.find(c => c.field === field && c.state === 'supported')?.value;
    const reject = (reason: string) => { row.eligibility = 'does_not_meet'; row.reasons.push(reason); };
    const available = value('availability'); if (available?.kind === 'boolean' && !available.value) reject('not_available');
    const model = value('model'); if (model?.kind === 'text' && canonical(model) !== canonical({ kind: 'text', value: job.exactModel })) reject('exact_model_mismatch');
    const quantity = value('quantity'); if (quantity?.kind === 'quantity' && quantity.value < job.quantity) reject('insufficient_quantity');
    const fulfillment = value('fulfillment'); if (fulfillment?.kind === 'text' && fulfillment.value.toLowerCase().trim() !== job.requiredFulfillment) reject('fulfillment_mismatch');
    const constraints = value('constraints'); if (constraints?.kind === 'text' && constraints.value.trim().toLowerCase() !== 'none') { if (row.eligibility !== 'does_not_meet') row.eligibility = 'needs_verification'; row.reasons.push('constraints_require_human_review'); }
    const money = value('total_price');
    if (money?.kind === 'money') { if (money.currency === job.currency) row.totalMinor = money.minor; else { if (row.eligibility !== 'does_not_meet') row.eligibility = 'needs_verification'; row.reasons.push('currency_not_comparable'); } }
    const ready = value('ready_at'); if (ready?.kind === 'instant') { row.readyAt = ready.value; if (Date.parse(ready.value) > Date.parse(job.deadline)) reject('misses_deadline'); }
    return row;
  });
  const order = { meets_requirements: 0, needs_verification: 1, does_not_meet: 2 };
  return rows.sort((a, b) => order[a.eligibility] - order[b.eligibility] || (a.totalMinor ?? Infinity) - (b.totalMinor ?? Infinity) || a.targetId.localeCompare(b.targetId));
}
export function followup(job: Job, calls: Call[], targetId: string, now: string): Question[] {
  if (compare(job, calls, now).find(row => row.targetId === targetId)?.eligibility === 'does_not_meet') return [];
  const { issues } = assess(job, calls.filter(c => c.targetId === targetId).flatMap(c => c.evidence), now);
  return issues.map(issue => ({ field: issue.field, required: true, prompt: `${job.questions.find(q => q.field === issue.field)!.prompt} Reason for clarification: ${issue.reason}. Explicitly correct any earlier conflicting statement; do not guess.` }));
}
