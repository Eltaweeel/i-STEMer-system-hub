// No 'server-only' guard: every consumer is a client component, so this module
// must stay safe to bundle for the browser. Text and a lookup, nothing else.

/** What each refusal means to the person who hit it, in both languages.
 *
 * The routes already do the work of turning one overloaded SQLSTATE into a
 * named reason -- several distinct refusals share 55000 -- but a name like
 * `strategy_not_approved` is still not something an owner can act on. These are
 * the sentences that say what happened and what to do about it. */
const MESSAGES: Record<string, { ar: string; en: string }> = {
  // The gate the second approval exists to enforce: the calendar behind this
  // post no longer carries an approval, so the post cannot be decided on.
  strategy_not_approved: {
    ar: 'لم تعد الاستراتيجية والتقويم يحملان موافقة سارية، فلا يمكن اعتماد هذا المنشور. راجع موافقة التقويم أولًا.',
    en: 'The strategy and calendar behind this post no longer carry a valid approval, so it cannot be decided. Approve the calendar first.',
  },
  strategy_approval_missing: {
    ar: 'لا توجد موافقة على هذا التقويم بعد. اعتمد التقويم قبل تجهيز أي منشور منه.',
    en: 'This calendar has no approval yet. Approve the calendar before preparing a post from it.',
  },
  approval_is_not_pending: {
    ar: 'اتُّخذ قرار بشأن هذا العنصر بالفعل. حدِّث القائمة لرؤية القرار الحالي.',
    en: 'A decision was already recorded for this item. Refresh the list to see the current decision.',
  },
  // The binding that stops a decision landing on content the viewer never saw.
  approval_digest_mismatch: {
    ar: 'تغيّر المحتوى بعد عرضه عليك، فلم يُطبَّق القرار. حدِّث القائمة وراجع النسخة الحالية.',
    en: 'The content changed after it was shown to you, so the decision was not applied. Refresh and review the current version.',
  },
  missing_calendar: {
    ar: 'تعذر العثور على التقويم المطلوب.',
    en: 'The requested calendar could not be found.',
  },
  missing_calendar_entry: {
    ar: 'لا يحتوي التقويم على مُدخَل لهذا اليوم.',
    en: 'The calendar has no entry for this day.',
  },
  owner_access_required: {
    ar: 'هذا الإجراء لمالك المؤسسة فقط.',
    en: 'Only the organization owner can do this.',
  },
  tenant_access_required: {
    ar: 'لا تملك صلاحية الوصول إلى هذه المؤسسة.',
    en: 'You do not have access to this organization.',
  },
  not_authenticated: {
    ar: 'انتهت الجلسة. سجّل الدخول مرة أخرى.',
    en: 'Your session has ended. Sign in again.',
  },
  // Stated plainly rather than dressed up as a transient glitch: nothing the
  // reader does in the UI will fix an unconfigured database.
  persistence_not_configured: {
    ar: 'قاعدة البيانات غير مهيأة في هذه البيئة، فلا يمكن حفظ أي قرار.',
    en: 'The database is not configured in this environment, so no decision can be saved.',
  },
  reason_required: {
    ar: 'الرفض يتطلب ذكر السبب.',
    en: 'A rejection needs a stated reason.',
  },
  invalid_limit: {
    ar: 'الحد يجب أن يكون عددًا صحيحًا موجبًا.',
    en: 'The limit must be a positive whole number.',
  },
  allowance_failed: {
    ar: 'تعذر ضبط الحد.',
    en: 'The limit could not be set.',
  },
  decision_failed: {
    ar: 'تعذر تسجيل القرار.',
    en: 'The decision could not be recorded.',
  },
  package_failed: {
    ar: 'تعذر تجهيز الحزمة.',
    en: 'The package could not be prepared.',
  },
};

/** Reads the named reason a route returned, in preference to the raw SQLSTATE.
 *
 * Order matters and is the whole point: `code` is the Postgres SQLSTATE and is
 * present on every error body, so reading it first makes the named reason dead
 * code and puts "55000" on screen -- the same five digits for a lost calendar
 * approval and for an item someone else already decided, which is precisely the
 * ambiguity the named reasons exist to remove.
 *
 * An unrecognised reason is shown as it arrived, with its code, rather than
 * flattened into a generic failure: a refusal nobody anticipated is still
 * something the reader should be able to report accurately. */
export function refusalText(ar: boolean, body: unknown, fallback: string): string {
  const payload = (body ?? {}) as { error?: unknown; code?: unknown };
  const named = typeof payload.error === 'string' && payload.error !== '' ? payload.error : null;
  const code = typeof payload.code === 'string' && payload.code !== '' ? payload.code : null;
  const key = named ?? fallback;
  const known = MESSAGES[key];
  if (known) return ar ? known.ar : known.en;
  return code ? `${key} (${code})` : key;
}
