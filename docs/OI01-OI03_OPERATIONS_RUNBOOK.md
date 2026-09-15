# OI01–OI03 operations runbook (draft)

Status: **DRAFT / PROPOSED**. This is the planning and orchestration packet for owner review. It changes no application code, grants no permission, authorizes no P1B start, invitation, deployment, DNS/SMTP or credential operation, and closes no readiness tier. It does not provision an account, grant access, create an identity, send an invitation, configure a provider, or authorize a deployment. A proposal in this file is not an owner decision.

## Recorded owner decisions

- Abdo is the primary technical custodian.
- Hadeer is the backup custodian with emergency-only technical access if Abdo is unavailable.
- Hadeer separately has business-owner access to approve critical and major decisions within the approved application scope. That authority does not grant routine technical access or activate D20 transfer/approval tooling.
- Bitwarden on the **Free plan** is the selected password manager. No Premium upgrade, standing shared access, or built-in Emergency Access arrangement is selected or approved.
- The owner reports that no system passwords have been created yet. This is not an infrastructure-credential inventory.
- A personal email was supplied as contact information. Its address is not stored and it does not select the identity-verification channel for OI01.
- `istemer.org` is a candidate sender-domain root only. The owner currently lacks access; SMTP provider, sender identity, DNS control and delivery configuration are open.

## Owner clarification — 2026-09-14

The UI and Telegram are the selected human communication channels. Hermes is the single user-facing system-admin agent for Abdo, Hadeer and employees, with each request limited by the initiating person's verified authority. Both channels must use the same server-side permission and audit rules. A Telegram name or message claiming a role is not identity proof. Critical decisions retain the required human approver; Hermes cannot approve its own privilege escalation. These are implementation requirements, not claims that an integration exists.

Support and recovery requests go through Hermes in either channel. The support-channel choice below is therefore settled. A fallback independent of Hermes and the running system is still needed for an outage or compromised account. The sealed offline business-only recovery packet remains a proposal, not an adopted mechanism. Live Hermes/Telegram sequencing must be reconciled with D13/D16 before expanding the restricted Phase 1 demo.

Engineering may select the demo mail transport. Use Supabase's default sender only for eligible developer testing: it currently sends only to project-team addresses and is limited to two messages per hour. Do not grant infrastructure membership merely to receive demo emails. For business-user invite/recovery delivery, recommend Supabase Auth with Resend custom SMTP after verifying a controlled sender domain. Resend's testing domain only delivers to the Resend account's own address; it does not remove the domain dependency. Domain access is currently unavailable, so external-user mail is not configured or proven. A UI showcase can proceed without claiming successful external delivery.

Sources checked 2026-09-14: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend testing restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## Gate vocabulary

**Settled** means the owner decision and a written, reviewed procedure are recorded. **Configured** means the provider, host or channel is actually configured before its earliest live operation. **Rehearsed** means redacted evidence from an explicitly authorised isolated rehearsal is available for the operation it certifies. A rehearsal is not gated by the operation it certifies; a rehearsal that needs live identities remains gated by OI04.

## OI01 — Recovery, Auth mail and MFA loss

### Proposed procedure

1. Record the request in the approved channel of record without storing a password, token or recovery link.
2. Verify the requester's identity using the owner-selected channel **type**. The verification address or secret is never copied into repository evidence.
3. Use the configured Auth provider to issue a one-use recovery link at the approved lifetime. Record only redacted event metadata.
4. Confirm that access was restored, revoke stale sessions when the provider supports it, and close the redacted record.
5. If an owner loses an MFA factor, the custodian performs the factor reset only after step 2 and records the action. The Phase 1A baseline has no MFA enforcement; the implementation packet must add it before this procedure is activated.
6. Expired, reused, revoked and unauthorized links must fail closed and must not create a successful recovery audit event.

### Still open before live use

