# PARTLINE

Find the exact part that can get this repair moving today.

PARTLINE coordinates supplier inquiries for repair technicians, turns answers into a comparable decision brief, and links every accepted fact to a source call and transcript span. A cheaper incompatible part cannot outrank the requested model. Unknown prices, conflicting statements, and stale stock claims stay visible.

**The default demo remains deterministic. All demo suppliers, contact references, parts, prices and transcripts are fictional. Mission 002 adds one narrowly scoped, approval-gated live validation command.**

## Run locally

Requires Node.js 24 or later and npm. CALL-E is optional for the offline demo.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run demo
npm run security
```

The demo saves `.runs/partline-demo.json` and `.runs/partline-demo.md`. Open the Markdown brief or run:

```sh
npm start -- inspect partline-demo
npm start -- schema
npm start -- verify-artifact .runs/partline-demo.json
```

Use `npm run demo -- another-demo` for a fresh deterministic run. Replaying the same ID reuses the saved artifact without dispatching. The fixture clock is September 5, 2026 at 13:05 UTC; the displayed evidence time is deliberately fixed for reproducibility.

## What the demo proves

| Supplier | Observed scenario | Decision behavior |
| --- | --- | --- |
| Atlas | Exact model, two units, USD 248 total, pickup in time | Eligible alternative |
| Beacon | USD 190 and USD 210 conflict; missing warranty | One targeted follow-up explicitly corrects total to USD 205 and supplies warranty |
| Cedar | Simulated transient planning failure, then no answer | One bounded safe pre-start retry; other suppliers finish |
| Delta | USD 80, but the wrong model | Excluded from viable options |

Five simulated call runs, six adapter start attempts, four suppliers, two simultaneous workers, one targeted follow-up. No real calls occur. Evidence correction retains the original statements and records which evidence IDs were superseded. The brief awaits a human decision.

## CALL-E readiness

The official skill and CLI are installed globally on the current machine. A separate read-only check uses that CLI:

```sh
npm start -- readiness
```

It runs help, authentication status, and MCP tool listing, and prints only authentication usability and tool names. It does not log in, plan, dial, or consume call credits. The default discovery path supports this Windows installation. On another platform a trusted application can pass the absolute installed `calle.js` path to `InstalledCliRunner`; global npm discovery for other platforms is not implemented.

`CalleAdapter.start` is implemented around official `calle call start`, which performs `plan_call` then `run_call` inside the vendor CLI. `poll` uses `calle call status`, which wraps `get_call_run`. The CLI keeps plan confirmation data private. All automated integration tests inject `FakeRunner`; they never create the live transport.

Both the adapter and process runner independently default to rejecting calls. The only executable live path is `npm run live:test`: one Beacon role-play recipient, one call submission, zero start retries, zero follow-up calls and read-only status polling. It also requires the exact Mission 002 approval marker and a grant bound to the job, ephemeral destination fingerprint, deadline and one-call budget. Such a grant is an internal capability in a trusted local process, **not** a cryptographic proof of consent or a multi-user authentication system.

The real phone number is never part of `Job`, `Artifact`, the Markdown brief or tracked configuration. After explicit approval, run `scripts/run-live-test.ps1 -Approved` in a private local terminal. The script takes the phone through a hidden `SecureString` prompt, passes it only in the child process environment, and clears that environment afterward. Region, language, IANA timezone and today's offset-qualified 16:00 deadline are entered locally as well. The CALL-E CLI necessarily receives the number as the destination argument inside its child process; PARTLINE captures and sanitizes its output.

## Evidence and human decisions

Eight required questions cover physical stock, exact model, quantity, total including tax and currency, absolute ready time, fulfillment, warranty, and constraints. The application validates both schemas and exact quote spans. Unknown values are not assigned zero prices or manufactured confidence scores. Coverage is the fraction of required fields supported, not probability of truth. Supported currencies are USD, BDT, SGD, EUR, GBP, AUD and CAD, all using two fractional digits; other currencies are rejected until explicit unit handling is implemented.

MCP currently has no custom result-schema input. The live adapter therefore uses a deliberately narrow transcript parser: explicit `Supplier: Exact model: ...` and equivalent labeled statements only. It will not extract general natural speech, resolve pronouns, infer tax or timezones, or assume the vendor uses these speaker labels. Unsupported live formats produce missing fields. Do not present the fixture extractor as validated live NLP.

An operator can annotate a real completed transcript with the `EvidenceReview` schema in `src/review.ts` and import it with:

```sh
npm start -- review-evidence <run-id> <review.json>
npm start -- approve-manual <run-id> <target-id> <reviewer>
```

Review claims require exact character offsets and quotes from the stored transcript. They are labeled `human_review`, retain the observation time, and invalidate prior selection. Quote matching proves provenance, not the semantic truth of an annotation. Put any real review files inside the ignored `.runs` directory.

Human selection rechecks evidence freshness, exact model, quantity, deadline, fulfillment and currency. It only records approval for **manual** action. No purchasing, payment, booking, reservation, or consequential-action executor exists. Phone behavior boundaries are also included in the generated CALL-E goal, but a prompt is not an absolute guarantee of a voice agent's behavior. The first consented test must verify disclosure and refusal behavior.

## Reliability and data handling

Each run has a filesystem lock and serialized atomic checkpoints. Dispatch intent is saved before the external start, and the returned run ID before polling. An interrupted dispatch without a persisted run ID becomes `uncertain`, never a new call. A poll timeout means monitoring paused, not that a call failed or stopped. Resume polls the saved ID. Declines and no-answer outcomes never automatically redial.

Retries are bounded and restricted to confirmed pre-start planning failures or status reads. Follow-ups are limited, count toward the contact budget, and use only unresolved questions. A definitive disqualifier stops follow-ups. Persistence failure halts further dispatch; sibling workers finish or stop before the lock is released. Crash locks deliberately require operator inspection rather than unsafe automatic stealing.

The application never reads OAuth caches, inherits CALL-E endpoint overrides, or echoes raw subprocess errors. It validates/redacts supported credential patterns and the authorized destination before output or storage. Artifacts and local review inputs are ignored by Git. They can still contain business contact information and transcripts: keep them private, use an OS-protected directory, and review any demo export. File modes are requested on POSIX; Windows permissions rely on the user's directory ACLs. The secret scanner is a guardrail, not a universal secret detector.

## Project map

- `src/domain.ts`: strict runtime schemas and inferred TypeScript types.
- `src/orchestrator.ts`: bounded worker pool, checkpoints, resume and follow-ups.
- `src/evidence.ts`, `comparison.ts`, `review.ts`: provenance, normalization, uncertainty, human evidence review.
- `src/adapters/`: domain adapter and installed CALL-E CLI boundary.
- `src/store.ts`, `decision.ts`, `report.ts`, `cli.ts`: persistence, human choice, brief and local interface.
- `src/demo.ts`: explicitly fictional deterministic adapter and scenario.
- `src/live-validation.ts`: the fixed Mission 002 one-call job and destination-bound grant.
- `tests/`: domain, evidence, orchestration, transport, persistence and approval tests.
- `docs/product.md`: concept selection and judge narrative.
- `docs/architecture.md`: invariants, recovery and future dashboard contract.
- `docs/research.md`: official sources and submission obligations.
- `docs/live-experiment.md`: the next proposed test; not authorization to call.

This is a tested production foundation, not a deployed product or a completed hackathon submission. Live voice quality, natural-language extraction, operating-region behavior, account credits, real supplier value, retention policy and multi-user access controls remain to be validated or built.
