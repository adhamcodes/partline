import type { Artifact, Call, Cell, Comparison, Evidence, Field, Value } from '../domain.js';
import { canonical } from '../evidence.js';
import { assertNoSecrets } from '../safety.js';

export type EvidenceView = {
  id: string;
  field: Field;
  value: string;
  quote: string;
  source: Evidence['source'];
  observedAt: string;
  range: string;
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
  generatedFrom: 'local_artifacts';
  incident: { title: string; request: string; model: string; quantity: number; deadline: string; fulfillment: string; state: string };
  operations: {
    simulated: true;
    supplierCount: number;
    maxConcurrency: number;
    callRecords: number;
    suppliers: SupplierView[];
    recommendation: { targetId: string; name: string; total: string; savings: string; basis: string[] } | null;
    replay: Array<{ id: string; label: string; detail: string; targets: string[] }>;
  };
  realProof: {
    label: string;
    roleplay: true;
    status: string;
    callCount: number;
    startAttempts: number;
    coverage: number;
    sameCallClarification: boolean;
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

function valueText(value?: Value): string {
  if (!value) return 'Unknown';
  if (value.kind === 'boolean') return value.value ? 'Confirmed' : 'No';
  if (value.kind === 'money') return `${value.currency} ${(value.minor / 100).toFixed(2)} incl. tax`;
  if (value.kind === 'instant') return value.value;
  if (value.kind === 'instant_bound') return `Before ${value.latest}`;
  return String(value.value);
}

function evidenceView(evidence: Evidence): EvidenceView {
  return {
    id: evidence.id,
    field: evidence.field,
    value: valueText(evidence.value),
    quote: evidence.quote,
    source: evidence.source,
    observedAt: evidence.observedAt,
    range: `${evidence.start}:${evidence.end}`,
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
    ready: row.readyAt ?? (row.readyBy ? `Before ${row.readyBy}` : 'Unknown'),
    callState: terminal?.terminal ?? terminal?.state ?? 'unknown',
    attempts: calls.reduce((sum, call) => sum + call.attempts, 0),
    clarification: calls.some(call => call.round > 0) ? 'completed' : terminal?.state === 'failed' ? 'unavailable' : 'not_needed',
    reasons: row.reasons,
    fields: row.cells.map(cell => ({ field: cell.field, label: labels[cell.field], state: cell.state, value: valueText(cell.value), evidenceIds: cell.evidenceIds })),
    evidence: evidence.map(evidenceView),
  };
}

function preferred(suppliers: SupplierView[]): DashboardModel['operations']['recommendation'] {
  const eligible = suppliers.filter(supplier => supplier.outcome === 'meets_requirements' && supplier.total !== 'Unknown');
  const first = eligible[0];
  if (!first) return null;
  const totals = eligible.map(supplier => Number(supplier.total.match(/[\d.]+/)?.[0])).filter(Number.isFinite);
  const price = Number(first.total.match(/[\d.]+/)?.[0]);
  const next = totals.filter(total => total > price).sort((a, b) => a - b)[0];
  return {
    targetId: first.id,
    name: first.name,
    total: first.total,
    savings: next === undefined ? 'No comparable alternative' : `${first.total.slice(0, 3)} ${(next - price).toFixed(2)} below next valid option`,
    basis: ['Exact model confirmed', 'Required quantity confirmed', 'Pickup before deadline', 'Lowest supported total among qualifying suppliers'],
  };
}

function liveProof(live: Artifact): DashboardModel['realProof'] {
  const row = live.comparison[0];
  if (!row) throw new Error('Live proof comparison absent');
  const supplier = supplierView(live, row);
  const call = live.calls[0];
  if (!call) throw new Error('Live proof call absent');
  return {
    label: 'Verified CALL-E execution · consenting role-play',
    roleplay: true,
    status: call.terminal ?? call.state,
    callCount: live.calls.length,
    startAttempts: live.calls.reduce((sum, item) => sum + item.attempts, 0),
    coverage: supplier.coverage,
    sameCallClarification: supplier.evidence.some(item => item.field === 'warranty' && /just to confirm/i.test(item.quote)),
    unknownFields: supplier.fields.filter(field => field.state !== 'supported').map(field => field.field),
    fields: supplier.fields,
    evidence: supplier.evidence,
  };
}

export function buildDashboardModel(live: Artifact, demo: Artifact): DashboardModel {
  if (live.mode !== 'live' || demo.mode !== 'mock') throw new Error('Dashboard artifact modes invalid');
  const suppliers = demo.comparison.map(row => supplierView(demo, row));
  const model: DashboardModel = {
    generatedFrom: 'local_artifacts',
    incident: {
      title: 'Workshop compressor offline', request: demo.job.request, model: demo.job.exactModel,
      quantity: demo.job.quantity, deadline: demo.job.deadline, fulfillment: demo.job.requiredFulfillment, state: demo.state,
    },
    operations: {
      simulated: true,
      supplierCount: demo.job.targets.length,
      maxConcurrency: demo.job.policy.concurrency,
      callRecords: demo.calls.length,
      suppliers,
      recommendation: preferred(suppliers),
      replay: [
        { id: 'scope', label: 'Request locked', detail: 'Exact model, quantity, deadline and no-commit policy fixed.', targets: [] },
        { id: 'parallel', label: 'Parallel outreach', detail: 'Atlas and Beacon start together; the queue continues within the two-call concurrency limit.', targets: ['atlas', 'beacon'] },
        { id: 'evidence', label: 'Evidence normalized', detail: 'Supplier statements become typed claims with transcript offsets.', targets: ['atlas', 'beacon'] },
        { id: 'gap', label: 'Gap detected', detail: 'Beacon price conflict and missing warranty are isolated; Cedar returns no answer.', targets: ['beacon', 'cedar'] },
        { id: 'clarify', label: 'Targeted clarification', detail: 'Only the unresolved Beacon fields are clarified in the deterministic scenario.', targets: ['beacon'] },
        { id: 'compare', label: 'Decision brief ready', detail: 'Beacon qualifies at USD 205; Delta is rejected for model mismatch; the operator decides.', targets: ['beacon', 'delta'] },
      ],
    },
    realProof: liveProof(live),
    safety: {
      decision: 'Recommendation only. No order or reservation can be executed from this surface.',
      executable: false,
      prohibited: ['No ordering', 'No reservation', 'No payment', 'Human approval required'],
    },
  };
  assertNoSecrets(model);
  return model;
}

export function callCountProof(live: Artifact): { records: number; attempts: number } {
  return { records: live.calls.length, attempts: live.calls.reduce((sum: number, call: Call) => sum + call.attempts, 0) };
}
