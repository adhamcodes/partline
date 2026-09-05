# Official research record — September 5, 2026

Research was restricted to organizer rules/resources and CALL-E's official integration documentation/source. The broad initial search surfaced unrelated submission hits; they were excluded and no project gallery, competitor page, or community project source was opened. The community repository contents were deliberately not browsed.

## Current official obligations

The [official rules](https://call-e.devpost.com/rules) require a functioning CALL-E integration and assess impact, idea quality, technical implementation and product/demo equally. The submission deadline is September 14, 2026 at 23:45 SGT. Submission materials include a description, public YouTube/Vimeo demonstration under three minutes, the CALL-E account email, and a contribution pull request to the designated public repository. Testing access must remain available through judging, ending October 13, 2026. English materials or translations are required. Entrant eligibility and ownership obligations still apply; this task does not verify the individual's eligibility or submit an entry.

The rules describe 20 calls for a new account and a discretionary additional-call request. These are program terms, not a verified balance for this account. No credits were requested or spent in this mission.

## Resources and contracts read

| Official source | Finding used |
| --- | --- |
| [Hackathon resources](https://call-e.devpost.com/resources) | Links integrations, setup, SDK/API documentation and support; distinguishes installation from submission repositories. |
| [Stable installation guide](https://open.heycall-e.com/document/mcp-archive/CALL-E-installation-guide.md) | Portable global skill plus CLI, browser login and read-only verification. |
| [Integration README](https://github.com/CALLE-AI/call-e-integrations/blob/main/README.md) | CLI/MCP/SDK alternatives, supported regions, asynchronous lifecycle. |
| [Official MCP contract](https://github.com/CALLE-AI/call-e-integrations/blob/main/docs/mcp/openagent-oauth.md) | Plan → execute → poll, structuredContent envelope, terminal statuses, timeout and ambiguous-start handling. |
| [Official CLI reference](https://github.com/CALLE-AI/call-e-integrations/blob/main/packages/cli/docs/cli-reference.md) | call start keeps confirmation data private; call status polls; recover is not a fresh start. |
| Installed `@call-e/cli@0.5.0` source | Verified actual argument mapping, error fields, local recovery handling and output envelopes. |
| Authenticated `calle mcp tools` schema catalog | Confirmed plan_call, run_call, get_call_run, track_ui_events; no custom extraction schema parameter on plan_call. |

The documentation website did not load in the web fetcher. The official repository's current MCP guide and installed CLI reference supplied the interface evidence. The stable guide's relative archive `cli.md` link returned a 404 page; the canonical repository reference was used instead.

## Local installation verified

- Node.js v24.16.0; npm/npx 11.13.0; CALL-E CLI 0.5.0.
- Portable skill available from the user's global agents skill directory.
- Authentication usable; required tool catalog available through both direct read-only verification and the new application readiness command.
- Authentication raw JSON, token caches and login URLs are not copied into this repository.
- The application does not add an API key or a second SDK authentication path.

## Submission work intentionally pending

Live integration evidence and human value validation, a polished dashboard, an authentic video, final eligibility review, and the contribution PR remain future work. Before publication, read only the contribution instructions of the designated repository, without browsing project entries. The current mission neither registers an entry nor publishes code.
