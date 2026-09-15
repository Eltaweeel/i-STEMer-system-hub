import Link from 'next/link';
import { notFound } from 'next/navigation';
import { login, logout, recover, resetPassword } from '../../../../lib/auth/actions';
import { isLocale, safeReturnPath } from '../../../../lib/auth/redirects';
import { readIdentity } from '../../../../lib/auth/session';
import { validateAppOrigin } from '../../../../lib/env';

export default async function AuthPage({ params, searchParams }: { params: Promise<{ locale: string; mode: string }>; searchParams: Promise<{ state?: string; next?: string }> }) {
  const { locale, mode } = await params;
  if (!isLocale(locale) || !['login', 'recovery', 'reset-password'].includes(mode)) notFound();
  const ar = locale === 'ar';
  const query = await searchParams;
  const identity = await readIdentity();
  const signedIn = identity.status === 'authenticated';
  const setup = identity.status === 'setup-needed' || (mode === 'recovery' && !validateAppOrigin(process.env.APP_ORIGIN));
  const title = mode === 'login' ? (ar ? 'تسجيل الدخول' : 'Sign in') : mode === 'recovery' ? (ar ? 'استعادة الحساب' : 'Recover your account') : (ar ? 'تغيير كلمة المرور' : 'Change password');
  const messages: Record<string, string> = {
    failed: ar ? 'تعذر إكمال الطلب. تحقق من البيانات وحاول مرة أخرى.' : 'The request could not be completed. Check your details and try again.',
    sent: ar ? 'إذا كان الحساب مؤهلاً، ستصلك رسالة استعادة. افتح الرابط في هذا المتصفح.' : 'If the account is eligible, a recovery email will arrive. Open its link in this browser.',
    updated: ar ? 'تم تحديث كلمة المرور.' : 'Your password was updated.',
    'logout-failed': ar ? 'تعذر تأكيد تسجيل الخروج. حاول مرة أخرى.' : 'Sign-out could not be confirmed. Try again.',
  };
  const blocked = setup || identity.status === 'unavailable' || (mode === 'reset-password' && !signedIn);
  return <>
    <nav aria-label={ar ? 'اللغة' : 'Language'}><Link href={`/${ar ? 'en' : 'ar'}/auth/${mode}`}>{ar ? 'English' : 'العربية'}</Link> · <Link href="/">{ar ? 'عرض البيانات النموذجية' : 'Explore sample data'}</Link></nav>
    <h1>{title}</h1>
    <p>{ar ? 'للحسابات الموجودة فقط. الوصول إلى المؤسسة يتطلب عضوية نشطة.' : 'For existing accounts only. Organization access requires an active membership.'}</p>
    {setup && <p role="status">{ar ? 'المصادقة تحتاج إلى إعداد من مسؤول النظام.' : 'Authentication needs administrator configuration.'}</p>}
    {identity.status === 'unavailable' && <p role="alert">{ar ? 'خدمة المصادقة غير متاحة حالياً.' : 'Authentication is currently unavailable.'}</p>}
    {query.state && messages[query.state] && <p role="status">{messages[query.state]}</p>}
    {signedIn && <p role="status">{ar ? 'تم التحقق من جلستك. استخدم رابط مؤسستك للوصول إليها.' : 'Your session is verified. Use your organization link to access it.'}</p>}
    {mode === 'reset-password' && !signedIn && !setup && <p>{ar ? 'افتح رابط الاستعادة أو سجل الدخول أولاً.' : 'Open your recovery link or sign in first.'}</p>}
    {!blocked && !(signedIn && mode === 'login') && <form action={mode === 'login' ? login : mode === 'recovery' ? recover : resetPassword} style={{ display: 'grid', gap: 16 }}>
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="next" value={safeReturnPath(query.next, locale)} />
      {mode !== 'reset-password' && <label>{ar ? 'البريد الإلكتروني' : 'Email'}<input style={{ display: 'block', width: '100%', padding: 10 }} name="email" type="email" autoComplete="email" required maxLength={254} dir="ltr" /></label>}
      {mode !== 'recovery' && <label>{ar ? 'كلمة المرور' : 'Password'}<input style={{ display: 'block', width: '100%', padding: 10 }} name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 12} maxLength={1024} /></label>}
      {mode === 'reset-password' && <><p>{ar ? 'استخدم 12 حرفاً على الأقل.' : 'Use at least 12 characters.'}</p><label>{ar ? 'تأكيد كلمة المرور' : 'Confirm password'}<input style={{ display: 'block', width: '100%', padding: 10 }} name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={1024} /></label></>}
      <button type="submit" style={{ padding: 12 }}>{title}</button>
    </form>}
    <p><Link href={`/${locale}/auth/${mode === 'login' ? 'recovery' : 'login'}`}>{mode === 'login' ? (ar ? 'نسيت كلمة المرور؟' : 'Forgot password?') : (ar ? 'تسجيل الدخول' : 'Sign in')}</Link></p>
    {signedIn && <form action={logout}><input type="hidden" name="locale" value={locale} /><button type="submit">{ar ? 'تسجيل الخروج' : 'Sign out'}</button></form>}
  </>;
}
