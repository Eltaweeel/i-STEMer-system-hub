'use client';

import { useCallback, useEffect, useState } from 'react';
import { UsageSummarySchema, type UsageSummary } from '../../../../lib/workflow/usage-types';
import { refusalText } from '../../../../lib/workflow/refusal-text';

export function UsageAllowancePanel({ ar, tenantId }: { ar: boolean; tenantId: string }) {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/usage/${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.code ?? 'retrieval_failed');
    setSummary(UsageSummarySchema.parse(body));
  }, [tenantId]);

  useEffect(() => {
    void load().catch(() => setStatus(ar ? 'تعذر تحميل حدود الاستهلاك.' : 'Could not load usage allowances.'));
  }, [ar, load]);

  const setLimit = async (memberUserId: string, current: number | null) => {
    if (busy) return;
    const entered = window.prompt(ar ? 'حد الرموز لهذه الفترة:' : 'Token limit for this period:',
      current === null ? '' : String(current))?.trim();
    if (entered === undefined || entered === '') return;
    const limitTokens = Number(entered);
    if (!Number.isSafeInteger(limitTokens) || limitTokens <= 0) {
      setStatus(ar ? 'الحد يجب أن يكون عددًا صحيحًا موجبًا.' : 'The limit must be a positive whole number.');
      return;
    }
    setBusy(true); setStatus(null);
    try {
      const response = await fetch(`/api/usage/${encodeURIComponent(tenantId)}/allowance`, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberUserId, limitTokens }) });
      const body = await response.json();
      // Named reason before SQLSTATE -- see refusal-text.
      if (!response.ok) throw new Error(refusalText(ar, body, 'allowance_failed'));
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : refusalText(ar, null, 'allowance_failed'));
    } finally { setBusy(false); }
  };

  if (status && !summary) return <p role="alert">{status}</p>;
  if (!summary) return <p role="status">{ar ? 'جارٍ تحميل حدود الاستهلاك…' : 'Loading usage allowances…'}</p>;

  const isOwner = summary.viewerRole === 'owner';
  return <section aria-label={ar ? 'حدود الاستهلاك' : 'Usage allowances'}>
    <h3>{ar ? 'حدود الرموز' : 'Token allowances'}</h3>
    <p>{ar ? 'الفترة الحالية تبدأ في:' : 'Current period starts:'} {summary.periodStart}</p>
    {/* Stated rather than omitted: an absent number the reader can see explained
        is honest, an absent number they cannot is just a gap. */}
    <p role="status">{ar
      ? 'الرصيد المتبقي في اشتراك المزوّد غير متاح: لا توجد واجهة برمجية تكشفه، ولن يُقدَّر تخمينًا.'
      : 'Remaining balance on the provider subscription is not available: no API exposes it, and it will not be estimated.'}</p>
    <ul>
      {summary.members.map((member) => {
        const isSelf = member.userId === summary.viewerId;
        return <li key={member.userId}>
          <p>{isSelf ? (ar ? 'أنت' : 'You') : member.userId} — {member.role}</p>
          <p>{ar ? 'الحد:' : 'Limit:'} {member.limitTokens === null
            ? (ar ? 'لم يُضبط حد (غير محدود)' : 'no limit set (unlimited)')
            : member.limitTokens}</p>
          <p>{ar ? 'المستهلك المُبلَّغ عنه:' : 'Reported consumption:'} {member.consumedTokens}</p>
          <p>{ar ? 'المتبقي:' : 'Remaining:'} {member.remainingTokens === null
            ? (ar ? 'لا ينطبق بدون حد' : 'not applicable without a limit')
            : member.remainingTokens}</p>
          {isOwner && <button type="button" disabled={busy} onClick={() => void setLimit(member.userId, member.limitTokens)}>
            {member.limitTokens === null
              ? (ar ? 'ضبط حد' : 'Set a limit')
              : (ar ? 'تغيير الحد' : 'Change limit')}
          </button>}
          {member.unreportedRuns > 0 && <p role="status">{ar
            ? `${member.unreportedRuns} تشغيل لم يُبلِّغ المزوّد عن استهلاكه، فالمجموع أعلاه أقل من الاستهلاك الفعلي.`
            : `${member.unreportedRuns} run(s) returned no usage figure, so the total above understates actual consumption.`}</p>}
        </li>;
      })}
    </ul>
    {status && <p role="alert">{status}</p>}
  </section>;
}
