'use client';

import { useCallback, useEffect, useState } from 'react';
import { TenantApprovalsSchema, type ApprovalRow, type TenantApprovals } from '../../../../lib/workflow/approvals-types';

function statusText(ar: boolean, status: ApprovalRow['status']): string {
  if (status === 'pending') return ar ? 'بانتظار القرار' : 'awaiting decision';
  if (status === 'approved') return ar ? 'تمت الموافقة' : 'approved';
  if (status === 'rejected') return ar ? 'مرفوض' : 'rejected';
  // A revision landed after the decision was recorded, so the decision no
  // longer describes the current content and must not be read as still valid.
  return ar ? 'أُلغي بسبب مراجعة أحدث' : 'invalidated by a newer revision';
}

function stageText(ar: boolean, stage: ApprovalRow['stage']): string {
  if (stage === 'strategy') return ar ? 'الاستراتيجية والتقويم' : 'strategy and calendar';
  return ar ? 'المنشور النهائي' : 'finished post';
}

export function ApprovalsPanel({ ar, tenantId }: { ar: boolean; tenantId: string }) {
  const [data, setData] = useState<TenantApprovals | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/approvals/${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.code ?? 'retrieval_failed');
    setData(TenantApprovalsSchema.parse(body));
  }, [tenantId]);

  useEffect(() => {
    void load().catch(() => setStatus(ar ? 'تعذر تحميل الموافقات.' : 'Could not load approvals.'));
  }, [ar, load]);

  const decide = async (row: ApprovalRow, decision: 'approve' | 'reject') => {
    if (busy) return;
    let reason = '';
    if (decision === 'reject') {
      reason = window.prompt(ar ? 'سبب الرفض:' : 'Reason for rejecting:')?.trim() ?? '';
      if (reason === '') return;
    }
    setBusy(true); setStatus(null);
    try {
      const response = await fetch('/api/approvals', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, approvalId: row.approvalId, contentDigest: row.contentDigest, decision, reason }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.code ?? body.error ?? 'decision_failed');
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'decision_failed');
    } finally { setBusy(false); }
  };

  if (!data) return <p role="status">{status ?? (ar ? 'جارٍ تحميل الموافقات…' : 'Loading approvals…')}</p>;

  return <section aria-label={ar ? 'الموافقات' : 'Approvals'}>
    <h3>{ar ? 'الموافقات' : 'Approvals'}</h3>
    {status && <p role="alert">{status}</p>}
    {data.approvals.length === 0
      ? <p role="status">{ar ? 'لا توجد موافقات بعد. تُنشأ الموافقة تلقائيًا عند اكتمال تقويم نور.' : 'No approvals yet. One is created automatically when Nour\'s calendar completes.'}</p>
      : <ul>
        {data.approvals.map((row) => <li key={row.approvalId}>
          <p>{ar ? 'المرحلة:' : 'Stage:'} {stageText(ar, row.stage)}</p>
          <p role={row.status === 'invalidated' ? 'alert' : 'status'}>{ar ? 'الحالة:' : 'Status:'} {statusText(ar, row.status)}</p>
          <p>{ar ? 'مراجعة القطعة:' : 'Artifact revision:'} {row.artifactRevisionId} (v{row.revision})</p>
          {row.finishedPost && <>
            <p>{ar ? 'اليوم:' : 'Day:'} {row.finishedPost.dayIndex + 1} — {row.finishedPost.platform} — {row.finishedPost.accountLabel}</p>
            <p>{ar ? 'النص:' : 'Caption:'} {row.finishedPost.caption}</p>
            {/* The asset state is stated outright, and a placeholder is called
                one. Approving without knowing which of the two you have is the
                single mistake this stage exists to prevent. */}
            <p role={row.finishedPost.assetKind === 'placeholder' ? 'alert' : 'status'}>
              {row.finishedPost.assetKind === 'supplied'
                ? (ar ? 'الأصل: مرفق ومُنتَج.' : 'Asset: supplied and produced.')
                : (ar ? 'الأصل: عنصر نائب فقط — لم يُنتَج أي تصميم نهائي.' : 'Asset: placeholder only — no finished graphic has been produced.')}
            </p>
          </>}
          {row.status === 'pending' && (data.canDecide
            ? <>
              <button type="button" disabled={busy} onClick={() => void decide(row, 'approve')}>{ar ? 'موافقة' : 'Approve'}</button>
              <button type="button" disabled={busy} onClick={() => void decide(row, 'reject')}>{ar ? 'رفض' : 'Reject'}</button>
            </>
            // Stated, not merely hidden: a viewer who cannot decide should know
            // the work is waiting on someone who can, not think it is stuck.
            : <p role="status">{ar ? 'القرار لمالك المؤسسة فقط.' : 'Only the organization owner can decide this.'}</p>)}
        </li>)}
      </ul>}
    <p role="status">{ar
      ? 'الموافقة تسجل القرار فقط. لا يحدث أي نشر خارجي في هذه البيئة.'
      : 'Approving records the decision only. No external publication happens in this environment.'}</p>
  </section>;
}
