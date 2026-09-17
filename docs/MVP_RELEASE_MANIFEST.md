# MVP release manifest — blocked candidate, no package created

Historical inventory: later Adam/Omar repairs are recorded in [the repair packet](ADAM_OMAR_REPAIR_PACKET.md). This inventory must be regenerated before packaging; it is not a current release selection. No release has been uploaded.

Date: 2026-09-16

This is an exact source selection for a FUTURE reviewed release, not a statement that these files are deployable. No files have been uploaded. Regenerate this inventory and hashes after repairs and review; current HEAD alone cannot reproduce either dirty tree.

## Provenance
System path: D:/Abdo/Private/STEMer/Claude code/Building/business-agent-os
origin: https://github.com/Eltaweeel/i-STEMer-system-hub.git
main @ f9aa20a4c1b2ef6b144627e0aaaec4eaaddaee10
Modified tracked paths:
- apps/istemer-demo/app/[locale]/t/[tenantId]/page.tsx
- apps/istemer-demo/package.json
- package-lock.json
- packages/core/contracts/src/index.ts
- packages/core/contracts/src/ports.ts
New untracked implementation and migrations are listed below; the two preflight documents are new documentation.
Agents path: D:/Abdo/Private/STEMer/Claude code/Building/i-STEMer-agents-hub
origin: https://github.com/Eltaweeel/i-STEMer-agents-hub.git
main @ a88815f304b7417bf32ca0cd2cf2369b45c2d767
All src/, contracts/, profiles/, docs/, package.json, package-lock.json, tsconfig.json and node_modules/ are untracked.

## Build and tests
System scripts: test=vitest run; typecheck=npm run typecheck --workspaces --if-present; lint=eslint . plus dependency-cruiser and token/domain guards; root build builds both demo workspaces.
Future Linux build: npm ci, then npm run build --workspace @istemer/demo.
Tests: npm test; npm run lint; npm run typecheck from system root.
Keep northwind-demo and test fixtures in the SOURCE selection because workspace installation/typecheck/conformance checks refer to them; do not deploy a Northwind service.
Agents scripts: npm test; npm run typecheck; npm run lint. No build or start script exists. Agents lint currently fails.
Separate baseline SQL test command: npm test --prefix supabase/tests (not run here; does not prove new MVP migrations).
See STAGING_DEPLOYMENT_PREFLIGHT.md for actual test results and coverage limits.

## Environment names only
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- APP_ORIGIN
- NODE_ENV
- PORT
- HOSTNAME
Public Supabase variables are required at Next build and runtime; APP_ORIGIN is used by auth callback/recovery.
No service-role key is required by the current application code. No Hermes endpoint/auth variable is wired into the workflow route; that is an implementation blocker.
Configuration values and secrets were not inspected. Supply configuration outside the source archive.

## Runtime and target
Host: 77.237.232.170; user: istemerdeploy; hostname: i-stemer-system-hub.eltaweel.site.
Upload: /srv/istemer-staging/releases; shared: /srv/istemer-staging/shared; active: /srv/istemer-staging/current (root owned).
Build on Linux with Node >=22/npm >=10, verified separately. Do not copy Windows node_modules.
For a future Linux standalone package, copy the CONTENTS of apps/istemer-demo/.next/standalone/ to the release root, copy .next/static into release/apps/istemer-demo/.next/static and public into release/apps/istemer-demo/public.
Expected start from that release root:
`NODE_ENV=production HOSTNAME=127.0.0.1 PORT=3240 node apps/istemer-demo/server.js`
This is the planned standalone layout, not a runtime test. Validate the generated server path before activation. No agents start command exists yet.
No Nginx or systemd configuration is authorized in this task.

## Rollback procedure (future approved deployment)
Before activation, record active release identity, configuration references and prior service command. Upload to a new uniquely named release directory; never overwrite current. An authorized VPS administrator must activate or restore current because it is root-owned.
If health/login checks fail, restore the prior release and its matching configuration and restart only the i-STEMer service through the agreed activation mechanism. Verify loopback health and the staging hostname.
Database migrations need a separate reviewed compatibility/rollback plan; reverting application files does not undo SQL or data. The current five pending migrations are blocked and excluded from executable release packaging. No destructive automatic database rollback is permitted.
At present no activation service or rollback command has been verified, so activation is blocked.

