export type Locale = 'en' | 'ar';
export function isLocale(value: string): value is Locale { return value === 'en' || value === 'ar'; }
export function loginPath(locale: Locale): string { return `/${locale}/auth/login`; }
/** Exact local route grammar; reject escaping, encoded separators and arbitrary query parameters. */
export function safeReturnPath(value: unknown, locale: Locale): string {
  const fallback = loginPath(locale);
  if (typeof value !== 'string') return fallback;
  const tenant = new RegExp(`^/${locale}/t/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/?$`, 'i');
  return tenant.test(value) ? value : fallback;
}
