import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../../../lib/supabase/server';
import { verifyIdentity } from '../../../../lib/auth/identity';
import { isLocale, safeReturnPath } from '../../../../lib/auth/redirects';
import { Enroll, Verify } from './enroll';

export default async function MfaPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string; state?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ar = locale === 'ar';
  const query = await searchParams;
  const next = safeReturnPath(query.next, locale);
  const client = await createClient();
  if (!client) return <p>{ar ? 'المصادقة تحتاج إلى إعداد.' : 'Authentication setup is needed.'}</p>;
  if ((await verifyIdentity(() => client.auth.getUser())).status !== 'authenticated') redirect(`/${locale}/auth/login?next=${encodeURIComponent(next)}`);
  const factors = await client.auth.mfa.listFactors().catch(() => null);
  if (!factors || factors.error) return <p role="alert">{ar ? 'تعذر تحميل طرق المصادقة.' : 'Authentication methods could not be loaded.'}</p>;
  const totp = factors.data.all.filter(factor => factor.factor_type === 'totp');
  return <>
    <h1>{ar ? 'التحقق بخطوتين' : 'Two-step verification'}</h1>
    {query.state === 'failed' && <p role="alert">{ar ? 'تعذر التحقق من الرمز. حاول مرة أخرى.' : 'The code could not be verified. Try again.'}</p>}
    {totp.length ? totp.map((factor, index) => <section key={factor.id}><h2>{ar ? `تطبيق المصادقة ${index + 1}` : `Authenticator ${index + 1}`}</h2><Verify locale={locale} next={next} factorId={factor.id} /></section>) : <Enroll locale={locale} next={next} />}
    <p>{ar ? 'إذا فقدت التطبيق أو غادرت الإعداد قبل حفظ المفتاح، تواصل مع المسؤول لاستعادة الوصول. لا تتم إزالة طرق الاستعادة الموجودة.' : 'If you lost your app or left setup before saving the key, contact your administrator to recover access. Existing recovery methods are preserved.'}</p>
    <Link href={`/${locale}/auth/login`}>{ar ? 'إدارة الجلسة' : 'Manage session'}</Link>
  </>;
}
