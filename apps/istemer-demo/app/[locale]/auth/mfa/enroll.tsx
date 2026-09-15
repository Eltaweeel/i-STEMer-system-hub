'use client';
import { useActionState } from 'react';
import { enrollTotp, verifyTotp } from '../../../../lib/auth/mfa-actions';
import type { Locale } from '../../../../lib/auth/redirects';

export function Enroll({ locale, next }: { locale: Locale; next: string }) {
  const [state, action, pending] = useActionState(enrollTotp, { status: 'idle' });
  const ar = locale === 'ar';
  return <>
    {state.status === 'idle' && <form action={action}><button disabled={pending}>{ar ? 'إعداد تطبيق المصادقة' : 'Set up authenticator app'}</button></form>}
    {state.status === 'failed' && <p role="alert">{ar ? 'تعذر إعداد المصادقة. أعد تحميل الصفحة أو تواصل مع المسؤول.' : 'Setup could not be completed. Reload the page or contact your administrator.'}</p>}
    {state.status === 'ready' && <>
      <p>{ar ? 'امسح الرمز باستخدام تطبيق المصادقة أو أدخل المفتاح يدوياً. لا تشارك هذا المفتاح.' : 'Scan with your authenticator app or enter the key manually. Keep this key private.'}</p>
      {/* Supabase returns an SVG data URI; an image does not execute SVG scripts. */}
      {state.qr?.startsWith('data:image/svg+xml') && <img src={state.qr} width={220} height={220} alt={ar ? 'رمز إعداد المصادقة' : 'Authenticator setup QR code'} />}
      <p dir="ltr"><code>{state.secret}</code></p>
      <Verify locale={locale} next={next} factorId={state.factorId!} />
    </>}
  </>;
}

export function Verify({ locale, next, factorId }: { locale: Locale; next: string; factorId: string }) {
  const ar = locale === 'ar';
  return <form action={verifyTotp} style={{ display: 'grid', gap: 12 }}>
    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="next" value={next} /><input type="hidden" name="factorId" value={factorId} />
    <label>{ar ? 'رمز التحقق من 6 أرقام' : 'Six-digit authenticator code'}<input name="code" required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" dir="ltr" /></label>
    <button type="submit">{ar ? 'تحقق ومتابعة' : 'Verify and continue'}</button>
  </form>;
}
