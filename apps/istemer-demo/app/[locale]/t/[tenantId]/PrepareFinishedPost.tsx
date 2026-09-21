'use client';

import { useState } from 'react';
import { refusalText } from '../../../../lib/workflow/refusal-text';

/** Prepares the exact package the second approval decides on. The caption is
 * never sent from here: the command copies it from the stored calendar entry,
 * so the package carries the text the calendar was approved with. */
export function PrepareFinishedPost({ ar, tenantId, calendarRevisionId, dayIndex, platform }: {
  ar: boolean; tenantId: string; calendarRevisionId: string; dayIndex: number; platform: string;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const prepare = async () => {
    if (busy) return;
    const accountLabel = window.prompt(ar ? 'الحساب المقصود (بيئة تجريبية، غير متصل):' : 'Intended account (staging, not connected):')?.trim();
    if (!accountLabel) return;
    // Asked outright rather than defaulted: a package whose asset state was
    // assumed is exactly the ambiguity the second approval must not inherit.
    // Cancel and empty must not collapse into one another: dismissing the
    // dialog abandons the whole action, while an empty answer genuinely means
    // no asset exists yet.
    const referenceAnswer = window.prompt(ar
      ? 'مرجع الأصل المرفوع، أو اتركه فارغًا إذا لم يُنتج بعد:'
      : 'Reference for a supplied asset, or leave empty if none has been produced yet:');
    if (referenceAnswer === null) return;
    const reference = referenceAnswer.trim();
    let body: Record<string, unknown> = { calendarRevisionId, dayIndex, platform, accountLabel };
    if (reference === '') {
      const reason = window.prompt(ar ? 'سبب عدم توفر الأصل:' : 'Why no asset is available yet:')?.trim();
      if (!reason) return;
      body = { ...body, placeholderReason: reason };
    } else {
      const description = window.prompt(ar ? 'وصف الأصل:' : 'Describe the asset:')?.trim();
      if (!description) return;
      body = { ...body, assetReference: reference, assetDescription: description };
    }
    setBusy(true); setStatus(null);
    try {
      const response = await fetch(`/api/finished-post/${encodeURIComponent(tenantId)}`, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json();
      // Named reason before SQLSTATE -- see refusal-text. Preparing a post
      // before the calendar is approved is the most common refusal of all, and
      // it must not read as "55000".
      if (!response.ok) throw new Error(refusalText(ar, payload, 'package_failed'));
      setStatus(ar
        ? 'أُنشئت الحزمة وتنتظر موافقة المالك في قائمة الموافقات.'
        : 'Package created and now awaiting owner approval in the approvals list.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : refusalText(ar, null, 'package_failed'));
    } finally { setBusy(false); }
  };

  return <>
    <button type="button" disabled={busy} onClick={() => void prepare()}>
      {ar ? 'تجهيز المنشور النهائي لهذا اليوم' : 'Prepare the finished post for this day'}
    </button>
    {status && <p role="status">{status}</p>}
  </>;
}
