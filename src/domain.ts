import { z } from 'zod';

export const Id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const Instant = z.iso.datetime({ offset: true });
// Initial supported currencies all have two fractional digits. Do not silently misprice JPY/KWD.
export const Currency = z.enum(['USD', 'BDT', 'SGD', 'EUR', 'GBP', 'AUD', 'CAD']);
export const Field = z.enum(['availability', 'model', 'quantity', 'total_price', 'ready_at', 'fulfillment', 'warranty', 'constraints']);
export type Field = z.infer<typeof Field>;
export const Value = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), value: z.string().min(1).max(1000) }).strict(),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }).strict(),
  z.object({ kind: z.literal('quantity'), value: z.number().int().nonnegative().max(1000000) }).strict(),
  z.object({ kind: z.literal('money'), minor: z.number().int().nonnegative().max(1000000000), currency: Currency, basis: z.literal('total_including_tax') }).strict(),
  z.object({ kind: z.literal('instant'), value: Instant }).strict(),
  z.object({ kind: z.literal('instant_bound'), latest: Instant }).strict(),
]);
export type Value = z.infer<typeof Value>;
export const Question = z.object({ field: Field, prompt: z.string().min(1).max(1000), required: z.boolean() }).strict();
export type Question = z.infer<typeof Question>;
export const Target = z.object({ id: Id.max(32), name: z.string().min(1).max(100), contactRef: z.string().regex(/^[a-z][a-z0-9_-]{0,31}:[a-zA-Z0-9_-]{1,64}$/), region: z.string().regex(/^[A-Z]{2}$/), language: z.string().min(1).max(50) }).strict();
export type Target = z.infer<typeof Target>;
export const Job = z.object({
  id: Id.max(32), request: z.string().min(1).max(3000), exactModel: z.string().min(1).max(100), quantity: z.number().int().positive().max(10000),
  currency: Currency, requiredFulfillment: z.enum(['pickup', 'delivery']), deadline: Instant, createdAt: Instant, timezone: z.string().min(1).max(100),
  maxAgeMinutes: z.number().positive().max(1440), targets: z.array(Target).min(1).max(10), questions: z.array(Question).min(1).max(16),
  policy: z.object({ concurrency: z.number().int().min(1).max(3), maxCalls: z.number().int().min(1).max(20), maxFollowupsPerTarget: z.number().int().min(0).max(2), maxStartRetries: z.number().int().min(0).max(2), maxPolls: z.number().int().min(1).max(100), pollIntervalMs: z.number().int().min(0).max(60000) }).strict(),
}).strict().superRefine((j, ctx) => {
  if (new Set(j.targets.map(t => t.id)).size !== j.targets.length || new Set(j.targets.map(t => t.contactRef)).size !== j.targets.length) ctx.addIssue({ code: 'custom', message: 'Duplicate targets' });
  if (new Set(j.questions.map(q => q.field)).size !== j.questions.length) ctx.addIssue({ code: 'custom', message: 'Duplicate questions' });
  for (const field of Field.options) if (!j.questions.some(q => q.field === field && q.required)) ctx.addIssue({ code: 'custom', message: `Required question absent: ${field}` });
  if (Date.parse(j.deadline) <= Date.parse(j.createdAt)) ctx.addIssue({ code: 'custom', message: 'Deadline must follow creation' });
  try { new Intl.DateTimeFormat('en', { timeZone: j.timezone }); } catch { ctx.addIssue({ code: 'custom', message: 'Invalid timezone' }); }
});
export type Job = z.infer<typeof Job>;
export const Claim = z.object({ field: Field, value: Value, quote: z.string().min(1).max(2000), start: z.number().int().nonnegative(), end: z.number().int().positive(), certainty: z.enum(['explicit', 'tentative']), supersedes: z.array(Id).default([]) }).strict();
export type Claim = z.infer<typeof Claim>;
export const Evidence = Claim.extend({ id: Id, callId: Id, targetId: Id, observedAt: Instant, source: z.enum(['fixture', 'transcript_parser', 'human_review']) });
export type Evidence = z.infer<typeof Evidence>;
export const Terminal = z.enum(['COMPLETED', 'FAILED', 'NO_ANSWER', 'DECLINED', 'CANCELED', 'CANCELLED', 'VOICEMAIL', 'BUSY', 'EXPIRED']);
export type Terminal = z.infer<typeof Terminal>;
export const Result = z.object({ status: Terminal, transcript: z.string().max(200000), claims: z.array(Claim).max(100), source: z.enum(['fixture', 'transcript_parser', 'human_review']) }).strict();
export type Result = z.infer<typeof Result>;
export const Call = z.object({
  id: Id, targetId: Id, round: z.number().int().nonnegative(), questions: z.array(Question),
  state: z.enum(['queued', 'dispatching', 'active', 'completed', 'failed', 'uncertain', 'monitoring_paused', 'blocked']),
  runId: z.string().min(1).max(256).optional(), startedAt: Instant.optional(), attempts: z.number().int().nonnegative(), polls: z.number().int().nonnegative(),
  terminal: Terminal.optional(), transcript: z.string().max(200000).optional(), evidence: z.array(Evidence),
  issues: z.array(z.string()), failure: z.enum(['start_rejected', 'uncertain_start', 'poll_limit', 'invalid_response', 'policy_blocked', 'terminal_failure']).optional(),
}).strict();
export type Call = z.infer<typeof Call>;
export const Issue = z.object({ field: Field, reason: z.enum(['missing', 'tentative', 'contradiction', 'stale', 'wrong_type']), evidenceIds: z.array(Id) });
export type Issue = z.infer<typeof Issue>;
export const Cell = z.object({ field: Field, state: z.enum(['supported', 'unknown', 'tentative', 'contradicted', 'stale']), value: Value.optional(), evidenceIds: z.array(Id) });
export type Cell = z.infer<typeof Cell>;
export const Comparison = z.object({ targetId: Id, eligibility: z.enum(['meets_requirements', 'needs_verification', 'does_not_meet']), reasons: z.array(z.string()), cells: z.array(Cell), coverage: z.number().min(0).max(1), confidence: z.enum(['supported', 'incomplete', 'conflicted']), totalMinor: z.number().optional(), readyAt: Instant.optional(), readyBy: Instant.optional() });
export type Comparison = z.infer<typeof Comparison>;
export const Artifact = z.object({
  schemaVersion: z.literal(1), mode: z.enum(['mock', 'live']), job: Job, evaluatedAt: Instant,
  state: z.enum(['running', 'awaiting_human_decision', 'needs_operator_review']),
  calls: z.array(Call), comparison: z.array(Comparison),
  events: z.array(z.object({ sequence: z.number().int(), type: z.string(), callId: Id.optional() })),
  evidenceReviews: z.array(z.object({ callId: Id, reviewer: z.string(), reviewedAt: Instant, evidenceIds: z.array(Id) })),
  decision: z.object({ state: z.enum(['pending', 'approved_for_manual_action']), targetId: Id.optional(), reviewer: z.string().optional(), approvedAt: Instant.optional(), executable: z.literal(false) }).strict(),
}).strict();
export type Artifact = z.infer<typeof Artifact>;
