import { Field, type Artifact, type Cell, type Comparison, type Evidence, type Value } from '../domain.js';
import { canonical } from '../evidence.js';
import type { SanitizedProof } from '../proof.js';
import { assertNoSecrets } from '../safety.js';

export type EvidenceView = {
  id: string;
  field: Field;
  value: string;
  quote: string;
  source: Evidence['source'] | 'sanitized_real_transcript';
  sourceRef: string;
  timestamp: string;
};

export type SupplierView = {
  id: string;
  name: string;
  outcome: Comparison['eligibility'];
  coverage: number;
  compatibility: 'exact' | 'mismatch' | 'unknown';
  total: string;
  ready: string;
  callState: string;
  attempts: number;
  clarification: 'completed' | 'not_needed' | 'unavailable';
  reasons: string[];
  fields: Array<{ field: Field; label: string; state: Cell['state']; value: string; evidenceIds: string[] }>;
  evidence: EvidenceView[];
};

export type DashboardModel = {
  generatedFrom: 'versioned_sanitized_proof';
  incident: { title: string; request: string; model: string; quantity: number; deadline: string; deadlineLabel: string; timezone: string; fulfillment: string; state: string };
  operations: {
    simulated: true;
    supplierCount: number;
    maxConcurrency: number;
    callRecords: number;
    suppliers: SupplierView[];
    recommendation: {
      targetId: string;
      name: string;
      total: string;
      savings: string;
      basis: string[];
      rejectedAlternative: { name: string; total: string; reason: string } | null;
    } | null;
    replay: Array<{ id: string; label: string; detail: string; targets: string[] }>;
    timeline: {
      maxSequence: number;
      ticks: number[];
      lanes: Array<{ targetId: string; name: string; segments: Array<{ round: number; start: number; end: number; label: string; outcome: string }> }>;
    };
  };
  realProof: {
    label: string;
    roleplay: true;
    status: string;
    callCount: number;
    startAttempts: number;
    coverage: number;
    sameCallClarification: boolean;
    deadline: string;
    deadlineLabel: string;
    timezone: string;
    unknownFields: Field[];
    fields: SupplierView['fields'];
    evidence: EvidenceView[];
  };
  safety: { decision: string; executable: false; prohibited: string[] };
};

const labels: Record<Field, string> = {
  availability: 'In stock', model: 'Exact model', quantity: 'Quantity', total_price: 'Total price',
  ready_at: 'Ready by', fulfillment: 'Fulfillment', warranty: 'Warranty / returns', constraints: 'Constraints',
};

export function formatOperationalInstant(value: string, timezone: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) return value;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZoneName: 'longOffset',
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
  const offset = (parts.timeZoneName ?? 'GMT').replace('GMT', 'UTC');
  const zone = timezone === 'UTC' ? 'UTC' : `${timezone} (${offset})`;
  return `${parts.day} ${parts.month} · ${parts.hour}:${parts.minute} ${zone}`;
}

function valueText(value: Value | undefined, timezone: string): string {
  if (!value) return 'Unknown';
  if (value.kind === 'boolean') return value.value ? 'Confirmed' : 'No';
  if (value.kind === 'money') return `${value.currency} ${(value.minor / 100).toFixed(2)} incl. tax`;
  if (value.kind === 'instant') return formatOperationalInstant(value.value, timezone);
  if (value.kind === 'instant_bound') return `Before ${formatOperationalInstant(value.latest, timezone)}`;
  return String(value.value);
}

function evidenceView(evidence: Evidence, timezone: string): EvidenceView {
  return {
    id: evidence.id,
    field: evidence.field,
    value: valueText(evidence.value, timezone),
    quote: evidence.quote,
    source: evidence.source,
    sourceRef: `chars ${evidence.start}:${evidence.end}`,
    timestamp: evidence.observedAt,
  };
}

