# Devpost submission draft

## Title

PARTLINE — the phone becomes a traceable supplier API

## One-line pitch

PARTLINE calls offline suppliers in parallel, converts their answers into source-linked evidence, rejects incompatible options, and gives a human a decision-ready urgent-sourcing brief.

## Short description

When a repair depends on an exact local part, web inventory is often absent or stale. PARTLINE coordinates bounded supplier inquiries, asks a strict procurement schema, detects missing or contradictory answers, performs targeted clarification, and compares only evidence-supported options. It never orders, reserves, pays, or makes a commitment.

## The problem

A failed machine can turn one replacement part into an expensive operational emergency. Local distributors may have the right stock, but their useful data—exact label, quantity on hand, tax-inclusive total, pickup readiness, warranty, and constraints—exists only behind a phone call. A human must repeat the same questions, reconcile inconsistent phrasing, remember which answer came from whom, and avoid being distracted by a cheap but incompatible substitute.

## The solution

PARTLINE treats phone conversations as an information interface, not a transaction channel. A user locks an urgent request and an inquiry-only policy. Independent supplier calls can run concurrently. Recipient speech becomes typed, traceable evidence; unknowns remain unknown; conflicting claims stay visible. Viable gaps trigger bounded clarification. The final comparison explains both why an option qualifies and why alternatives do not, then stops at a hard human decision boundary.

## How it works

1. Define exact model, quantity, currency, deadline with timezone, fulfillment, and required questions.
2. Authorize information-only outreach to explicit targets under concurrency, retry, follow-up, and total-call limits.
3. Start independent calls through a narrow CALL-E adapter and checkpoint run identities before monitoring.
4. Normalize timestamped `BOT`/`USER` transcripts; accept supplier claims only from recipient speech.
5. Detect absent, tentative, or conflicting answers and plan only targeted clarification within budget.
6. Apply hard compatibility constraints before price ranking.
7. Render every supported value with its quote and source reference in a non-executable human brief.

## How PARTLINE uses CALL-E

The adapter is designed around CALL-E’s official call lifecycle: the installed CLI’s start path performs `plan_call` followed by `run_call`, and monitoring maps to `get_call_run`. PARTLINE contributes the typed question plan, authorization and call-budget checks, durable run-identity handling, transcript normalization, evidence ledger, gap detection, comparison, and human approval boundary.

One controlled validation used exactly one CALL-E call to the project owner, who consented and role-played the fictional Beacon Supply. The timestamped transcript yielded seven of eight required fields and demonstrated same-call clarification when warranty was initially omitted. It did not contact a real supplier, did not redial, and made no purchase or reservation.

## Technical architecture

- TypeScript and Zod for strict domain, artifact, result, and proof schemas.
- `CallAdapter` boundary with deterministic and disabled-by-default CALL-E implementations.
- Bounded worker orchestration, pre-start intent checkpoints, idempotent monitoring, and conservative uncertain-start handling.
- Speaker-aware transcript parser with consecutive BOT-line joining.
- Evidence ledger with exact quotes, source spans, timestamps, conflict/supersession links, and secret rejection.
- Comparison engine enforcing exact model, quantity, availability, readiness, fulfillment, currency, and tax-basis constraints.
- Versioned sanitized Mission 002 proof bundle with SHA-256 artifact-integrity verification.
- Read-only source dashboard plus a self-contained static judge build with embedded safe data.

## Challenges

The hardest integration issue was not starting the call; it was grounding claims conservatively after it completed. CALL-E returned timestamped `BOT`/`USER` lines and sometimes split one bot question across lines. The first parser expected a different shape and recovered no structured evidence. The repaired parser preserves speaker and timestamp provenance, joins only consecutive BOT lines, and extracts only recipient-supported claims.

Reliable call orchestration also requires treating ambiguous starts differently from ordinary failures. Retrying a request that might already be ringing can create a duplicate call, so PARTLINE records dispatch intent first and moves an unacknowledged start to human review instead of redialing.

## Accomplishments

- One real consenting CALL-E validation with one start attempt and zero redials.
- Seven of eight required fields recovered from timestamped recipient speech; constraints correctly remains unknown.
- Same-conversation warranty clarification demonstrated.
- Deterministic four-supplier scenario demonstrates concurrent work, partial failure, conflict handling, targeted follow-up, exact-model rejection, and price comparison without using call credits.
- Every material UI claim is inspectable to evidence.
- No call, purchase, reservation, payment, or mutation control exists in the judge dashboard.
- Clean-checkout proof verification and portable offline judge build require no CALL-E authentication or local runtime state.

## What I learned

Phone automation is most valuable when the system preserves uncertainty instead of smoothing it away. “Unknown,” “conflicting,” and “wrong model” are decision-critical results. The durable product advantage is not a fluent transcript; it is a trustworthy chain from an exact request, through supplier speech, to an explainable qualification decision.

## What is next

Evaluate the parser across a larger consented, multilingual sample; add encrypted private transcript storage with retention and deletion controls; add authenticated multi-user access and cross-job contact limits; and conduct a consented multi-supplier pilot only after explicit supplier opt-out and disclosure policy review. Transaction execution remains out of scope.

## Safety and privacy

Inquiry authority is not purchase authority. The product has no transaction adapter and every recommendation is `executable:false`. Phone numbers are resolved only in local process memory, never included in the job or tracked artifacts. The judge dataset omits destinations, credentials, provider IDs, callback data, confirmation values, and raw provider payloads. The real proof is clearly labeled as a consenting role-play.

The proof bundle’s SHA-256 manifest detects modification of the sanitized files. It is artifact-integrity evidence, not a provider signature, consent attestation, identity proof, or independent validation of inventory claims.

## Demo video description

“In 90 seconds, see an urgent exact-part request fan out across a deterministic two-worker supplier queue. Watch evidence arrive, a price conflict and missing warranty trigger targeted clarification, a no-answer remain isolated, and a cheap wrong-model offer get rejected. Inspect every accepted claim back to transcript evidence, then compare the simulation with one sanitized consenting CALL-E validation. The demo ends where PARTLINE always ends: a recommendation for a human, with no order or reservation capability.”

## Suggested submission metadata

- **Built with:** TypeScript, Node.js, Zod, CALL-E CLI/MCP lifecycle, HTML/CSS/JavaScript
- **Category keywords:** voice agents, operations, procurement, repair, human-in-the-loop, provenance
- **Repository demo command:** `npm ci --ignore-scripts && npm run judge`
- **Proof command:** `npm run proof:verify`
- **Testing command:** `npm run check`
