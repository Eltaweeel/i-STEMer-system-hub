'use client';

import { useCallback, useEffect, useState } from 'react';
import { TenantApprovalsSchema, type ApprovalRow, type TenantApprovals } from '../../../../lib/workflow/approvals-types';
import { refusalText } from '../../../../lib/workflow/refusal-text';

function statusText(ar: boolean, status: ApprovalRow['status']): string {
  if (status === 'pending') return ar ? 'بانتظار القرار' : 'awaiting decision';
  if (status === 'approved') return ar ? 'تمت الموافقة' : 'approved';
  if (status === 'rejected') return ar ? 'مرفوض' : 'rejected';
  // A revision landed after the decision was recorded, so the decision no
  // longer describes the current content and must not be read as still valid.
  return ar ? 'أُلغي بسبب مراجعة أحدث' : 'invalidated by a newer revision';
}

/** A finished post with no detail cannot be judged: its caption and asset
 * state are the entire basis of the decision. */
function undecidable(row: ApprovalRow): boolean {
  return row.stage === 'finished_post' && !row.finishedPost;
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
      // The named reason first, never the SQLSTATE: several refusals share
      // 55000, so the bare code cannot tell an owner whether the calendar lost
      // its approval or whether someone else already decided this.
      if (!response.ok) throw new Error(refusalText(ar, body, 'decision_failed'));
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : refusalText(ar, null, 'decision_failed'));
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
          {/* A finished post whose detail did not arrive is not decidable: the
              caption and asset state are the whole basis of this decision, and
              offering the controls without them is the blind approval this
              stage exists to prevent. */}
          {row.status === 'pending' && (undecidable(row)
            ? <p role="alert">{ar
              ? 'تفاصيل المنشور غير متاحة، فلا يمكن اتخاذ القرار الآن.'
              : 'This post could not be shown in full, so it cannot be decided yet.'}</p>
            : data.canDecide
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
