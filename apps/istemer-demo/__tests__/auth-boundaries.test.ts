import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { verifyIdentity } from '../lib/auth/identity';
import { safeReturnPath } from '../lib/auth/redirects';
import { validatePublicConfig, validateAppOrigin } from '../lib/env';

describe('authentication boundaries', () => {
  const destination = '/en/t/12345678-1234-1234-1234-123456789abc';
  it('only accepts a same-locale tenant return path', () => {
    expect(safeReturnPath(destination, 'en')).toBe(destination);
    for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', `${destination}?next=//evil.test`, '/en/t/%2f%2fevil.test', destination.replace('/en/', '/ar/'), null]) {
      expect(safeReturnPath(value, 'en')).toBe('/en/auth/login');
    }
  });
  it('rejects secret keys and untrusted origins without disclosing configuration', () => {
    expect(validatePublicConfig('https://example.supabase.co', 'sb_secret_private')).toEqual({ status: 'setup-needed' });
    expect(validatePublicConfig('https://example.supabase.co', 'sb_publishable_test').status).toBe('ready');
    expect(validateAppOrigin('https://user:password@example.com')).toBeNull();
    expect(validateAppOrigin('https://example.com/redirect')).toBeNull();
    expect(validateAppOrigin('http://example.com')).toBeNull();
  });
  it('rechecks the upstream identity on every call and rejects revoked, anonymous and unconfirmed identities', async () => {
    const user = { id: 'verified-user', email_confirmed_at: '2026-09-15T00:00:00Z', is_anonymous: false } as User;
    let current: User | null = user;
    let calls = 0;
    const fresh = async () => { calls++; return { data: { user: current }, error: null }; };
    expect(await verifyIdentity(fresh)).toEqual({ status: 'authenticated', userId: 'verified-user' });
    current = null;
    expect((await verifyIdentity(fresh)).status).toBe('signed-out');
    expect(calls).toBe(2);
    for (const invalid of [{ ...user, is_anonymous: true }, { ...user, email_confirmed_at: undefined }]) {
      expect((await verifyIdentity(async () => ({ data: { user: invalid }, error: null }))).status).toBe('signed-out');
    }
    expect((await verifyIdentity(async () => ({ data: { user }, error: new Error('revoked') }))).status).toBe('signed-out');
    expect((await verifyIdentity(async () => { throw new Error('offline'); })).status).toBe('unavailable');
  });
});
