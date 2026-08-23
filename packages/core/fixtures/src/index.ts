import type { Clock } from '@bagos/contracts';

// -----------------------------------------------------------------------------
// The one and only frozen instant. Every fixture timestamp in the app is
// expressed as an offset from this — never as a literal date typed by hand,
// and never derived from the wall clock. This is what keeps screenshots
// byte-identical and what keeps the 08:00 -> 20:00 operating-cycle copy
// coherent regardless of when the demo is opened.
//
// Choice: Wednesday 2026-08-19, 09:15 local time in Africa/Cairo (UTC+2).
// A weekday morning inside the operating cycle.
// -----------------------------------------------------------------------------
export const FIXTURE_NOW = '2026-08-19T09:15:00+02:00' as const;
export const FIXTURE_TZ = 'Africa/Cairo' as const;
export const FIXTURE_DATA_VERSION = 'batch1-2026-08-19' as const;

const FIXTURE_NOW_MS = Date.parse(FIXTURE_NOW);

// Convert a minute offset from FIXTURE_NOW into an ISO instant.
// Negative = in the past, positive = in the future.
export function offsetMinutes(minutes: number): string {
  const ms = FIXTURE_NOW_MS + minutes * 60_000;
  // new Date(<arg>) is not a wall-clock read — the lint ban is on argument-less
  // new Date() and Date.now() only.
  return new Date(ms).toISOString();
}

export function offsetHours(hours: number): string {
  return offsetMinutes(hours * 60);
}

// The default Clock used by the app. Everywhere else, callers must inject it.
export function fixtureClock(): Clock {
  return { nowIso: () => FIXTURE_NOW };
}

// Formatter used wherever a fixture time is displayed. Timezone is fixed and
// printed explicitly so the operating cycle is never ambiguous.
export function formatFixtureTime(iso: string): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: FIXTURE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.format(new Date(Date.parse(iso)));
  return `${parts} ${FIXTURE_TZ}`;
}

// Relative-time renderer takes a Clock as an INJECTED dependency, never a
// module-level call.
export function formatRelative(iso: string, clock: Clock): string {
  const nowMs = Date.parse(clock.nowIso());
  const thenMs = Date.parse(iso);
  const deltaMin = Math.round((nowMs - thenMs) / 60_000);
  if (deltaMin === 0) return 'just now';
  const absMin = Math.abs(deltaMin);
  const past = deltaMin > 0;
  if (absMin < 60) return past ? `${absMin} min ago` : `in ${absMin} min`;
  const hours = Math.round(absMin / 60);
  if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  return past ? `${days}d ago` : `in ${days}d`;
}
