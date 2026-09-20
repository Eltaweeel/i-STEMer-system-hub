import type { NourRunView, ReelAnalysisRunView, ResearchRunView } from '@bagos/contracts';
import { notYetProducedText, stageStatusText } from './stage-status';

// A compact view of every stage's revision id, so a reviewer can confirm
// each stage consumed the exact upstream revision it claims to. A stage
// that has not run yet says so explicitly rather than being left blank.
export function ChainLineageView({ ar, research, reelAnalysis, contentCalendar }: {
  ar: boolean;
  research: ResearchRunView;
  reelAnalysis: ReelAnalysisRunView | null;
  contentCalendar: NourRunView | null;
}) {
  const notYet = notYetProducedText(ar);
  const stages: { key: string; label: string; status: string; revisionId: string | null }[] = [
    { key: 'omar', label: ar ? 'عمر' : 'Omar', revisionId: research.revisionId,
      status: stageStatusText(ar, research.status, research.attempt?.errorCode ?? null) },
    { key: 'ziad', label: ar ? 'زياد' : 'Ziad', revisionId: reelAnalysis?.revisionId ?? null,
      status: reelAnalysis ? stageStatusText(ar, reelAnalysis.status, reelAnalysis.attempt?.errorCode ?? null) : notYet },
    { key: 'nour', label: ar ? 'نور' : 'Nour', revisionId: contentCalendar?.revisionId ?? null,
      status: contentCalendar ? stageStatusText(ar, contentCalendar.status, contentCalendar.attempt?.errorCode ?? null) : notYet },
  ];
  return (
    <section aria-label={ar ? 'سلسلة الإنتاج' : 'Lineage'}>
      <h3>{ar ? 'السلسلة: من الموجز إلى التقويم' : 'Lineage: brief to calendar'}</h3>
      <ol>
        <li><strong>{ar ? 'آدم (الموجز)' : 'Adam (brief)'}</strong>: {ar ? 'تم الإرسال' : 'submitted'}</li>
        {stages.map((stage) => (
          <li key={stage.key}>
            <strong>{stage.label}</strong>: {stage.status} — {stage.revisionId
              ? `${ar ? 'رقم المراجعة' : 'revision'} ${stage.revisionId}` : notYet}
          </li>
        ))}
      </ol>
    </section>
  );
}
