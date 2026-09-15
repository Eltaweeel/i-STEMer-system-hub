import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ authenticated: true, challenged: [] as string[], enrolled: 0, factors: [{ id: 'own-factor', factor_type: 'totp' }] }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(path); } }));
vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({ auth: {
  getUser: async () => ({ data: { user: state.authenticated ? { id: 'caller', email_confirmed_at: 'confirmed' } : null }, error: null }),
  mfa: {
    listFactors: async () => ({ data: { all: state.factors }, error: null }),
    challengeAndVerify: async ({ factorId }: { factorId: string }) => { state.challenged.push(factorId); return { error: null }; },
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2' }, error: null }),
    enroll: async () => { state.enrolled++; return { error: null, data: { id: 'new', totp: { secret: 'test-only', qr_code: 'test-only' } } }; },
  },
} }) }));
import { enrollTotp, verifyTotp } from '../lib/auth/mfa-actions';
beforeEach(() => { state.authenticated = true; state.challenged = []; state.enrolled = 0; state.factors = [{ id: 'own-factor', factor_type: 'totp' }]; });
it('rejects a submitted factor that does not belong to the freshly verified user', async () => {
  const form = new FormData(); form.set('factorId', 'someone-elses-factor'); form.set('code', '123456');
  await expect(verifyTotp(form)).rejects.toThrow('/en/auth/mfa?state=failed');
  expect(state.challenged).toEqual([]);
});
it('requires fresh identity before enrollment and never replaces existing TOTP factors', async () => {
  state.authenticated = false;
  expect((await enrollTotp({ status: 'idle' }, new FormData())).status).toBe('failed');
  state.authenticated = true;
  expect((await enrollTotp({ status: 'idle' }, new FormData())).status).toBe('failed');
  expect(state.enrolled).toBe(0);
});
it('challenges the current user factor and constrains the post-verification destination', async () => {
  const form = new FormData(); form.set('factorId', 'own-factor'); form.set('code', '123456'); form.set('next', 'https://evil.test');
  await expect(verifyTotp(form)).rejects.toThrow('/en/auth/login');
  expect(state.challenged).toEqual(['own-factor']);
});
