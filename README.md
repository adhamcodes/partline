# PARTLINE

PARTLINE calls local suppliers in parallel, converts their speech into traceable evidence, compares only qualifying options, and leaves the decision to the human.

Urgent repair sourcing often fails online: local inventory is missing, stale, or available only by phone. PARTLINE treats those phone conversations as a structured information source. It asks about physical availability, exact model, quantity, total price, ready time, fulfillment, warranty, and constraints; unsupported answers remain unknown.

The judge console combines two explicitly separated demonstrations:

| Surface | What it is | What it proves |
| --- | --- | --- |
| **SIMULATION · ZERO CALLS** | Deterministic four-supplier replay | Concurrency, contradiction handling, targeted clarification, partial failure, comparison, and rejection of an incompatible cheap option |
| **REAL CALL-E VALIDATION · CONSENTING ROLE-PLAY** | One completed call to the project owner role-playing Beacon Supply | The CALL-E execution and timestamped transcript-ingestion path worked once: one start attempt, zero redials, 7/8 fields, same-call warranty clarification, no purchase or reservation |

No screen or server endpoint can call, order, reserve, purchase, pay, or make another consequential commitment.

## Quick start

Requires Node.js 24 or later and npm. CALL-E, credentials, phone numbers, and ignored runtime artifacts are **not required**.

```sh
npm ci --ignore-scripts
npm run proof:verify
npm run dashboard
```

Open `http://127.0.0.1:4173`. The source dashboard validates the tracked proof bundle, regenerates the deterministic scenario in memory, and binds a GET-only server to loopback.

Build and serve the portable judge package:

```sh
npm run judge:build
npm run judge:serve
```

The output is `dist/judge/`. It contains relative assets, an embedded sanitized view model, build metadata, and a copy of the verified proof bundle. It can also be inspected by opening `dist/judge/index.html` directly. No external service is used.

## The 20-second product story

1. A workshop compressor is down; two exact ACME MX-240 contactors are needed before 16:00 UTC.
2. Atlas and Beacon overlap in the recorded deterministic execution sequence.
3. Beacon's conflicting prices and missing warranty trigger a bounded targeted clarification; Cedar's no-answer does not stop the job.
4. Beacon qualifies at USD 205, USD 43 below Atlas. Delta's USD 80 offer is rejected because it is ACME MX-120.
5. Every accepted claim opens to a transcript-backed source reference. The operator, not PARTLINE, decides.

## How it works

```text
typed urgent request
  → bounded concurrent supplier inquiries
  → transcript and event ingestion
  → typed evidence with source references
  → missing / conflicting field detection
  → targeted clarification within policy limits
  → normalized eligibility and price comparison
  → non-executable human decision brief
```

`Job` fixes the exact model, quantity, currency, fulfillment, absolute deadline, timezone, suppliers, questions, and bounded call policy. `CallAdapter` separates deterministic execution from the disabled-by-default CALL-E CLI transport. `Evidence` retains the typed value, exact quote, source, and provenance. Comparison never treats unknown as zero, never silently chooses the latest contradiction, and never lets a cheaper wrong model outrank a qualifying option.

See [architecture](docs/architecture.md) for retry, crash recovery, idempotency, and approval invariants.

## Concurrency and partial failure

The deterministic artifact contains ordered orchestration events. Atlas runs from E05–E11 while Beacon runs from E06–E12; their shared horizontal interval is visible rather than asserted in prose. Beacon clarification later overlaps Cedar's bounded attempt. The chart deliberately labels this as event-sequence overlap, not elapsed call duration.

The demo enforces two workers, a six-call logical budget, one safe pre-start retry, and one follow-up per supplier. A missing start acknowledgement becomes uncertain and cannot redial. A monitoring timeout preserves the run identity and permits status polling only. Declined, no-answer, busy, voicemail, and terminal failures do not trigger automatic redials.

## Evidence and provenance

All eight required fields are explicit: availability, exact model, quantity, total tax-inclusive price, ready time, fulfillment, warranty/returns, and constraints. Evidence is accepted only when its value type, exact quote, and source span validate. Supplier corrections retain and explicitly supersede earlier conflicting evidence.

