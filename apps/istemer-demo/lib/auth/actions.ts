'use server';
import { redirect } from 'next/navigation';
import { createClient } from '../supabase/server';
import { validateAppOrigin } from '../env';
import { verifyIdentity } from './identity';
import { isLocale, safeReturnPath } from './redirects';
function context(form: FormData) {
  const value = form.get('locale');
  const locale = typeof value === 'string' && isLocale(value) ? value : 'en';
  return { locale, next: safeReturnPath(form.get('next'), locale) };
}
function field(form: FormData, name: string): string { const value = form.get(name); return typeof value === 'string' ? value : ''; }
export async function login(form: FormData) {
  const { locale, next } = context(form);
  const client = await createClient();
  if (!client) redirect(`/${locale}/auth/login?state=setup`);
  const email = field(form, 'email').trim();
  const password = field(form, 'password');
  let success = false;
  if (email.length <= 254 && password.length <= 1024 && email && password) {
    try {
      const result = await client.auth.signInWithPassword({ email, password });
      success = !result.error && (await verifyIdentity(() => client.auth.getUser())).status === 'authenticated';
    } catch { /* Generic response, no upstream error disclosure. */ }
  }
  if (!success) redirect(`/${locale}/auth/login?state=failed`);
  redirect(next);
}
export async function logout(form: FormData) {
  const { locale } = context(form);
  const client = await createClient();
  if (!client) redirect(`/${locale}/auth/login?state=setup`);
  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) redirect(`/${locale}/auth/login?state=logout-failed`);
  } catch { redirect(`/${locale}/auth/login?state=logout-failed`); }
  redirect(`/${locale}/auth/login`);
}
export async function recover(form: FormData) {
  const { locale } = context(form);
  const client = await createClient();
  const origin = validateAppOrigin(process.env.APP_ORIGIN);
  if (!client || !origin) redirect(`/${locale}/auth/recovery?state=setup`);
  const email = field(form, 'email').trim();
  if (email && email.length <= 254) {
    try { await client.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?locale=${locale}&flow=recovery` }); } catch { /* Account-neutral response. */ }
  }
  redirect(`/${locale}/auth/recovery?state=sent`);
}
export async function resetPassword(form: FormData) {
  const { locale } = context(form);
  const client = await createClient();
  if (!client) redirect(`/${locale}/auth/reset-password?state=setup`);
  const identity = await verifyIdentity(() => client.auth.getUser());
  if (identity.status !== 'authenticated') redirect(`/${locale}/auth/login?state=failed`);
  const password = field(form, 'password');
  if (password.length < 12 || password.length > 1024 || password !== field(form, 'confirmation')) redirect(`/${locale}/auth/reset-password?state=failed`);
  let success = false;
  try { success = !(await client.auth.updateUser({ password })).error; } catch { /* Generic response. */ }
  redirect(`/${locale}/auth/reset-password?state=${success ? 'updated' : 'failed'}`);
}
