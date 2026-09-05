# Mission 002 sanitized proof bundle

This tracked bundle is a minimal, source-safe projection of the completed Mission 002 CALL-E validation. The recipient was the project owner role-playing the fictional supplier Beacon Supply and consented to the call.

It establishes only that PARTLINE completed one CALL-E validation with one start attempt, no redial, seven supported required fields, same-call warranty clarification, and no purchase or reservation. `constraints` remains unknown. It does not prove that Beacon Supply is a real business, that inventory existed outside the role-play, or that the recorded claims are independently true.

`validation.json` contains the normalized proof metadata and seven recipient-supported claims. `transcript.sanitized.txt` contains only the dialogue needed to inspect those claims. Phone numbers, provider run identifiers, authorization data, credentials, callback URLs, confirmation values, and provider-private payloads are excluded.

`integrity.json` records SHA-256 hashes of the UTF-8 text after CRLF-to-LF normalization. Run `npm run proof:verify` from the repository root. Hash verification detects changes to this sanitized bundle; it is not a signature, proof of consent, proof of who spoke, or proof that the claims were true.
