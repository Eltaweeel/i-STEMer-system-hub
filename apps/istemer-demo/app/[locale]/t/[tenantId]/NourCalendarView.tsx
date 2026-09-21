import type { NourRunView } from '@bagos/contracts';
import { stageStatusText } from './stage-status';
import { PrepareFinishedPost } from './PrepareFinishedPost';

export function NourCalendarView({ ar, run, tenantId }: { ar: boolean; run: NourRunView; tenantId: string }) {
  return (
    <section aria-label={ar ? 'تقويم نور' : "Nour's calendar"}>
      <h3>{ar ? 'نور: تقويم المحتوى لسبعة أيام' : 'Nour: 7-day content calendar'}</h3>
      <p role={run.status === 'failed' ? 'alert' : 'status'}>
        {ar ? 'حالة نور:' : "Nour's status:"} {stageStatusText(ar, run.status, run.attempt?.errorCode ?? null)}
      </p>
      {run.artifact && run.revisionId ? (
        <div>
          <p>{ar ? 'رقم مراجعة القطعة:' : 'Artifact revision id:'} {run.revisionId}</p>
          <ol>
            {[...run.artifact.entries].sort((a, b) => a.dayIndex - b.dayIndex).map((entry) => (
              <li key={entry.dayIndex}>
                <p>{ar ? `اليوم ${entry.dayIndex + 1}:` : `Day ${entry.dayIndex + 1}:`} {entry.platform} — {entry.format} — {entry.conceptTitle}</p>
                <p>{ar ? 'الهدف:' : 'Objective:'} {entry.objective}</p>
                <p>{ar ? 'الافتتاحية:' : 'Hook:'} {entry.hook}</p>
                <p>{ar ? 'النص:' : 'Caption:'} {entry.caption}</p>
                <p>{ar ? 'الدعوة لاتخاذ إجراء:' : 'Call to action:'} {entry.callToAction}</p>
                {/* Worded as an outstanding requirement, never as an attachment:
                    no media exists anywhere in this system yet, and a line that
                    read as a delivered asset would misstate that. */}
                <p>{ar ? 'المطلوب إنتاجه (لم يُرفق بعد):' : 'Asset still required (not attached):'} {entry.assetRequirement}</p>
                {run.revisionId && <PrepareFinishedPost ar={ar} tenantId={tenantId}
                  calendarRevisionId={run.revisionId} dayIndex={entry.dayIndex} platform={entry.platform} />}
                {entry.evidenceRefs.length > 0 && <>
                  <p>{ar ? 'مراجع الأدلة:' : 'Evidence references:'}</p>
                  <ul>{entry.evidenceRefs.map((reference, index) => <li key={`${entry.dayIndex}-${index}`}>{reference}</li>)}</ul>
                </>}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
