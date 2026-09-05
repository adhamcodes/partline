# Mission 002 preflight

Status: code-ready, authenticated, tool-ready, awaiting explicit approval. No provider call plan or real call has been created in this mission.

## Fixed live scope

- Recipient: one consenting project-owner phone, represented in stored state only as `ephemeral:mission002-recipient`.
- Role: fictional Beacon Supply.
- Request: two exact ACME MX-240 contactors, pickup today before 16:00; information only.
- Required answers: physical availability, exact model, quantity, total price including tax and currency, exact pickup time/timezone, fulfillment, warranty and constraints.
- Behavior: disclose AI identity and request consent; review all required answers before ending; if warranty was omitted, ask within the same conversation.
- Prohibitions: no order, reservation, purchase, payment promise, appointment, commitment, scheduled retry, redial, alternate number or second follow-up call.
- Client limits: one target, one start submission, one worker, zero pre-start retries, zero follow-up calls. Status reads do not place calls.
- Replay guard: once `mission002-live` has any persisted run artifact, the live command refuses to start again. An interrupted run requires operator review rather than an automatic resume or redial.

## Privacy path

After approval, the private local PowerShell wrapper prompts for the E.164 number with `Read-Host -AsSecureString`. It converts the secure value only long enough to place it in the child process environment, then clears the environment and frees the unmanaged string buffer. The application removes the phone environment value before connecting to CALL-E.

The job and artifact schemas contain an opaque contact reference rather than a phone field. The authorization grant binds a one-way destination fingerprint to the single target. CALL-E output is reduced to allowlisted fields, and exact/formatted appearances of the authorized number are redacted before transcripts or evidence can be stored.

The number necessarily becomes available to the local CALL-E CLI process as the destination argument required by its official interface. It is not printed by PARTLINE, placed in tracked files, stored in PARTLINE artifacts, or included in the command line that launches the local wrapper.

## Local fields still required

The wrapper collects locally:

1. Full E.164 phone number, hidden.
2. Explicit CALL-E region code for that number.
3. Call language.
4. Recipient IANA timezone.
5. Today's 16:00 deadline with explicit UTC offset.

The run refuses missing, ambiguous, malformed or already-passed values. It also rechecks authentication and the required CALL-E tools before dispatch.

## Call boundary

The exact action capable of ringing the phone is the vendor CLI invocation equivalent to:

`calle call start --to-phone <private value> --goal <fixed PARTLINE goal> --region <local value> --language <local value> --timezone <local value>`

The installed CLI performs `plan_call` followed by exactly one `run_call` internally and keeps confirmation data private. PARTLINE then uses `call status` / `get_call_run` only. This command has not been executed.