The CALL-E parser supports timestamped `BOT`/`USER` dialogue and joins consecutive BOT lines into one question. Only recipient `USER` speech can support supplier claims. Relative readiness remains a bound; it is not converted into an invented exact timestamp. Coverage means supported required fields divided by eight—not confidence, probability, or independent truth verification.

## Sanitized real validation

The tracked [Mission 002 proof bundle](proof/mission-002/README.md) is the only real-call material used by the judge build. It contains:

- minimal validation metadata;
- seven recipient-supported claims;
- a sanitized timestamped transcript;
- explicit `constraints` unknown state;
- SHA-256 integrity metadata.

It excludes phone numbers, provider run identifiers, authorization data, credentials, callback URLs, private confirmation values, and raw provider payloads. Hash verification detects changes to the sanitized files; it is not a signature or proof that a person, consent statement, inventory claim, or price was independently genuine.

```sh
npm run proof:verify
```

## CALL-E integration

The real adapter maps one authorized start to official `calle call start`, whose vendor CLI performs `plan_call` then `run_call`. Status polling maps to `get_call_run`. Application tests inject fake runners and never reach the CLI.

The live transport and adapter both default to disabled. The separate `live:test` workflow additionally requires an exact approval marker, a one-target grant bound to the ephemeral destination fingerprint, an expiry, and a one-call budget. The phone number is accepted only through a private local prompt and is not part of `Job`, stored artifacts, this proof bundle, or frontend data.

**Do not run `npm run live:test` for judging.** Mission 004 performs no CALL-E planning or execution. The preserved versioned proof metadata records the single historical validation; it cannot initiate another call.

## Human safety boundary

Inquiry authorization and purchase authority are separate. The current product ends at a recommendation marked `executable:false`. There is no transaction adapter, purchase API, reservation API, payment flow, appointment flow, or dashboard mutation endpoint. Imported evidence invalidates any previous selection, and manual approval rechecks model, quantity, readiness, fulfillment, currency, and freshness.

This is an architectural absence of a consequential-action path, not merely a prompt telling an agent to behave.

## Verification

```sh
npm run check
```

That command verifies proof integrity, typechecks, runs the complete test suite, scans tracked and unignored source for secret patterns, validates any private local artifacts without printing them, and rebuilds the portable judge package.

Focused commands:

```sh
npm run typecheck
npm test
npm run security
npm run proof:verify
npm run judge:build
```

Tests cover schemas, provenance, conservative parsing, comparison constraints, bounded retries, no-redial recovery, concurrency, idempotent replay, approval binding, the CALL-E CLI argument boundary with fake runners, proof tamper detection, clean-checkout dashboard loading, and the static read-only build.

## Repository map

- `proof/mission-002/`: versioned sanitized real-validation proof and integrity manifest.
- `dashboard/`: restrained read-only operational UI.
- `src/dashboard/`: proof-backed view model, source server, portable builder, and static server.
- `src/domain.ts`, `evidence.ts`, `comparison.ts`: strict domain, evidence, and qualification rules.
- `src/orchestrator.ts`, `store.ts`: bounded workers, checkpoints, replay, and recovery.
- `src/adapters/`: mock boundary and disabled-by-default CALL-E CLI adapter.
- `scripts/verify-proof.ts`, `build-judge.ts`, `security-check.ts`: reproducibility and safety checks.
- `docs/judge-walkthrough.md`: exact 90-second demonstration.
- `docs/devpost-prep.md`: submission-ready copy drafts.
- `docs/adversarial-audit.md`: skeptical-judge audit and residual limitations.

## Security, privacy, and limitations

The source and static servers bind to `127.0.0.1`, allow only GET, set restrictive security headers, and render dynamic values with `textContent`. The static server has `connect-src 'none'`. Proof loading uses strict schemas, exact transcript line matching, secret rejection, phone-like value rejection, and hash verification before rendering.

This remains a local single-operator prototype, not a hosted multi-user procurement system. The one real validation used a consenting role-play, not a real supplier. The deterministic concurrency trace is not a wall-clock benchmark. Supplier speech is traceable evidence, not independent inventory certification. Broader language coverage, authenticated private transcript storage, retention/deletion controls, per-supplier opt-out records, and a wider consented call sample remain future work.
