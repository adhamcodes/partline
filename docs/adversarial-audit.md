# Skeptical judge audit

This audit asks what a critical judge could reasonably reject, then records the mitigation and remaining limit. It is not a claim of production readiness.

| Challenge | Finding | Mitigation in this repository | Residual limit |
| --- | --- | --- | --- |
| “The real proof is just a hidden local artifact.” | Mission 003 depended on an ignored `.runs` record. | The dashboard now loads a tracked, allowlisted, sanitized proof bundle; a test rejects `.runs` dependencies in the dashboard server and portable data. | The bundle is project-authored, not independently hosted. |
| “A hash proves the phone call happened.” | That would be an integrity overclaim. | Documentation consistently limits SHA-256 to detecting changes in sanitized artifacts. | There is no provider signature or third-party historical attestation. |
| “The UI leaks the owner’s phone or provider secrets.” | Raw call payloads are unsafe submission data. | Proof schemas allow only minimal metadata/evidence; phone-like and secret-bearing content is rejected; provider IDs and private payloads are absent. | Pattern scanning cannot prove absence of every conceivable sensitive string. |
| “The four supplier calls are fake.” | They are deterministic, not live. | Every simulation surface says `SIMULATION · ZERO CALLS`; the real proof says `CONSENTING ROLE-PLAY`. | Production multi-supplier calling has not been validated. |
| “Two concurrent” is marketing text. | Text alone would not demonstrate overlap. | A timeline derives overlapping lanes from persisted orchestration event sequence numbers. | Sequence overlap is not a wall-clock duration benchmark. |
| “Seven of eight means 88% confidence.” | Coverage could be mistaken for probability. | UI/docs define it as required-field completeness; constraints remains visibly unknown. | Supplier truthfulness is not independently verified. |
| “The cheapest answer wins, even if unusable.” | This would make the product unsafe. | Exact model, availability, quantity, deadline, and fulfillment are hard filters. Delta’s USD 80 wrong model is rejected before ranking. | Compatibility still depends on accurately spoken/parsed labels. |
| “The parser invents answers from the bot’s question.” | Leading questions can contaminate extraction. | Only `USER` speech supports claims; provenance tests preserve source lines and timestamps. | The current extractor is narrow and English-specific. |
| “Clarification hides the original contradiction.” | Silent overwrite would erase provenance. | Earlier evidence remains in the ledger and corrections require supersession links. | Human review is still needed for unusual conversational repairs. |
| “A failed call collapses the workflow.” | Real supplier outreach is noisy. | No-answer and terminal failures remain per-target outcomes; other workers and comparison continue. | Cross-provider outages need broader operational handling. |
| “Retry could accidentally call twice.” | An ambiguous start cannot safely be retried. | Dispatch intent is checkpointed before start; missing acknowledgement becomes `uncertain`; resume polls known IDs only. | Provider-side behavior outside the acknowledged API remains an external dependency. |
| “The dashboard can secretly call or buy.” | A hidden mutation route would invalidate the safety story. | Both servers are GET-only; frontend tests reject POST/call/order controls; the judge path never constructs the live adapter; there is no transaction adapter. | The separate CLI still contains an explicitly gated live-test command for development. |
| “The static build calls home.” | A portable demo should not need network or auth. | Data is embedded, paths are relative, CSP blocks connections, and the static server exposes an allowlist only. | Direct `file://` loading receives browser-default policy rather than server headers. |
| “Timezone labels quietly change the deadline.” | UTC/local ambiguity can invalidate comparison. | Deterministic data is explicitly UTC; Mission 002 remains Asia/Dhaka UTC+06:00; regression tests assert both labels. | Locale formatting may vary outside the tested Node/browser versions. |
| “A clean clone cannot reproduce it.” | Local caches can disguise hidden dependencies. | `npm ci`, proof verification, in-memory deterministic generation, full tests, and judge build require no `.runs`, CALL-E auth, or phone data. | npm registry availability is required for a first dependency install. |
| “The documented npm command fails on the target Windows host.” | Node’s OS user lookup failed before `tsx` loaded application code. | A repository-local launcher applies a Windows-only numeric cache-name fallback and invokes the pinned `tsx` CLI with `shell:false`; a fresh clone passed without an external shim. | This compensates for a host runtime defect and should be removed when upstream no longer requires it. |

## Fixes driven by the audit

1. Replaced ignored live-artifact dashboard loading with strict tracked proof loading.
2. Added canonical proof hashes, exact file-set validation, bundle digest validation, quote-to-line checks, and tamper tests.
3. Embedded sanitized data into a relative-path static build with a GET-only local server and `connect-src 'none'`.
4. Separated real role-play and deterministic simulation labels throughout the first viewport and docs.
5. Preserved the real unknown constraints field and defined coverage as completeness only.
6. Added focused proof/dashboard test commands and included strict proof loading in the security check.
7. Rewrote architecture, walkthrough, and submission copy to distinguish demonstrated behavior from future production work.
8. Added and clean-clone-tested a cross-platform `tsx` launcher for the observed Windows startup defect.

## Unfixed by design

No additional calls were made to manufacture stronger proof. The honest residual is one consenting role-play plus a deterministic multi-supplier execution. A serious next validation would require new explicit authorization, multiple consenting recipients, privacy/retention controls, and a predefined call budget; none belongs in this mission.