- Auth sender path and provider. Supabase's built-in sender cannot be treated as a general-recipient delivery path; `istemer.org` remains only a candidate until access is restored or another controlled domain is authorised.
- Sender identity and DNS control (subdomain versus separate domain, after the sender path is chosen).
- Identity-verification channel type; the supplied personal email is not this choice.
- Numeric recovery-link lifetime and any other numeric abuse policy, to be approved or amended from the planner proposal.
- Maximum acceptable time to restore access, to be approved or amended from the planner proposal.

## OI02 — Credential custody, rotation and emergency handover

### Proposed procedure

1. Keep the Phase 1 secret inventory in Bitwarden as the system of record. Do not copy values into Git, application source, ordinary host files, tickets or evidence. Runtime injection is configured separately on the host before the first privileged operation.
2. Enumerate only the Phase 1 secret references (Supabase service role key, database password, access token, Auth-mail credential, VPS credential and TLS material); never place a value in a planning artifact.
3. If Abdo is unavailable, Hadeer activates the owner-approved emergency mechanism after the recorded identity and opening-condition checks. Access is limited to the enumerated business materials, is time-bounded, and is recorded by secret reference, date, actor and mechanism.
4. When Abdo resumes, revoke the emergency access and rotate every secret that the mechanism could have exposed. Record the rotation without recording values. Suspected exposure triggers immediate rotation and session revocation before investigation.
5. A rehearsal is an isolated, explicitly authorised packet with synthetic or otherwise approved material. It produces redacted evidence for the later operation; it does not provision standing access.

### Still open before configured use

- Emergency handover mechanism and opening condition. The current proposal is a sealed offline packet limited to the enumerated Phase 1 business materials; alternatives may be adopted only by explicit owner choice. Bitwarden Free does not by itself provide the selected handover arrangement.
- Per-secret access scope, maximum access duration, revocation confirmation and post-incident rotation window.
- Rotation interval, exact per-secret rotation order and sequences, to be approved or amended from the planner proposal.

## OI03 — Support authorization and escalation

### Proposed procedure

1. Restate any request received elsewhere into the named support channel of record before granting access.
2. The tenant owner authorizes the request. The custodian executes a time-bounded **operator** membership; a platform grant alone never opens tenant content.
3. Record requester, authorizer, tenant, role, reason, start and end in the audit record and request record.
4. The custodian manually revokes access at completion and the tenant owner confirms removal. Do not assume an expiry scheduler that is not implemented.
5. A suspected credential exposure, cross-tenant access, audit gap or unexplained privileged action is an incident: follow the emergency escalation to Hadeer under her emergency-only technical scope and record the event. The custodian may suspend a tenant only on those documented incident criteria, with owner notification.

### Still open before support access

- Support channels are settled as UI and Telegram through Hermes; implementation and a shared audit/request record remain pending.
- Owner confirmation or amendment of the tenant-owner-authorizes/custodian-executes split and the incident suspension criteria.
- Maximum access duration and any other numeric abuse policy, to be approved or amended from the planner proposal.

## Remaining compact owner choices

1. Choose the OI02 emergency handover mechanism and opening condition, or adopt/amend the sealed-business-materials proposal.
2. Engineering selects the OI01 demo sender path under the flexibility granted on 2026-09-14. A controlled sender domain is a configuration dependency for the recommended business-user delivery path. No purchase or DNS change is implied.
3. UI and Telegram through Hermes settle the OI03 channels. The authorization and incident-suspension procedure still needs review against that direction.
4. Engineering carries the small set of numeric policy proposals (recovery-link lifetime, maximum restore time, rotation/access windows, support duration and rate-limit behavior) through review; the owner may amend them, but they are not separate owner questions.

Until these choices and the procedures are marked Settled, Q4/P1B remains blocked by the frozen Phase 1 setup-input requirement. OI04 remains a separate authorization before any real Auth identity, invitation or identity-dependent rehearsal. O1 and O2 are not P1B prerequisites; O1 still precedes P1C deployment/P1G sign-off, and O2 remains an open hardening disposition.
