'use client';

import { useCallback, useEffect, useState } from 'react';
import { TenantAuditLogSchema, type AuditEntry, type TenantAuditLog } from '../../../../lib/workflow/audit-types';

function actorKindText(ar: boolean, kind: AuditEntry['actorKind']): string {
  if (kind === 'human') return ar ? 'شخص' : 'person';
  if (kind === 'agent') return ar ? 'وكيل' : 'agent';
  return ar ? 'النظام' : 'system';
}

// Bilingual phrases for the event types the demo's own commands are known to
// write (every `insert into public.audit_log` across the migrations). Kept
// as a lookup rather than a switch so a missing entry is an omission, not a
// crash, and falls through to the verbatim event type below.
const EVENT_TEXT: Record<string, { en: string; ar: string }> = {
  agent_workflow_created: { en: 'Workflow started', ar: 'بدأ سير العمل' },
  agent_workflow_failed: { en: 'Workflow failed', ar: 'فشل سير العمل' },
  agent_workflow_retry_requested: { en: 'Workflow retry requested', ar: 'طُلبت إعادة محاولة سير العمل' },
  research_task_created: { en: 'Research task created', ar: 'أُنشئت مهمة البحث' },
  research_lease_expired: { en: 'Research attempt lease expired', ar: 'انتهت مهلة محاولة البحث' },
  research_attempt_started: { en: 'Research attempt started', ar: 'بدأت محاولة البحث' },
  research_authorization_revoked: { en: 'Research attempt authorization revoked', ar: 'أُلغي تفويض محاولة البحث' },
  research_attempt_failed: { en: 'Research attempt failed', ar: 'فشلت محاولة البحث' },
  research_retry_requested: { en: 'Research retry requested', ar: 'طُلبت إعادة محاولة البحث' },
  research_attempt_completed: { en: 'Research completed', ar: 'اكتمل البحث' },
  reel_analysis_task_auto_enqueued: { en: 'Reel-analysis task auto-queued after research', ar: 'أُدرجت مهمة تحليل الريلز تلقائيًا بعد البحث' },
  reel_analysis_lease_expired: { en: 'Reel-analysis attempt lease expired', ar: 'انتهت مهلة محاولة تحليل الريلز' },
  reel_analysis_attempt_started: { en: 'Reel-analysis attempt started', ar: 'بدأت محاولة تحليل الريلز' },
  reel_analysis_authorization_revoked: { en: 'Reel-analysis attempt authorization revoked', ar: 'أُلغي تفويض محاولة تحليل الريلز' },
  reel_analysis_attempt_failed: { en: 'Reel-analysis attempt failed', ar: 'فشلت محاولة تحليل الريلز' },
  reel_analysis_retry_requested: { en: 'Reel-analysis retry requested', ar: 'طُلبت إعادة محاولة تحليل الريلز' },
  reel_analysis_attempt_completed: { en: 'Reel analysis completed', ar: 'اكتمل تحليل الريلز' },
  content_calendar_task_auto_enqueued: { en: 'Content-calendar task auto-queued after reel analysis', ar: 'أُدرجت مهمة تقويم المحتوى تلقائيًا بعد تحليل الريلز' },
  content_calendar_lease_expired: { en: 'Content-calendar attempt lease expired', ar: 'انتهت مهلة محاولة تقويم المحتوى' },
  content_calendar_attempt_started: { en: 'Content-calendar attempt started', ar: 'بدأت محاولة تقويم المحتوى' },
  content_calendar_authorization_revoked: { en: 'Content-calendar attempt authorization revoked', ar: 'أُلغي تفويض محاولة تقويم المحتوى' },
  content_calendar_attempt_failed: { en: 'Content-calendar attempt failed', ar: 'فشلت محاولة تقويم المحتوى' },
  content_calendar_retry_requested: { en: 'Content-calendar retry requested', ar: 'طُلبت إعادة محاولة تقويم المحتوى' },
  content_calendar_attempt_completed: { en: 'Content calendar completed', ar: 'اكتمل تقويم المحتوى' },
  strategy_approval_auto_created: { en: 'Strategy approval created automatically', ar: 'أُنشئت موافقة الاستراتيجية تلقائيًا' },
  agent_artifact_approved: { en: 'Artifact approved', ar: 'تمت الموافقة على القطعة' },
  agent_artifact_rejected: { en: 'Artifact rejected', ar: 'رُفضت القطعة' },
  agent_artifact_approval_invalidated: { en: 'Approval invalidated by a newer revision', ar: 'أُلغيت الموافقة بسبب مراجعة أحدث' },
  usage_allowance_set: { en: 'Usage allowance set', ar: 'ضُبط حد الاستهلاك' },
  agent_usage_recorded: { en: 'Agent usage recorded', ar: 'سُجّل استهلاك الوكيل' },
};

function eventText(ar: boolean, eventType: string): string {
  const known = EVENT_TEXT[eventType];
  // An event type this panel does not recognise must still be shown, exactly
  // as recorded, rather than hidden or guessed at: an audited event silently
  // disappearing from its own audit trail would defeat the point of one.
  if (!known) return eventType;
  return ar ? known.ar : known.en;
}

export function AuditTrailPanel({ ar, tenantId }: { ar: boolean; tenantId: string }) {
  const [data, setData] = useState<TenantAuditLog | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/audit/${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.code ?? 'retrieval_failed');
    setData(TenantAuditLogSchema.parse(body));
  }, [tenantId]);

  useEffect(() => {
    void load().catch(() => setStatus(ar ? 'تعذر تحميل سجل التدقيق.' : 'Could not load the audit trail.'));
  }, [ar, load]);

  if (status) return <p role="alert">{status}</p>;
  if (!data) return <p role="status">{ar ? 'جارٍ تحميل سجل التدقيق…' : 'Loading the audit trail…'}</p>;

  return <section aria-label={ar ? 'سجل التدقيق' : 'Audit trail'}>
    <h3>{ar ? 'سجل التدقيق' : 'Audit trail'}</h3>
    {data.entries.length === 0
      // Distinct from the failure state above: this is a load that succeeded
      // and found nothing, not a load that could not happen.
      ? <p role="status">{ar ? 'لا يوجد نشاط مسجَّل بعد.' : 'No recorded activity yet.'}</p>
      : <ul>
        {data.entries.map((entry) => <li key={entry.auditId}>
          <p>{ar ? 'الفاعل:' : 'Actor:'} {actorKindText(ar, entry.actorKind)} ({entry.actorReference})</p>
          <p>{ar ? 'الحدث:' : 'Event:'} {eventText(ar, entry.eventType)}</p>
          {entry.targetReference && <p>{ar ? 'الهدف:' : 'Target:'} {entry.targetReference}
            {entry.targetRevision !== null ? ` (v${entry.targetRevision})` : ''}</p>}
          <p>{ar ? 'الأمر:' : 'Command:'} {entry.commandId}</p>
          <p>{ar ? 'الوقت:' : 'When:'} {entry.createdAt}</p>
        </li>)}
      </ul>}
  </section>;
}
