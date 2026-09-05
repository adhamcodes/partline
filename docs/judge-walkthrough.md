# PARTLINE judge walkthrough

Target duration: 90 seconds. The dashboard is read-only and cannot initiate calls or transactions.

1. **0–20 seconds — the problem.** Start at the incident header: a workshop compressor is down, the exact ACME MX-240 model and two-unit quantity are non-negotiable, and pickup is needed by 16:00. The flow line explains why phone calls act as the inventory API for offline suppliers.
2. **20–40 seconds — orchestration.** Press **Replay 6-second run**. Atlas and Beacon activate together under a concurrency limit of two. Watch Beacon develop an evidence gap, Cedar return no answer, and the targeted Beacon clarification finish without blocking other suppliers.
3. **40–60 seconds — decision quality.** Scan the normalized comparison. Delta's USD 80 quote is rejected because it is the wrong model. Cedar remains unknown rather than receiving invented values. Beacon qualifies at USD 205 and is USD 43 below the next valid option.
4. **60–75 seconds — provenance.** Open **Inspect evidence** on Beacon. Each normalized field links to an exact supplier transcript range. Close it, then open **Inspect real evidence** in the dark proof panel.
5. **75–90 seconds — real proof and safety.** Point out the single consenting CALL-E role-play: one completed call, no redial, 7/8 evidence coverage, and same-call warranty clarification. Constraints remain unknown. End on the red boundary: **NO ORDER · NO RESERVATION · HUMAN APPROVAL REQUIRED**.

Do not run `live:test` during the demo. `npm run dashboard` is the only required command.
