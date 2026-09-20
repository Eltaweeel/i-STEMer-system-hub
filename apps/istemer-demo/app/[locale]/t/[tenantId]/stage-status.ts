// Shared bilingual wording for the honest empty/pending/failed/produced states
// every stage view must render. A stage is never described as complete when
// its artifact is absent, and no placeholder value is ever fabricated here.
export type StageStatus = 'queued' | 'running' | 'failed' | 'succeeded';

export function stageStatusText(ar: boolean, status: StageStatus, errorCode: string | null): string {
  if (status === 'queued') return ar ? 'في الانتظار' : 'queued';
  if (status === 'running') return ar ? 'قيد التنفيذ' : 'running';
  if (status === 'failed') return ar ? `فشل برمز ${errorCode ?? 'unknown'}` : `failed with ${errorCode ?? 'unknown'}`;
  return ar ? 'تم الإنتاج' : 'produced';
}

export function notStartedText(ar: boolean): string {
  return ar ? 'لم يبدأ بعد' : 'not started';
}

export function noInterpretationText(ar: boolean): string {
  return ar ? 'لا يوجد تفسير مُقدَّم' : 'no interpretation offered';
}

export function notYetProducedText(ar: boolean): string {
  return ar ? 'لم يُنتَج بعد' : 'not yet produced';
}
