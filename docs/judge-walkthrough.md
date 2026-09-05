# Exact 90-second judge walkthrough

Use the portable build (`npm run judge`) or the source dashboard (`npm run dashboard`). Open `http://127.0.0.1:4173`. Do not run `live:test`; the displayed real validation is a tracked sanitized replay, and the page cannot call or transact.

## 0:00–0:15 — understand the job

**Point to:** incident header and one-sentence product definition.

**Say:** “A workshop compressor is offline. PARTLINE calls suppliers in parallel, converts their speech into traceable evidence, compares only qualifying options, and leaves the decision to a human. Here the non-negotiables are two exact ACME MX-240 contactors for pickup by 16:00 UTC.”

## 0:15–0:27 — establish real CALL-E proof

**Point to:** `REAL CALL-E VALIDATION` strip above the fold.

**Say:** “This is explicitly separate from the simulation: one consenting role-play, one completed CALL-E start, zero redials, seven of eight fields recovered, same-call warranty clarification, and no purchase or reservation.”

## 0:27–0:45 — replay concurrent sourcing

**Click:** `Replay 6-second run`.

**Point to:** execution timeline while Atlas and Beacon are highlighted together.

**Say:** “This deterministic zero-call replay makes concurrency inspectable. Atlas and Beacon overlap in recorded event sequence under a two-worker limit. A no-answer does not destroy the job, and clarification is bounded to the missing or conflicting Beacon fields.”

## 0:45–1:03 — explain the decision

**Point to:** recommendation and comparison rows.

**Say:** “Beacon qualifies: exact model, two units, pickup before the deadline, and a supported USD 205 total—USD 43 below Atlas. Delta’s tempting USD 80 option is rejected because it is the wrong model. Cedar stays unknown; PARTLINE never fills gaps to improve the result.”

## 1:03–1:18 — inspect provenance

**Click:** Beacon `Inspect evidence`.

**Point to:** a supported field, quote, source span, and time; then close it.

**Say:** “Every accepted value points back to supplier speech. Corrections remain traceable, and unsupported or contradictory facts cannot silently become a supported cell.”

## 1:18–1:26 — inspect the real transcript projection

**Click:** `Inspect real evidence`.

**Point to:** warranty and unknown constraints.

**Say:** “The sanitized real transcript preserves timestamped recipient evidence. Warranty was clarified in the same conversation; constraints remain unknown.”

## 1:26–1:30 — end at the boundary

**Point to:** red footer boundary.

**Say:** “PARTLINE recommends; it cannot order, reserve, pay, or commit. The human decides.”

## Judge questions to answer precisely

- **Was Beacon a real supplier?** No. Beacon was a fictional role played by the consenting project owner.
- **Were four suppliers called?** No. The four-supplier workflow is deterministic simulation with zero calls.
- **What do the hashes prove?** The tracked sanitized proof files match their published SHA-256 manifest. They do not attest that the historical event happened or that a claim was true.
- **Why is constraints unknown?** The recipient never supplied evidence for it; PARTLINE preserves that gap.
- **Can this screen call or buy?** No. It is read-only, exposes no mutation endpoint, and includes no transaction capability.