function supplierView(artifact: Artifact, row: Comparison): SupplierView {
  const target = artifact.job.targets.find(candidate => candidate.id === row.targetId)!;
  const calls = artifact.calls.filter(call => call.targetId === row.targetId);
  const evidence = calls.flatMap(call => call.evidence);
  const model = row.cells.find(cell => cell.field === 'model');
  const compatibility = model?.state !== 'supported' || model.value?.kind !== 'text'
    ? 'unknown'
    : canonical(model.value) === canonical({ kind: 'text', value: artifact.job.exactModel }) ? 'exact' : 'mismatch';
  const terminal = calls.at(-1);
  return {
    id: row.targetId,
    name: target.name,
    outcome: row.eligibility,
    coverage: Math.round(row.coverage * 100),
    compatibility,
    total: row.totalMinor === undefined ? 'Unknown' : `${artifact.job.currency} ${(row.totalMinor / 100).toFixed(2)}`,
    ready: row.readyAt ? formatOperationalInstant(row.readyAt, artifact.job.timezone) : row.readyBy ? `Before ${formatOperationalInstant(row.readyBy, artifact.job.timezone)}` : 'Unknown',
    callState: terminal?.terminal ?? terminal?.state ?? 'unknown',
    attempts: calls.reduce((sum, call) => sum + call.attempts, 0),
    clarification: calls.some(call => call.round > 0) ? 'completed' : terminal?.state === 'failed' ? 'unavailable' : 'not_needed',
    reasons: row.reasons,
    fields: row.cells.map(cell => ({ field: cell.field, label: labels[cell.field], state: cell.state, value: valueText(cell.value, artifact.job.timezone), evidenceIds: cell.evidenceIds })),
    evidence: evidence.map(item => evidenceView(item, artifact.job.timezone)),
  };
}

function preferred(suppliers: SupplierView[]): DashboardModel['operations']['recommendation'] {
  const eligible = suppliers.filter(supplier => supplier.outcome === 'meets_requirements' && supplier.total !== 'Unknown');
  const first = eligible[0];
  if (!first) return null;
  const price = Number(first.total.match(/[\d.]+/)?.[0]);
  const next = eligible
    .map(supplier => ({ supplier, price: Number(supplier.total.match(/[\d.]+/)?.[0]) }))
    .filter(item => Number.isFinite(item.price) && item.price > price)
    .sort((a, b) => a.price - b.price)[0];
  const rejected = suppliers.find(supplier => supplier.outcome === 'does_not_meet' && supplier.total !== 'Unknown');
  return {
    targetId: first.id,
    name: first.name,
    total: first.total,
    savings: next === undefined ? 'No comparable alternative' : `${first.total.slice(0, 3)} ${(next.price - price).toFixed(2)} cheaper than ${next.supplier.name.replace(' (fictional)', '')}`,
    basis: ['Exact model · ACME MX-240', 'Quantity satisfied · 2 units', 'Pickup confirmed before 16:00 UTC', 'Lowest supported total among qualifying suppliers'],
    rejectedAlternative: rejected ? { name: rejected.name.replace(' (fictional)', ''), total: rejected.total, reason: rejected.compatibility === 'mismatch' ? 'Wrong model · rejected' : 'Does not meet requirements' } : null,
  };
}

function executionTimeline(artifact: Artifact): DashboardModel['operations']['timeline'] {
  const maxSequence = Math.max(1, ...artifact.events.map(event => event.sequence));
  const lanes = artifact.job.targets.map(target => {
    const calls = artifact.calls.filter(call => call.targetId === target.id);
    return {
      targetId: target.id,
      name: target.name.replace(' (fictional)', ''),
      segments: calls.flatMap(call => {
        const events = artifact.events.filter(event => event.callId === call.id);
        const start = events.find(event => event.type === 'dispatch_intent_saved')?.sequence;
        const end = events.findLast(event => event.type === 'call_terminal')?.sequence;
        if (start === undefined || end === undefined || end < start) return [];
        return [{ round: call.round, start, end, label: call.round > 0 ? 'clarification' : 'initial call', outcome: call.terminal ?? call.state }];
      }),
    };
  });
  const ticks = [1, Math.ceil(maxSequence * .25), Math.ceil(maxSequence * .5), Math.ceil(maxSequence * .75), maxSequence]
    .filter((value, index, all) => all.indexOf(value) === index);
  return { maxSequence, ticks, lanes };
}

