# Web release status

2026-09-15. Owner now explicitly requests a functional web application and publication to the existing GitHub repository and Supabase project, with website hosting performed afterward by their Hermes agent. This supersedes prior planning-only and no-publication instructions for reviewed release work. It does not turn unfinished features into accepted functionality.

## Verified starting state

- GitHub origin main resolves to the reviewed release commit published for this increment (verify with `git ls-remote origin refs/heads/main`).
- i-STEMer app is a Next 16.3.5 standalone server using FixtureAdapter for the read-only demo projections. The home page and Hermes team page state that nothing is live and no action can be taken.
- Supabase project ezsfdlkuzusylbqxqnod, i-STEMer, organization cdqpgjxqkwztasiqigns, eu-west-2 is ACTIVE_HEALTHY.
- Remote migration ledger contains 20260909165106 only.
- Read-only counts show zero Auth users, tenants, memberships and campaigns. Database foundation exists; there is no runnable authenticated business environment yet.
- Existing dirty source, tests and planning artifacts are preserved. No credential values are included in this document.

## Release work

The published package is the supported Next server runtime, Supabase session foundation, safe missing-configuration behavior, named Adam roster/evidence-flow fixture, capacity-panel empty state, and accurate deployment README. Existing sample visuals stay labeled. Subsequent required work includes authorization/MFA enforcement, tenant data, private reads, protected workflow acceptance, connected provider telemetry, and real Auth checks. Completion of this package must not be described as completion of the user's functional-system request.

Local implementation and verification can proceed under the latest request while independent operational configuration is resolved. Before live identities, invitation delivery or privileged runtime use, retain the applicable identity authorization, recovery and custody safeguards. An explicit question for the owner's individual demo account was sent; no response is assumed. No Hadeer/employee account is implied.

GitHub publication must contain reviewed source and deployment instructions with no secrets. Supabase publication means required reviewed backend migrations/configuration, not website hosting. Existing migration must not be edited or reapplied. Agent runtime and Telegram execution remain separate from the web release and must be labeled unavailable until verified.

## Evidence still required

Local install/lint/types/tests/build; browser smoke checks; fresh remote catalog/security review for added backend changes; real session and negative authorization tests; published commit identifier and remote verification; deployment instructions verified against the actual artifact. No final release or publication success is recorded yet.

## Local implementation evidence — 2026-09-15

Next 16.3.5 / React 19.3.0 and pinned Supabase SSR 0.12.7 / client 2.116.0 installed successfully. i-STEMer now builds as a standalone server; Northwind remains static. English/Arabic sign-in, recovery/reset, TOTP enrollment/verification, a fresh session/membership tenant gate, and the named team/capacity fixture are implemented. Lint, typecheck and 150 unit tests passed; the untouched PGlite baseline passed 23 tests. Both production builds passed before the final security-header change; final rebuild is separately checked before publication.

The standalone server was started and viewed in the browser: home, nested sample routes, and `/hermes-team/` render; the page shows Adam (Main Orchestrator), the initial Nour/Omar/Ziad team, planned roles, Omar-to-Ziad/Nour handoffs, and the Ziad-to-Hana/marketing-team handoff. English/Arabic login and recovery show explicit missing-configuration states. HTTP checks confirmed private no-store headers on account/tenant routes and 503 for unconfigured callback. No provider key, account, tenant or campaign was created. No live login/recovery/MFA or quota claim is made. Owner AAL2 is checked in the app; additive database-level assurance enforcement remains necessary before live identities, alongside membership/bootstrap, provider telemetry, and real session tests.

Claude Opus high reviewed the actual session code and approved the foundation with documented limits. The MFA delta has a separate final review. Initial CLI implementation failed during its run; subsequent Codex implementation and host verification completed the files. Preview/source publication is an incremental deliverable, not completion of the requested functional business system. The Adam/Nour/Omar/Ziad workflow is now represented in a tenant fixture projection; it is not a running Nous Hermes process, Telegram integration, or external-action workflow.

Final local checks for the current increment: lint/typecheck and all 150 tests passed; both final production builds passed with security headers, MFA routes, and `/hermes-team/`. The temporary preview process initially locked the build output on Windows; stopping it resolved the EBUSY rebuild failure, then the standalone server restarted successfully. `/en/auth/mfa/` is included. Claude's separate MFA review approved the auth increment with no blocking findings and retained the abandoned-factor recovery/live-test limitations. Standalone static assets, entry path, team roster, and capacity empty state were verified by serving the actual output.
