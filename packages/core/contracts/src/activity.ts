// -----------------------------------------------------------------------------
// A SampleActivityEntry is only real activity if it carries a run reference
// AND a timestamp. Fields are required, not optional — a presenter that lacks
// either cannot render this shape. That is the point.
// -----------------------------------------------------------------------------

export type SampleActivityState =
  | 'complete'
  | 'refused'
  | 'awaiting_review'
  | 'draft';

export interface SampleActivityEntry {
  readonly id: string;
  readonly runRef: string;
  readonly at: string;
  readonly summary: string;
  readonly state: SampleActivityState;
}
