import type { CapacitySnapshot, ViewMeta } from '@bagos/contracts';
import { FIXTURE_DATA_VERSION, FIXTURE_NOW } from '@bagos/fixtures';

const META: ViewMeta = {
  source: 'fixture',
  isSample: true,
  isPartial: true,
  stale: false,
  dataVersion: FIXTURE_DATA_VERSION,
  capturedAt: FIXTURE_NOW,
  generatedAt: FIXTURE_NOW,
} as const;

/**
 * This deliberately does not invent a quota number. The demo can show the
 * policy and empty state until a provider adapter supplies real telemetry.
 */
export const CAPACITY_SNAPSHOT: CapacitySnapshot = {
  meta: META,
  id: 'capacity:demo-account',
  providerLabel: 'Provider usage telemetry',
  accountLabel: 'Demo account — connection not configured',
  state: 'unavailable',
  usedPercent: null,
  remainingPercent: null,
  resetAt: null,
  runwayLabel: 'Unavailable until the connected provider supplies usage and reset data.',
  thresholdPercent: 90,
  thresholdState: 'unknown',
  policy:
    'At 90% consumed, Adam queues nonurgent work and switches eligible work to an approved cheaper model.',
  note:
    'No quota is inferred from fixture data. When Codex or another provider is connected, this card should render the provider-reported values and timestamp.',
} as const;
