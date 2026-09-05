import { Job, type Claim, type Result } from './domain.js';
import { AdapterError, type CallAdapter, type CallRequest, type PollResult } from './adapters/adapter.js';
import { extractTranscript } from './evidence.js';
import type { Runtime } from './orchestrator.js';

export const demoJob: Job = Job.parse({
  id: 'partline-demo', request: 'Our workshop compressor is down. Find two new ACME MX-240 contactors for pickup before 16:00 today. Exact model only. Collect quotes; do not order or reserve anything.',
  exactModel: 'ACME MX-240', quantity: 2, currency: 'USD', requiredFulfillment: 'pickup', createdAt: '2026-09-05T13:00:00Z', deadline: '2026-09-05T16:00:00Z', timezone: 'UTC', maxAgeMinutes: 60,
  targets: [
    { id: 'atlas', name: 'Atlas Parts (fictional)', contactRef: 'fixture:atlas', region: 'US', language: 'English' },
    { id: 'beacon', name: 'Beacon Supply (fictional)', contactRef: 'fixture:beacon', region: 'US', language: 'English' },
    { id: 'cedar', name: 'Cedar Components (fictional)', contactRef: 'fixture:cedar', region: 'US', language: 'English' },
    { id: 'delta', name: 'Delta Depot (fictional)', contactRef: 'fixture:delta', region: 'US', language: 'English' },
  ],
  questions: [
    { field: 'availability', prompt: 'Do you physically have the requested new part in stock now, rather than a catalog listing?', required: true },
    { field: 'model', prompt: 'Read the exact manufacturer and model from the label. Is it ACME MX-240? Report substitutes separately.', required: true },
    { field: 'quantity', prompt: 'How many usable new units can you supply today? We need two.', required: true },
    { field: 'total_price', prompt: 'What is the total for both units including tax, in USD? Confirm any fees.', required: true },
    { field: 'ready_at', prompt: 'What exact date, time and timezone can both units be ready? Is this confirmed or estimated?', required: true },
    { field: 'fulfillment', prompt: 'Can the customer pick up both units? Do not reserve them.', required: true },
    { field: 'warranty', prompt: 'What warranty and return restrictions apply?', required: true },
    { field: 'constraints', prompt: 'Are there any other constraints or fees? Explicitly say none if none.', required: true },
  ],
  policy: { concurrency: 2, maxCalls: 6, maxFollowupsPerTarget: 1, maxStartRetries: 1, maxPolls: 4, pollIntervalMs: 0 },
});
export const demoRuntime: Runtime = { now: () => '2026-09-05T13:05:00Z', sleep: async () => {} };
export function quoteTranscript(price = '248.00', model = 'ACME MX-240'): string {
  return [
    'AI: I am PARTLINE, an AI assistant collecting information only. May I ask a brief stock inquiry?',
    'Supplier: Yes, that is fine.', 'Supplier: Availability: yes', `Supplier: Exact model: ${model}`,
    'Supplier: Quantity: 2 units', `Supplier: Total including tax: USD ${price}`,
    'Supplier: Ready at: 2026-09-05T14:30:00Z', 'Supplier: Fulfillment: pickup',
    'Supplier: Warranty: 12 months; unopened returns within 7 days', 'Supplier: Constraints: none',
    'AI: Thank you. Nothing has been ordered or reserved.',
  ].join('\n');
}
export function fixtureResult(transcript: string): Result {
  return { status: 'COMPLETED', transcript, claims: extractTranscript(transcript), source: 'fixture' };
}
export class MockAdapter implements CallAdapter {
  readonly mode = 'mock' as const;
  readonly starts: CallRequest[] = [];
  readonly polled: string[] = [];
  private requests = new Map<string, CallRequest>();
  private pollCounts = new Map<string, number>();
  async start(request: CallRequest): Promise<{ runId: string }> {
    this.starts.push(structuredClone(request));
    if (request.target.id === 'cedar' && this.starts.filter(r => r.target.id === 'cedar').length === 1) throw new AdapterError('safe_to_retry');
    const runId = `mock-${request.callId}`; this.requests.set(runId, request); return { runId };
  }
  async poll(runId: string): Promise<PollResult> {
    this.polled.push(runId);
    const request = this.requests.get(runId); if (!request) throw new AdapterError('invalid_response');
    const count = this.pollCounts.get(runId) ?? 0; this.pollCounts.set(runId, count + 1);
    if (count === 0) return { state: 'active' };
    if (request.target.id === 'cedar') return { state: 'terminal', result: { status: 'NO_ANSWER', transcript: '', claims: [], source: 'fixture' } };
    if (request.target.id === 'delta') return { state: 'terminal', result: fixtureResult(quoteTranscript('80.00', 'ACME MX-120')) };
    if (request.target.id === 'beacon' && request.round === 0) {
      const transcript = quoteTranscript('190.00').split('\n').filter(line => !line.startsWith('Supplier: Warranty:')).join('\n') + '\nSupplier: Total including tax: USD 210.00';
      return { state: 'terminal', result: fixtureResult(transcript) };
    }
    if (request.target.id === 'beacon') {
      const transcript = 'AI: I am PARTLINE, an AI assistant following up on the two unclear answers. No order or reservation.\nSupplier: Correction: total including tax for both is USD 205.00, instead of 190 or 210.\nSupplier: Warranty: 12 months; unopened returns within 7 days';
      const quote = 'Supplier: Correction: total including tax for both is USD 205.00, instead of 190 or 210.';
      // Fixture correction IDs are derived from the same deterministic first-call parser.
      const first = quoteTranscript('190.00').split('\n').filter(line => !line.startsWith('Supplier: Warranty:')).join('\n') + '\nSupplier: Total including tax: USD 210.00';
      const supersedes = extractTranscript(first).flatMap((c, i) => c.field === 'total_price' ? [`${request.job.id}-beacon-0-e${i}`] : []);
      const correction: Claim = { field: 'total_price', value: { kind: 'money', currency: 'USD', minor: 20500, basis: 'total_including_tax' }, quote, start: transcript.indexOf(quote), end: transcript.indexOf(quote) + quote.length, certainty: 'explicit', supersedes };
      return { state: 'terminal', result: { status: 'COMPLETED', transcript, claims: [correction, ...extractTranscript(transcript)], source: 'fixture' } };
    }
    return { state: 'terminal', result: fixtureResult(quoteTranscript()) };
  }
}
