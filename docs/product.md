# Concept decision: PARTLINE

## The job to be done

A repair technician has a disabled machine, an exact replacement part requirement, and a deadline. Online pages cannot reliably establish that two compatible units are physically on a local shelf now. PARTLINE asks the people who can check, then shows the technician a short list of evidence-backed options.

This retains the user's phone-as-inventory-API insight while narrowing the first product to exact replacement parts. General procurement, service hiring and open-ended shopping are excluded from the first workflow. The operator supplies the candidate businesses and full international phone numbers; discovery, scraping and guessed contacts are outside Mission 001.

## Alternatives assessed independently

The four dimensions below are the equal-weight dimensions in the [official rubric](https://call-e.devpost.com/rules). Scores are my design estimates on a 1–5 scale, not measured user value, organizer scores, or predictions of winning. No competitor project informed these estimates.

| Direction | Impact | Idea | Implementation opportunity | Demo clarity | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Urgent exact-part sourcing for repair technicians | 5 | 4 | 5 | 5 | 19 |
| Broad urgent procurement and service sourcing | 4 | 4 | 5 | 3 | 16 |
| Accessible appointment availability finder | 5 | 3 | 4 | 3 | 15 |
| Small-business failed-delivery exception coordinator | 4 | 3 | 4 | 4 | 15 |
| Incident escalation and staff acknowledgment | 4 | 3 | 4 | 4 | 15 |

The narrow part-sourcing workflow wins this assessment for a solo builder because:

- Impact has an identifiable user, deadline and costly delay. The first interview can validate how many supplier calls a technician currently makes and whether exact-model mistakes are common. These are hypotheses; we have not conducted those interviews.
- Idea quality comes from resolving missing and contradictory evidence, not from simply calling several businesses. A cheap wrong-model quote is visibly rejected.
- Implementation has useful depth: concurrent independent calls, structured questions, provenance, uncertainty, adaptive follow-ups, partial outcomes and crash recovery all serve the same task.
- The demo can communicate a before/after decision without explaining a complex organization or integrating calendars, insurance systems, dispatch software or carrier accounts.

Broad procurement creates too many incomparable meanings for price, compatibility and availability. Appointment sourcing has strong value but adds sensitive contexts and calendar/account dependencies. Delivery coordination needs carrier and merchant integration to demonstrate a complete resolution. Escalation is easier to show but offers less rich answer normalization and a less distinctive phone-native contribution. None of these are objectively inferior products; they are weaker fits for this particular solo scope.

## Smallest compelling workflow

1. Enter the repair need, exact model, quantity, cutoff, currency, pickup/delivery requirement and 3–4 known suppliers.
2. Review the destinations, questions and maximum contact budget. An authorized human approves information gathering before any live call.
3. Run independent CALL-E inquiries. Each discloses AI identity and asks permission for a short inquiry.
4. Show initial answers as evidence cells. Keep missing warranty, conflicting totals, tentative stock and unanswered calls visible.
5. Within the approved budget, ask only the unresolved questions of viable suppliers. Do not retry refusals or known failures by dialing again.
6. Compare exact-model options, preserve source quotes and timestamps, and stop at a human decision. The technician places any order directly.

## The first 30 seconds for a judge

0–5 seconds: “The compressor is down. We need two exact parts before four.” Show the request and candidate list.

5–12 seconds: Four independent supplier tracks: two quotes, one unanswered, one wrong model.

12–20 seconds: A cell highlights conflicting totals and missing warranty. The targeted follow-up resolves both while preserving the earlier quotes.

20–30 seconds: The shortlist shows USD 205 and USD 248; the USD 80 mismatch stays excluded. Expand the price to its exact statement, then show “human decision required.”

The Mission 001 demonstration must display SIMULATION throughout. A later final video must separately identify authentic consented call footage and deterministic replay. Never imply fictional inventory is real. A judge may assess the submitted materials without operating the app, making a coherent, truthful demonstration essential.

## CALL-E's unique role

CALL-E supplies goal-conditioned voice interaction, dialing, conversation handling and transcript/result retrieval. That reaches current local knowledge which may never exist in a web inventory feed. PARTLINE supplies the domain constraints and decision workflow around those calls. Without CALL-E or an equivalent human phone interaction, the central unavailable information remains unavailable.

## What would falsify the direction

Technicians may already have a trusted supplier with reliable stock feeds. Shops may refuse automated callers. Exact-model verification may require photographs rather than voice. Stock may change too quickly for useful comparisons. The first live experiment should test willingness and extraction quality; the first user interview should test whether comparison actually changes the technician's decision. No time savings, cost savings or success-rate claim is currently supported by measurements.
