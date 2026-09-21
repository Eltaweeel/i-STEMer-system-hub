# i-STEMer system hub

Web application for the i-STEMer agent workspace.

Two things live here and they are easy to confuse. The browsable pages -- command center, agents, named Adam roster, evidence handoffs, capacity panel -- use labeled sample data and execute nothing. The working system is the tenant workspace described below, where briefs, approvals, the audit trail and token allowances are backed by real commands against the database. The server/session foundation includes English/Arabic sign-in, recovery, password reset, TOTP setup/verification and protected tenant-access checks.

This is not a running Nous Hermes installation, and nothing in it publishes anywhere: approving records a decision, and no external effect follows. See [release status](docs/WEB_RELEASE_STATUS.md).

## Local development

Use Node 22 or newer and npm 10 or newer. From the repository root:

```sh
npm ci
npm run dev --workspace apps/istemer-demo
```

The application normally opens at http://localhost:3000. Sample pages require no Supabase configuration. Account routes are under `/en/auth/login/` and `/ar/auth/login/`; missing configuration is shown explicitly.

The named-team and capacity fixture is at `/hermes-team/`. It shows Adam (Main Orchestrator), the initial Nour/Omar/Ziad team, planned roles, evidence handoffs, and the provider-telemetry empty state. It does not execute agents or infer quota.

## The tenant workspace

Everything above is fixture or sign-in. The working system is one page:
`/en/t/<tenantId>/` (or `/ar/t/...`). It requires an authenticated session, an
active membership in that tenant, and MFA; each of those is stated on screen
when missing rather than silently hiding the page. It is composed of four
panels, in the order the work actually flows:

- **Token allowances.** Per-member limit, reported consumption, and what
  remains. The owner sets a limit for any member; nobody else sees another
  member's figures. Runs whose provider returned no usage figure are counted
  separately and called out, because an unreported run is not a free one. The
  balance on the upstream provider subscription is *not* shown: nothing this
  system observes can derive it, so the page says so rather than estimating.
- **Brief.** Submits the objective that starts a run. Hand-off from there is
  driven by database triggers -- Omar, then Ziad, then Nour -- not by an agent
  deciding to delegate.
- **Approvals.** Two stages. First the strategy and calendar; then, separately,
  each finished post. A finished post shows its caption and states outright
  whether its asset is produced or still a placeholder. Approving records a
  decision and nothing else: no external publication happens anywhere in this
  system.
- **Audit trail.** Every decision, with the revision it was bound to.

A decision carries the digest of the revision the owner was shown, so a
revision that moved underneath produces a refused decision rather than one
applied to content nobody saw.

## Before this runs against a real database

Two things cannot be done from the repository and are not done here:

1. The Postgres executor login roles must be provisioned by the project owner.
   The schema defines them NOLOGIN; passwords are never improvised in code.
2. The Hermes profiles must be created on the machine that will run them, from
   `profiles/istemer-agents.yaml` in the agents hub. `node
   scripts/provision-profiles.mjs` prints the exact commands and the manual
   credential checklist; it never touches `~/.hermes` and never reads a secret.

See [docs/OWNER_INPUTS_REQUIRED.md](docs/OWNER_INPUTS_REQUIRED.md).

## Configuration

Configure these environment variables privately in the i-STEMer application environment:

- `NEXT_PUBLIC_SUPABASE_URL`: intended Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key only; never a secret or service-role key.
- `APP_ORIGIN`: exact origin used for authentication redirects, without a path.

Next public environment values are included at build time. Rebuild when changing the connected project. Configure the same origin and `/auth/callback/` in Supabase's allowed redirect configuration before testing recovery. Do not disable email verification to make a test pass. No automatic signup, account creation, membership grant or database seed occurs at application startup.

Before provisioning live demo identities, complete database-level MFA enforcement and the reviewed membership setup. The UI's owner MFA gate alone does not add that enforcement to the existing database baseline. An abandoned TOTP setup whose secret was not saved requires administrator recovery; existing factors are never automatically deleted. Session sign-out is local to the current session, and public Auth traffic currently relies on Supabase's throttling.

## Build and check

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

The root build covers both i-STEMer and the Northwind fixture conformance app. i-STEMer produces a Next server build; Northwind retains a static export. Database baseline tests are separate: `npm --prefix supabase/tests ci` then `npm --prefix supabase/tests test`. Local database tests do not prove live Auth or Storage behavior.

## Hosting handoff

See [VPS deployment instructions](deploy/README.md). GitHub holds source; Supabase supplies backend services; the Next web server must be hosted separately. Deployment verification and unfinished features are recorded in the release status rather than implied by a build succeeding.
