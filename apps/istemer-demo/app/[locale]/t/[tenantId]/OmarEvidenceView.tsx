import type { ResearchRunView } from '@bagos/contracts';
import { noInterpretationText, stageStatusText } from './stage-status';

export function OmarEvidenceView({ ar, run }: { ar: boolean; run: ResearchRunView }) {
  return (
    <section aria-label={ar ? 'أدلة عمر' : "Omar's evidence"}>
      <h3>{ar ? 'عمر: أدلة البحث' : 'Omar: research evidence'}</h3>
      <p role={run.status === 'failed' ? 'alert' : 'status'}>
        {ar ? 'حالة عمر:' : "Omar's status:"} {stageStatusText(ar, run.status, run.attempt?.errorCode ?? null)}
      </p>
      {run.artifact && run.revisionId ? (
        <div>
          <p>{ar ? 'رقم مراجعة القطعة:' : 'Artifact revision id:'} {run.revisionId}</p>
          <ul>
            {run.artifact.evidence.map((item) => (
              <li key={item.inspectionReceiptId}>
                <p>{ar ? 'رقم إيصال الفحص:' : 'Inspection receipt id:'} {item.inspectionReceiptId}</p>
                <p>{ar ? 'المصدر:' : 'Source:'} {item.sourceUrl}</p>
                <p>{ar ? 'وقت الفحص:' : 'Inspected at:'} {item.inspectedAt}</p>
                <p>{ar ? 'الملاحظة:' : 'Observation:'} {item.observation}</p>
                <p>{ar ? 'التفسير:' : 'Interpretation:'} {item.interpretation ?? noInterpretationText(ar)}</p>
                <p>{ar ? 'مستوى الثقة:' : 'Confidence:'} {item.confidence}</p>
                {item.gaps.length > 0 && (
                  <>
                    <p>{ar ? 'الفجوات:' : 'Gaps:'}</p>
                    <ul>{item.gaps.map((gap, index) => <li key={`${item.inspectionReceiptId}-${index}`}>{gap}</li>)}</ul>
                  </>
                )}
              </li>
            ))}
          </ul>
          {run.artifact.gaps.length > 0 && (
            <>
              <p>{ar ? 'فجوات البحث (مصادر لم تُفحص أو فُحصت جزئيًا):' : 'Research gaps (sources not inspected or only partly inspected):'}</p>
              <ul>{run.artifact.gaps.map((gap, index) => <li key={`gap-${index}`}>{gap}</li>)}</ul>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
