import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicConfig } from './lib/env';
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const result = publicConfig();
  if (result.status === 'ready') {
    const client = createServerClient(result.config.url, result.config.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    try { await client.auth.getClaims(); } catch { /* DAL independently fails closed on Auth failure. */ }
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
export const config = { matcher: ['/en/auth/:path*', '/ar/auth/:path*', '/en/t/:path*', '/ar/t/:path*', '/auth/callback'] };