function liveProof(proof: SanitizedProof): DashboardModel['realProof'] {
  const byField = new Map(proof.evidence.map(item => [item.field, item]));
  const fields = Field.options.map(field => {
    const evidence = byField.get(field);
    return {
      field,
      label: labels[field],
      state: evidence ? 'supported' as const : 'unknown' as const,
      value: evidence ? valueText(evidence.value, proof.request.timezone) : 'Unknown',
      evidenceIds: evidence ? [evidence.id] : [],
    };
  });
  return {
    label: 'REAL CALL-E VALIDATION · CONSENTING ROLE-PLAY',
    roleplay: true,
    status: proof.status,
    callCount: proof.callCount,
    startAttempts: proof.startAttempts,
    coverage: Math.round((proof.coverage.supported / proof.coverage.required) * 100),
    sameCallClarification: proof.sameCallClarification.completed,
    deadline: proof.request.deadline,
    deadlineLabel: formatOperationalInstant(proof.request.deadline, proof.request.timezone),
    timezone: proof.request.timezone,
    unknownFields: [...proof.coverage.unknown],
    fields,
    evidence: proof.evidence.map(item => ({
      id: item.id,
      field: item.field,
      value: valueText(item.value, proof.request.timezone),
      quote: item.quote,
      source: 'sanitized_real_transcript',
      sourceRef: item.sourceRef,
      timestamp: item.timestamp,
    })),
  };
}

export function buildDashboardModel(proof: SanitizedProof, demo: Artifact): DashboardModel {
  if (demo.mode !== 'mock') throw new Error('Dashboard artifact mode invalid');
  const suppliers = demo.comparison.map(row => supplierView(demo, row));
  const model: DashboardModel = {
    generatedFrom: 'versioned_sanitized_proof',
    incident: {
      title: 'Workshop compressor offline', request: demo.job.request, model: demo.job.exactModel,
      quantity: demo.job.quantity, deadline: demo.job.deadline, deadlineLabel: formatOperationalInstant(demo.job.deadline, demo.job.timezone),
      timezone: demo.job.timezone, fulfillment: demo.job.requiredFulfillment, state: demo.state,
    },
    operations: {
      simulated: true,
      supplierCount: demo.job.targets.length,
      maxConcurrency: demo.job.policy.concurrency,
      callRecords: demo.calls.length,
      suppliers,
      recommendation: preferred(suppliers),
      timeline: executionTimeline(demo),
      replay: [
        { id: 'scope', label: 'Request locked', detail: 'Exact model, quantity, deadline and no-commit policy fixed.', targets: [] },
        { id: 'parallel', label: 'Parallel outreach', detail: 'Atlas and Beacon start together; the queue continues within the two-call concurrency limit.', targets: ['atlas', 'beacon'] },
        { id: 'evidence', label: 'Evidence normalized', detail: 'Supplier statements become typed claims with transcript offsets.', targets: ['atlas', 'beacon'] },
        { id: 'gap', label: 'Gap detected', detail: 'Beacon price conflict and missing warranty are isolated; Cedar returns no answer.', targets: ['beacon', 'cedar'] },
        { id: 'clarify', label: 'Targeted clarification', detail: 'Only the unresolved Beacon fields are clarified in the deterministic scenario.', targets: ['beacon'] },
        { id: 'compare', label: 'Decision brief ready', detail: 'Beacon qualifies at USD 205; Delta is rejected for model mismatch; the operator decides.', targets: ['beacon', 'delta'] },
      ],
    },
    realProof: liveProof(proof),
    safety: {
      decision: 'Recommendation only. No order or reservation can be executed from this surface.',
      executable: false,
      prohibited: ['No ordering', 'No reservation', 'No payment', 'Human approval required'],
    },
  };
  assertNoSecrets(model);
  return model;
}
