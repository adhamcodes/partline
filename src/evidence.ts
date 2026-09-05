import { Claim, Currency, type Call, type Cell, type Evidence, type Field, type Issue, type Job, type Result, type Value } from './domain.js';
import { redact } from './safety.js';

const expected: Record<Field, readonly Value['kind'][]> = { availability: ['boolean'], model: ['text'], quantity: ['quantity'], total_price: ['money'], ready_at: ['instant', 'instant_bound'], fulfillment: ['text'], warranty: ['text'], constraints: ['text'] };
export function canonical(value: Value): string {
  if (value.kind === 'text') return value.value.trim().replace(/\s+/g, ' ').toUpperCase();
  if (value.kind === 'instant') return new Date(value.value).toISOString();
  if (value.kind === 'instant_bound') return `<=${new Date(value.latest).toISOString()}`;
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
    if (!expected[c.field].includes(c.value.kind)) { issues.push('wrong_claim_type'); continue; }
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
type TranscriptContext = Pick<Job, 'exactModel' | 'currency' | 'deadline' | 'timezone'>;
type Turn = { speaker: 'BOT' | 'USER'; text: string; start: number; end: number; timestamp: string };

function timestampedTurns(transcript: string): Turn[] {
  const turns: Turn[] = [];
  const line = /^\[(\d{2}:\d{2}:\d{2})\]\s+(BOT|USER):\s*([^\r\n]*)$/gmi;
  for (const match of transcript.matchAll(line)) {
    const speaker = match[2]!.toUpperCase() as Turn['speaker'];
    const text = match[3]!.trim();
    const start = match.index;
    const end = start + match[0].length;
    const previous = turns.at(-1);
    if (previous?.speaker === speaker && /^\s*$/.test(transcript.slice(previous.end, start))) {
      previous.text = `${previous.text} ${text}`.trim();
      previous.end = end;
      continue;
    }
    turns.push({ speaker, text, start, end, timestamp: match[1]! });
  }
  return turns;
}

const affirmative = (text: string): boolean => /^(?:yes|yeah|yep|correct|confirmed|right|that(?:'s| is) right)\b/i.test(text.trim());
const negative = (text: string): boolean => /^(?:no|nope)\b/i.test(text.trim());
const claimFromSpan = (transcript: string, field: Field, value: Value, start: number, end: number): Claim | undefined => {
  const parsed = Claim.safeParse({ field, value, quote: transcript.slice(start, end), start, end, certainty: 'explicit', supersedes: [] });
  return parsed.success ? parsed.data : undefined;
};

function extractTimestampedDialogue(transcript: string, context?: TranscriptContext): Result['claims'] {
  if (!context) return [];
  const turns = timestampedTurns(transcript);
  const claims = new Map<Field, Claim>();
  const add = (field: Field, value: Value, start: number, end: number) => {
    if (claims.has(field)) return;
    const claim = claimFromSpan(transcript, field, value, start, end);
    if (claim) claims.set(field, claim);
  };
  for (let index = 1; index < turns.length; index++) {
    const answer = turns[index]!;
    const prompt = turns[index - 1]!;
    if (answer.speaker !== 'USER' || prompt.speaker !== 'BOT') continue;
    const question = prompt.text;
    const response = answer.text;
    const spanStart = prompt.start;
    const spanEnd = answer.end;

    if (/\b(?:do you|you)\b[^?]*\b(?:have|stock)\b[^?]*\bin stock\b|\bphysically have\b[^?]*\bin stock\b/i.test(question) && (affirmative(response) || negative(response))) {
      add('availability', { kind: 'boolean', value: affirmative(response) }, spanStart, spanEnd);
    }
    if (/\bexact\b[^?]*\b(?:manufacturer|model|label)\b/i.test(question) && question.toUpperCase().includes(context.exactModel.toUpperCase()) && affirmative(response)) {
      add('model', { kind: 'text', value: context.exactModel }, spanStart, spanEnd);
    }
    if (/\bhow many\b/i.test(question)) {
      const quantity = response.match(/^\s*(\d+)\s*(?:units?)?\s*[.!]?\s*$/i);
      if (quantity) add('quantity', { kind: 'quantity', value: Number(quantity[1]) }, spanStart, spanEnd);
    }
    if (/\btotal\b/i.test(question) && /\b(?:tax|fees?)\b/i.test(question) && /\b(?:including tax|tax included|incl\.? tax)\b/i.test(response)) {
      const money = response.match(/\b([A-Z]{3})\s*(\d+(?:\.\d{1,2})?)\b/i);
      if (money) {
        const currency = Currency.safeParse(money[1]!.toUpperCase());
        const amount = Number(money[2]);
        if (currency.success && currency.data === context.currency && Number.isFinite(amount)) add('total_price', { kind: 'money', currency: currency.data, minor: Math.round(amount * 100), basis: 'total_including_tax' }, spanStart, spanEnd);
      }
    }
    if (/\bis\s+(?:pickup|pick up)\s+available\b|\bcan\b[^?]*\bpick up\b/i.test(question) && affirmative(response)) {
      add('fulfillment', { kind: 'text', value: 'pickup' }, spanStart, spanEnd);
    }
    if (/\b(?:warranty|return restriction)\b/i.test(question) && /^(?:no|none|no warranty|no restrictions?)\s*[.!]?$/i.test(response.trim())) {
      add('warranty', { kind: 'text', value: 'none' }, spanStart, spanEnd);
    }
    if (/\b(?:other constraints|other fees)\b/i.test(question) && /^(?:no|none)\s*[.!]?$/i.test(response.trim())) {
      add('constraints', { kind: 'text', value: 'none' }, spanStart, spanEnd);
    }

    const beforeTime = response.match(/\bbefore\s+(?:16(?::00)?|4(?::00)?\s*p\.?m\.?)\b/i);
    const confirmPrompt = turns[index + 1];
    const confirmAnswer = turns[index + 2];
    const normalizeZone = (value: string) => value.toLowerCase().replace(/\bslash\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    const zoneSupported = normalizeZone(response).includes(normalizeZone(context.timezone)) || normalizeZone(question).includes(normalizeZone(context.timezone));
    if (beforeTime && zoneSupported && /\btoday\b/i.test(question) && /\b(?:pickup|ready)\b/i.test(question) && confirmPrompt?.speaker === 'BOT' && /\bready time\b[^.]*\bconfirmed\b|\bconfirmed\b[^.]*\bestimated\b/i.test(confirmPrompt.text) && confirmAnswer?.speaker === 'USER' && /^confirmed\b/i.test(confirmAnswer.text.trim())) {
      add('ready_at', { kind: 'instant_bound', latest: context.deadline }, answer.start, confirmAnswer.end);
    }
  }
  return [...claims.values()];
}

// Conservative parser: accepts labelled fixture statements and timestamped
// CALL-E dialogue only when recipient speech explicitly answers a known prompt.
// Unstructured prose and summaries remain unknown.
export function extractTranscript(transcript: string, context?: TranscriptContext): Result['claims'] {
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
  const timestamped = extractTimestampedDialogue(transcript, context);
  for (const claim of timestamped) if (!claims.some(existing => existing.field === claim.field && existing.start === claim.start && existing.end === claim.end)) claims.push(claim);
  return claims;
}
