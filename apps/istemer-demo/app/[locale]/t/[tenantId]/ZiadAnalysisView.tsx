import type { ReelAnalysisRunView } from '@bagos/contracts';
import { noInterpretationText, stageStatusText } from './stage-status';

// Ziad's honesty rule is a hard product requirement, not a nicety: an
// unavailable modality must never read like an analyzed finding. It gets its
// own heading, its own role="alert" per entry, and an explicit "NOT
// INSPECTED" label, kept in a separate list from `findings`.
export function ZiadAnalysisView({ ar, run }: { ar: boolean; run: ReelAnalysisRunView }) {
  return (
    <section aria-label={ar ? 'تحليل زياد' : "Ziad's analysis"}>
      <h3>{ar ? 'زياد: تحليل الريلز' : 'Ziad: reel analysis'}</h3>
      <p role={run.status === 'failed' ? 'alert' : 'status'}>
        {ar ? 'حالة زياد:' : "Ziad's status:"} {stageStatusText(ar, run.status, run.attempt?.errorCode ?? null)}
      </p>
      {run.artifact && run.revisionId ? (
        <div>
          <p>{ar ? 'رقم مراجعة القطعة:' : 'Artifact revision id:'} {run.revisionId}</p>
          <h4>{ar ? 'الأنماط التي تم فحصها' : 'Inspected modalities'}</h4>
          {run.artifact.inspectedModalities.length > 0 ? (
            <ul>{run.artifact.inspectedModalities.map((modality) => <li key={modality}>{modality}</li>)}</ul>
          ) : <p>{ar ? 'لم يتم فحص أي نمط' : 'No modality was inspected'}</p>}
          <h4>{ar ? 'النتائج' : 'Findings'}</h4>
          {run.artifact.findings.length > 0 ? (
            <ul>
              {run.artifact.findings.map((finding) => (
                <li key={`${finding.modality}-${finding.sourceRevisionId}`}>
                  <p>{ar ? 'النمط:' : 'Modality:'} {finding.modality}</p>
                  <p>{ar ? 'الملاحظة:' : 'Observation:'} {finding.observation}</p>
                  <p>{ar ? 'التفسير:' : 'Interpretation:'} {finding.interpretation ?? noInterpretationText(ar)}</p>
                  <p>{ar ? 'مستوى الثقة:' : 'Confidence:'} {finding.confidence}</p>
                  {finding.gaps.length > 0 && (
                    <ul>{finding.gaps.map((gap, index) => <li key={`${finding.modality}-gap-${index}`}>{gap}</li>)}</ul>
                  )}
                </li>
              ))}
            </ul>
          ) : <p>{ar ? 'لا توجد نتائج' : 'No findings'}</p>}
          <h4>{ar ? 'أنماط غير متاحة — لم يتم فحصها' : 'Unavailable modalities — not inspected'}</h4>
          {run.artifact.unavailableModalities.length > 0 ? (
            <ul>
              {run.artifact.unavailableModalities.map((entry) => (
                <li key={entry.modality} role="alert">
                  <strong>{ar ? 'غير مفحوص:' : 'NOT INSPECTED:'}</strong> {entry.modality} — {entry.reason}
                </li>
              ))}
            </ul>
          ) : <p>{ar ? 'جميع الأنماط المطلوبة تم فحصها' : 'Every requested modality was inspected'}</p>}
        </div>
      ) : null}
    </section>
  );
}
