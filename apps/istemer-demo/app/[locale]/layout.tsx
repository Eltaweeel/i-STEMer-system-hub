import { notFound } from 'next/navigation';
import { isLocale } from '../../lib/auth/redirects';

export const dynamic = 'force-dynamic';
export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <section lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} style={{ maxWidth: 640, margin: '32px auto', padding: 24, background: 'var(--surface-panel)', border: '1px solid var(--border-default)', borderRadius: 12 }}>{children}</section>;
}
