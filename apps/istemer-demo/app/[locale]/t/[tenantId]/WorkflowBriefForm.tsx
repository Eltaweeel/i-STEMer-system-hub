'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ResearchRunViewSchema, type ResearchRunView } from '@bagos/contracts';

export function WorkflowBriefForm({ locale }: { locale: 'en' | 'ar' }) {
  const ar = locale === 'ar';
  const [objective, setObjective] = useState('Find education competitors and content opportunities for i-STEMer.');
  const [sources, setSources] = useState('https://istemer.org/about-us/');
  const [status, setStatus] = useState<string | null>(null);
  const [run, setRun] = useState<ResearchRunView | null>(null);
  const [busy, setBusy] = useState(false);
  const submission = useRef<{ signature: string; idempotencyKey: string } | null>(null);
  const refresh = useCallback(async (runId: string) => {
    const response = await fetch(`/api/workflows/${encodeURIComponent(runId)}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.code ?? 'retrieval_failed');
    setRun(ResearchRunViewSchema.parse(body));
  }, []);
  useEffect(() => {
    const runId = new URL(window.location.href).searchParams.get('researchRun');
    if (runId) void refresh(runId).catch(() => setStatus(ar ? 'تعذر استرجاع التشغيل.' : 'Could not retrieve the run.'));
  }, [ar, refresh]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setStatus(null);
    const brief = { objective, sources: sources.split('\n').map((source) => source.trim()).filter(Boolean) };
    const signature = JSON.stringify(brief);
    if (submission.current?.signature !== signature) submission.current = { signature, idempotencyKey: crypto.randomUUID() };
    try {
      const response = await fetch('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...brief, idempotencyKey: submission.current.idempotencyKey }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.code ?? 'submission_failed');
      if (typeof body.accepted?.runId !== 'string') throw new Error('invalid_response');
      const location = new URL(window.location.href);
      location.searchParams.set('researchRun', body.accepted.runId);
      window.history.replaceState(null, '', location);
      setStatus(ar ? 'تم حفظ الموجز. التنفيذ ينتظر العامل.' : 'Brief saved. Execution awaits the worker.');
      await refresh(body.accepted.runId);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'submission_failed'); }
    finally { setBusy(false); }
  };
  const retry = async () => {
    if (!run?.attempt || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/workflows/retry', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attemptId: run.attempt.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.code ?? 'retry_failed');
      await refresh(run.runId);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'retry_failed'); }
    finally { setBusy(false); }
  };
  return <section aria-label={ar ? 'إنشاء موجز' : 'Create a brief'}>
    <h2>{ar ? 'آدم ← عمر: بحث المصادر' : 'Adam → Omar: source research'}</h2>
    <p>{ar ? 'بحث فقط. لا نشر خارجي ولا تشغيل لزياد أو نور.' : 'Research only. No publishing, Ziad, or Nour execution.'}</p>
    <form onSubmit={submit}>
      <label>{ar ? 'الهدف' : 'Objective'}<textarea required maxLength={8000} value={objective} onChange={(event) => setObjective(event.target.value)} /></label>
      <label>{ar ? 'مصادر البحث (HTTPS)' : 'Research sources (HTTPS)'}<textarea required value={sources} onChange={(event) => setSources(event.target.value)} /></label>
      <button type="submit" disabled={busy}>{ar ? 'إرسال الموجز' : 'Submit brief'}</button>
    </form>
    {status && <p role="status">{status}</p>}
    {run && <div>
      <p>{ar ? 'حالة التشغيل:' : 'Run status:'} {run.status}</p>
      {run.attempt?.errorCode && <p role="alert">{run.attempt.errorCode}</p>}
      <button type="button" disabled={busy} onClick={() => void refresh(run.runId).catch(() => setStatus('retrieval_failed'))}>{ar ? 'تحديث الحالة' : 'Refresh status'}</button>
      {run.status === 'failed' && run.attempt?.retryable && <button type="button" disabled={busy} onClick={() => void retry()}>{ar ? 'إعادة المحاولة' : 'Retry failed attempt'}</button>}
      {run.artifact && <pre aria-label="research-artifact">{JSON.stringify({ revisionId: run.revisionId, ...run.artifact }, null, 2)}</pre>}
    </div>}
  </section>;
}