## Simulated and deferred behavior
Current workflow uses a fixture clock and local placeholder engine. No live Omar retrieval, Hermes dispatch or confirmed four-profile execution. Ziad media is unavailable; finished posts are placeholder captions. Persisted body/lineage and exact approval semantics are incomplete. Retry has no execution worker. Auth provisioning, MFA rehearsal, deployment and end-to-end verification are pending. Meta publication and external messaging remain outside the MVP.

## Exact candidate system source files
- `apps/istemer-demo/__tests__/agent-transport-client.test.ts`
- `apps/istemer-demo/__tests__/staging-task-registry.test.ts`
- `apps/istemer-demo/adapters/agent-transport-client.ts`
- `apps/istemer-demo/adapters/staging-task-registry.ts`
- `apps/istemer-demo/app/[locale]/t/[tenantId]/WorkflowBriefForm.tsx`
- `apps/istemer-demo/app/api/approvals/route.ts`
- `apps/istemer-demo/app/api/workflows/retry/route.ts`
- `apps/istemer-demo/app/api/workflows/route.ts`
- `apps/istemer-demo/lib/workflow/persistence.ts`
- `packages/core/contracts/__tests__/agent-transport-parity.test.ts`
- `packages/core/contracts/__tests__/agent-transport-port.test.ts`
- `packages/core/contracts/__tests__/agent-transport.test.ts`
- `packages/core/contracts/agent-transport.v1.json`
- `packages/core/contracts/src/agent-transport.ts`
- `packages/core/engine/package.json`
- `packages/core/engine/src/index.test.ts`
- `packages/core/engine/src/index.ts`
- `packages/core/engine/tsconfig.json`
- `.dependency-cruiser.cjs`
- `.gitignore`
- `apps/istemer-demo/__tests__/auth-boundaries.test.ts`
- `apps/istemer-demo/__tests__/demo-indicator.test.tsx`
- `apps/istemer-demo/__tests__/manifest-schema.test.ts`
- `apps/istemer-demo/__tests__/mfa-boundaries.test.ts`
- `apps/istemer-demo/__tests__/organization-roster.test.ts`
- `apps/istemer-demo/__tests__/routes-render.test.tsx`
- `apps/istemer-demo/__tests__/tenant-access.test.ts`
- `apps/istemer-demo/adapters/fixture-adapter.ts`
- `apps/istemer-demo/app/[locale]/auth/[mode]/page.tsx`
- `apps/istemer-demo/app/[locale]/auth/mfa/enroll.tsx`
- `apps/istemer-demo/app/[locale]/auth/mfa/page.tsx`
- `apps/istemer-demo/app/[locale]/layout.tsx`
- `apps/istemer-demo/app/[locale]/t/[tenantId]/page.tsx`
- `apps/istemer-demo/app/agents/[id]/page.tsx`
- `apps/istemer-demo/app/agents/page.tsx`
- `apps/istemer-demo/app/approvals/[id]/page.tsx`
- `apps/istemer-demo/app/approvals/page.tsx`
- `apps/istemer-demo/app/auth/callback/route.ts`
- `apps/istemer-demo/app/coordination-cycle/page.tsx`
- `apps/istemer-demo/app/globals.css`
- `apps/istemer-demo/app/hermes-team/page.tsx`
- `apps/istemer-demo/app/layout.tsx`
- `apps/istemer-demo/app/organization/page.tsx`
- `apps/istemer-demo/app/page.tsx`
- `apps/istemer-demo/app/system-health/page.tsx`
- `apps/istemer-demo/app/workflows/[id]/page.tsx`
- `apps/istemer-demo/app/workflows/page.tsx`
- `apps/istemer-demo/app/workspaces/[agentId]/page.tsx`
- `apps/istemer-demo/data/agents/agent-manifests.json`
- `apps/istemer-demo/fixtures/approvals.ts`
- `apps/istemer-demo/fixtures/capacity.ts`
- `apps/istemer-demo/fixtures/coordination-cycle.ts`
- `apps/istemer-demo/fixtures/hermes-team.ts`
- `apps/istemer-demo/fixtures/organization.ts`
- `apps/istemer-demo/fixtures/workflows.ts`
- `apps/istemer-demo/fixtures/workspaces.ts`
- `apps/istemer-demo/lib/auth/actions.ts`
- `apps/istemer-demo/lib/auth/identity.ts`
- `apps/istemer-demo/lib/auth/mfa-actions.ts`
- `apps/istemer-demo/lib/auth/redirects.ts`
- `apps/istemer-demo/lib/auth/session.ts`
- `apps/istemer-demo/lib/auth/tenant.ts`
- `apps/istemer-demo/lib/env.ts`
- `apps/istemer-demo/lib/supabase/browser.ts`
- `apps/istemer-demo/lib/supabase/server.ts`
- `apps/istemer-demo/next-env.d.ts`
- `apps/istemer-demo/next.config.mjs`
- `apps/istemer-demo/package.json`
- `apps/istemer-demo/proxy.ts`
- `apps/istemer-demo/public/branding/README.md`
- `apps/istemer-demo/public/branding/hadeer-avatar.jpeg`
- `apps/istemer-demo/public/branding/istemer-logo.png`
- `apps/istemer-demo/tenant/tenant.config.ts`
- `apps/istemer-demo/tsconfig.json`
- `apps/northwind-demo/adapters/fixture-adapter.ts`
- `apps/northwind-demo/app/agents/[id]/page.tsx`
- `apps/northwind-demo/app/agents/page.tsx`
- `apps/northwind-demo/app/globals.css`
- `apps/northwind-demo/app/layout.tsx`
- `apps/northwind-demo/app/organization/page.tsx`
- `apps/northwind-demo/app/page.tsx`
- `apps/northwind-demo/fixtures/agents.ts`
- `apps/northwind-demo/fixtures/organization.ts`
- `apps/northwind-demo/fixtures/time.ts`
- `apps/northwind-demo/next-env.d.ts`
- `apps/northwind-demo/next.config.mjs`
- `apps/northwind-demo/package.json`
- `apps/northwind-demo/tenant/tenant.config.ts`
- `apps/northwind-demo/tsconfig.json`
- `eslint.config.js`
- `package-lock.json`
- `package.json`
- `packages/core/__tests__/guards-prove-themselves.test.ts`
- `packages/core/__tests__/leakage-scanner.ts`
- `packages/core/contracts/__tests__/graph-union.test.ts`
- `packages/core/contracts/__tests__/restriction.test.ts`
- `packages/core/contracts/__tests__/revision-approval.test.ts`
- `packages/core/contracts/package.json`
- `packages/core/contracts/src/activity.ts`
- `packages/core/contracts/src/agent.ts`
- `packages/core/contracts/src/approval.ts`
- `packages/core/contracts/src/clock.ts`
- `packages/core/contracts/src/coordination.ts`
- `packages/core/contracts/src/graph.ts`
- `packages/core/contracts/src/index.ts`
- `packages/core/contracts/src/ports.ts`
- `packages/core/contracts/src/records.ts`
- `packages/core/contracts/src/restriction.ts`
- `packages/core/contracts/src/revision-approval.ts`
- `packages/core/contracts/src/schemas.ts`
- `packages/core/contracts/src/team.ts`
- `packages/core/contracts/src/view-meta.ts`
- `packages/core/contracts/src/workflow.ts`
- `packages/core/contracts/src/workspace.ts`
- `packages/core/contracts/tsconfig.json`
- `packages/core/fixtures/package.json`
- `packages/core/fixtures/src/index.ts`
- `packages/core/fixtures/tsconfig.json`
- `packages/core/organization/package.json`
- `packages/core/organization/src/index.ts`
- `packages/core/organization/tsconfig.json`
- `packages/core/ui/__tests__/agent-detail.test.tsx`
- `packages/core/ui/__tests__/approval-inbox.test.tsx`
- `packages/core/ui/__tests__/command-palette.test.tsx`
- `packages/core/ui/__tests__/contrast.test.ts`
- `packages/core/ui/__tests__/coordination-cycle.test.tsx`
- `packages/core/ui/__tests__/design-concept.test.tsx`
- `packages/core/ui/__tests__/team-view.test.tsx`
- `packages/core/ui/__tests__/workflow-diagram.test.tsx`
- `packages/core/ui/__tests__/workspace-components.test.tsx`
- `packages/core/ui/package.json`
- `packages/core/ui/src/components/AgentDetailView.tsx`
- `packages/core/ui/src/components/AppShell.tsx`
- `packages/core/ui/src/components/ApprovalDetailView.tsx`
- `packages/core/ui/src/components/ApprovalInboxView.tsx`
- `packages/core/ui/src/components/CommandCenterView.tsx`
- `packages/core/ui/src/components/CommandPalette.tsx`
- `packages/core/ui/src/components/ContentCalendar.tsx`
- `packages/core/ui/src/components/CoordinationCycleView.tsx`
- `packages/core/ui/src/components/DemoIndicator.tsx`
- `packages/core/ui/src/components/DesignConceptCard.tsx`
- `packages/core/ui/src/components/NotificationPreviewCard.tsx`
- `packages/core/ui/src/components/OrganizationGraph.tsx`
- `packages/core/ui/src/components/OrganizationTree.tsx`
- `packages/core/ui/src/components/RehearsalFlowPanel.tsx`
- `packages/core/ui/src/components/SpecialistWorkspaceView.tsx`
- `packages/core/ui/src/components/StatusBadge.tsx`
- `packages/core/ui/src/components/SystemHealthView.tsx`
- `packages/core/ui/src/components/TeamView.tsx`
- `packages/core/ui/src/components/TrendAlertCard.tsx`
- `packages/core/ui/src/components/WorkflowDiagram.tsx`
- `packages/core/ui/src/contrast.ts`
- `packages/core/ui/src/index.ts`
- `packages/core/ui/src/tokens.css`
- `packages/core/ui/tsconfig.json`
- `scripts/check-domain-hardcode.mjs`
- `scripts/check-primitive-tokens.mjs`
- `test-fixtures/scale/second-tenant-conformance.test.ts`
- `tsconfig.base.json`
- `tsconfig.json`
- `vitest.config.ts`

