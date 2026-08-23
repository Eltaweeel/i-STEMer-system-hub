export const NORTHWIND_FIXTURE_NOW = '2027-02-11T10:40:00+02:00' as const;
export const NORTHWIND_FIXTURE_TZ = 'Africa/Cairo' as const;
export const NORTHWIND_DATA_VERSION = 'northwind-conformance-2027-02-11' as const;

const FROZEN_INSTANT_MS = Date.parse(NORTHWIND_FIXTURE_NOW);

export function northwindOffsetMinutes(minutes: number): string {
  return new Date(FROZEN_INSTANT_MS + minutes * 60_000).toISOString();
}

export function formatNorthwindTime(iso: string): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: NORTHWIND_FIXTURE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${formatter.format(new Date(Date.parse(iso)))} ${NORTHWIND_FIXTURE_TZ}`;
}
