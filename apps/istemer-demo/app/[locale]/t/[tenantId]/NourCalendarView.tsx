import type { NourRunView } from '@bagos/contracts';
import { stageStatusText } from './stage-status';

export function NourCalendarView({ ar, run }: { ar: boolean; run: NourRunView }) {
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
                {ar ? `اليوم ${entry.dayIndex + 1}:` : `Day ${entry.dayIndex + 1}:`} {entry.platform} — {entry.format} — {entry.conceptTitle}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