## Exact candidate agents source files
- `contracts/agent-transport.v1.json`
- `package-lock.json`
- `package.json`
- `profiles/README.md`
- `profiles/SOUL.template.md`
- `profiles/istemer-agents.yaml`
- `src/agents/adam.ts`
- `src/agents/nour.ts`
- `src/agents/omar.ts`
- `src/agents/ziad.ts`
- `src/contract-parity.test.ts`
- `src/contracts.ts`
- `src/index.test.ts`
- `src/index.ts`
- `src/transport.test.ts`
- `src/transport.ts`
- `tsconfig.json`

## Exact excluded system tracked/untracked project files
These are review material or deferred migrations, not application runtime payload:
- `docs/FUNCTIONAL_DEMO_ROADMAP.md`
- `docs/LIVE_STAGING_DEPLOYMENT_RUNBOOK.md`
- `docs/MVP_PACKET_0_STATE_2026-09-16.md`
- `docs/MVP_PLAN_DEBATE_RULINGS_2026-09-16.md`
- `i-STEMer-MVP-Plan-2026-09-16.tar.gz`
- `i-STEMer-VPS-DEPLOYMENT-DETAILS.md`
- `supabase/migrations/20260915224433_mvp_security_hardening.sql`
- `supabase/migrations/20260915225316_mvp_workflow_command.sql`
- `supabase/migrations/20260915225557_mvp_artifact_persistence.sql`
- `supabase/migrations/20260915225738_mvp_approval_command.sql`
- `supabase/migrations/20260915230015_mvp_workflow_recovery.sql`
- `Multi-route approval workflow-v3.2/.thumbnail`
- `Multi-route approval workflow-v3.2/Bilingual QA results.md`
- `Multi-route approval workflow-v3.2/Bilingual translation inventory.md`
- `Multi-route approval workflow-v3.2/Business Agent OS v1 (previous).dc.html`
- `Multi-route approval workflow-v3.2/Business Agent OS v2 (final).dc.html`
- `Multi-route approval workflow-v3.2/Business Agent OS v3 bilingual (final).dc.html`
- `Multi-route approval workflow-v3.2/Business Agent OS v3.1 bilingual handoff (final).dc.html`
- `Multi-route approval workflow-v3.2/Business Agent OS.dc.html`
- `Multi-route approval workflow-v3.2/Changelog and open decisions.md`
- `Multi-route approval workflow-v3.2/Design handoff - Business Agent OS v2.md`
- `Multi-route approval workflow-v3.2/Design handoff - Business Agent OS v3 bilingual.md`
- `Multi-route approval workflow-v3.2/delivery/Business Agent OS v1 (previous).dc.html`
- `Multi-route approval workflow-v3.2/delivery/Business Agent OS v2 (final).dc.html`
- `Multi-route approval workflow-v3.2/delivery/Changelog and open decisions.md`
- `Multi-route approval workflow-v3.2/delivery/Design handoff - Business Agent OS v2.md`
- `Multi-route approval workflow-v3.2/delivery/support.js`
- `Multi-route approval workflow-v3.2/qa-harness.html`
- `Multi-route approval workflow-v3.2/support.js`
- `Multi-route approval workflow-v3.2/uploads/pasted-1787566177059-0.png`
- `README.md`
- `deploy/README.md`
- `docs/ADAM_WORKFLOW_DECISIONS.md`
- `docs/BATCH-1.md`
- `docs/DECISION_REGISTER.md`
- `docs/DELEGATED_EXECUTION.md`
- `docs/HERMES_ROLE_PROPOSAL.md`
- `docs/IMPLEMENTATION-CHECKPOINT.md`
- `docs/IMPLEMENTATION_PHASES.md`
- `docs/MASTER_IMPLEMENTATION_PLAN.md`
- `docs/OI01-OI03_DECISION_WORKSHEET.md`
- `docs/OI01-OI03_OPERATIONS_RUNBOOK.md`
- `docs/OWNER_INPUTS_REQUIRED.md`
- `docs/PHASE_1A_SCHEMA_SECURITY.md`
- `docs/PHASE_1_GAP_MATRIX.md`
- `docs/PLANNING_DEBATE_2026-09-13.md`
- `docs/PRODUCTION-IMPLEMENTATION-PLAN.md`
- `docs/REMOTE_SUPABASE_APPLY_PREFLIGHT.md`
- `docs/SUPABASE_DRY_RUN_DIAGNOSIS.md`
- `docs/SUPABASE_INTEGRATION_READINESS.md`
- `docs/SUPABASE_PROJECT_CONTEXT.md`
- `docs/TRACEABILITY_MATRIX.md`
- `docs/WEB_RELEASE_STATUS.md`
- `docs/evidence/phase-1/baseline.md`
- `docs/product-architecture/ARCHITECTURE_DEBATE_ROUND_1.md`
- `docs/product-architecture/ARCHITECTURE_DEBATE_ROUND_2.md`
- `docs/product-architecture/DECISION_REGISTER.md`
- `docs/product-architecture/FULL_PROJECT_MASTER_PLAN.md`
- `docs/product-architecture/PHASE_0_ARCHITECTURE.md`
- `docs/product-architecture/RELEASE_NOTES.md`
- `docs/product-architecture/TRACEABILITY_MATRIX.md`
- `docs/reference/prior-design-system.md`
- `docs/reference/prior-interface-contract.md`
- `docs/reference/prior-tokens.css`
- `supabase/migrations/20260909165106_phase_1a_schema_security.sql`
- `supabase/preflight-phase-1a.sql`
- `supabase/tests/package-lock.json`
- `supabase/tests/package.json`
- `supabase/tests/phase-1a.test.mjs`
- `supabase/tests/platform-stubs.sql`
- `docs/STAGING_DEPLOYMENT_PREFLIGHT.md`
- `docs/MVP_RELEASE_MANIFEST.md`

## Exact excluded agents project files
- `docs/HERMES_PROFILE_OPERATING_MODEL.md`
- `README.md`

## Mandatory exclusion rules for both repositories
No file outside the explicit included lists is eligible. Exclude entire .git/, node_modules/, .next/, out/, dist/, coverage/, caches, *.tsbuildinfo, .env*, SSH material, credential/token/password files, Supabase .temp/, archive files, local logs and review/delegation outputs. These directory rules exclude every descendant, including the untracked agents node_modules tree; dependencies are installed on Linux from lockfiles.
Environment/private-key files were neither read nor hashed. Generated output is not an approved binary release; no binary inventory exists because no package was created.
