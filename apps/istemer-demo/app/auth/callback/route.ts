import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { isLocale, safeReturnPath } from '../../../lib/auth/redirects';
import { validateAppOrigin } from '../../../lib/env';
import { verifyIdentity } from '../../../lib/auth/identity';
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const requestedLocale = query.get('locale') ?? 'en';
  const locale = isLocale(requestedLocale) ? requestedLocale : 'en';
  const origin = validateAppOrigin(process.env.APP_ORIGIN);
  if (!origin) return new NextResponse('Authentication setup needed.', { status: 503, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  const client = await createClient();
  let target = `/${locale}/auth/login?state=failed`;
  const code = query.get('code');
  if (client && code && code.length <= 4096) {
    try {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error && (await verifyIdentity(() => client.auth.getUser())).status === 'authenticated') {
        target = query.get('flow') === 'recovery' ? `/${locale}/auth/reset-password` : safeReturnPath(query.get('next'), locale);
      }
    } catch { /* No codes, tokens or upstream errors in output. */ }
  }
  const response = NextResponse.redirect(new URL(target, origin), 303);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
