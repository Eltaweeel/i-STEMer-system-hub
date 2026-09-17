# MVP Packet 0 state report — 2026-09-16

## Repositories

- System: `i-STEMer-system-hub`, local path `business-agent-os`, main at `f9aa20a4c1b2ef6b144627e0aaaec4eaaddaee10`.
- Agents: `i-STEMer-agents-hub`, local path `i-STEMer-agents-hub`, main at `a88815f304b7417bf32ca0cd2cf2369b45c2d767`.
- Both working trees contain uncommitted work. No uncommitted work is treated as published or deployable.

## Current verification

- System `npm test`: 22 test files, 153 tests passed.
- Agents `npm run typecheck`: passed.
- Agents `npm test`: 1 test file, 2 tests passed.
- Hermes: v0.21.1, upstream `77e55b4d`, local `8aa219ef (+1 carried commit)`.
- Hermes profiles: only `default` exists; model is `anthropic/claude-opus-4.6`; gateway is stopped.
- Hermes provider/profile authentication and tool availability for i-STEMer are unverified.

## Remote Supabase read-only preflight — 2026-09-16

- Project: `i-STEMer`, ref `ezsfdlkuzusylbqxqnod`, region `eu-west-2`, status `ACTIVE_HEALTHY`.
- Database: PostgreSQL `17.6.1.166`.
- Applied migrations: `20260909165106_phase_1a_schema_security` only.
- Phase 1A tables are present with RLS enabled. No tenant, membership, agent-run, or artifact rows are
  currently present.
- No migration, identity, membership, task, or artifact was created by this preflight.
- Remote state is read-only evidence; it does not prove authenticated staging or runtime execution is ready.
- Supabase security advisors report three RLS-enabled tables without policies (`private.platform_audit`,
  `private.provisioning_operations`, `public.command_receipts`) and a public `SECURITY DEFINER` function
  `public.rls_auto_enable()` executable by both `anon` and `authenticated`. These are blocking security
  findings for a live staging command path and must be resolved through a reviewed migration before task
  writes are enabled.

## Confirmed gaps

- No agents-hub to system-hub transport.
- No durable marketing task/run/artifact/approval workflow.
- Current system UI uses fixture projections.
- No real Adam/Omar/Ziad/Nour Hermes profiles provisioned.
- No authenticated staging journey verified end to end.
- No Telegram or Meta publication integration; both remain out of the controlled MVP.

## Packet 0 disposition

Reconnaissance is complete. Packet 1 may begin with versioned contracts and a no-op transport fixture.
The real-runtime packet must stop if Hermes provider/profile compatibility or staging authorization cannot
be verified. No credentials are stored in this report.
