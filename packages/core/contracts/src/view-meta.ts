export type ViewSource = 'fixture' | 'api';

export interface ViewMeta {
  readonly source: ViewSource;
  readonly isSample: boolean;
  readonly isPartial: boolean;
  readonly stale: boolean;
  readonly dataVersion: string;
  readonly capturedAt: string;
  readonly generatedAt: string;
}
