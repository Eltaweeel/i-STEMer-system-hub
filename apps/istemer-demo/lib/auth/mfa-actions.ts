'use server';
import { redirect } from 'next/navigation';
import { createClient } from '../supabase/server';
import { verifyIdentity } from './identity';
import { isLocale, safeReturnPath } from './redirects';
import { TENANT_CONFIG } from '../../tenant/tenant.config';

export type EnrollmentState = { status: 'idle' | 'failed' | 'ready'; factorId?: string; qr?: string; secret?: string };
export async function enrollTotp(_previous: EnrollmentState, _form: FormData): Promise<EnrollmentState> {
  const client = await createClient();
  if (!client || (await verifyIdentity(() => client.auth.getUser())).status !== 'authenticated') return { status: 'failed' };
  try {
    const factors = await client.auth.mfa.listFactors();
    // Never replace or remove an existing factor or recovery method.
    if (factors.error || factors.data.all.some(factor => factor.factor_type === 'totp')) return { status: 'failed' };
    const result = await client.auth.mfa.enroll({ factorType: 'totp', issuer: TENANT_CONFIG.brand.productName });
    if (result.error) return { status: 'failed' };
    return { status: 'ready', factorId: result.data.id, qr: result.data.totp.qr_code, secret: result.data.totp.secret };
  } catch { return { status: 'failed' }; }
}

export async function verifyTotp(form: FormData) {
  const requestedLocale = form.get('locale');
  const locale = typeof requestedLocale === 'string' && isLocale(requestedLocale) ? requestedLocale : 'en';
  const next = safeReturnPath(form.get('next'), locale);
  const failure = `/${locale}/auth/mfa?state=failed&next=${encodeURIComponent(next)}`;
  const client = await createClient();
  if (!client || (await verifyIdentity(() => client.auth.getUser())).status !== 'authenticated') redirect(`/${locale}/auth/login`);
  const factorId = form.get('factorId');
  const code = form.get('code');
  let verified = false;
  if (typeof factorId === 'string' && typeof code === 'string' && /^\d{6}$/.test(code)) {
    try {
      const factors = await client.auth.mfa.listFactors();
      const ownFactor = factors.data?.all.find(factor => factor.id === factorId && factor.factor_type === 'totp');
      if (!factors.error && ownFactor) {
        // Challenge is created and consumed in this request; no challenge ID accepted from the browser.
        const result = await client.auth.mfa.challengeAndVerify({ factorId: ownFactor.id, code });
        if (!result.error) {
          const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
          verified = !assurance.error && assurance.data.currentLevel === 'aal2';
        }
      }
    } catch { /* Generic failure only. */ }
  }
  redirect(verified ? next : failure);
}
