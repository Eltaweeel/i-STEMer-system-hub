import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ role: 'owner', member: true, assurance: 'aal1', reads: [] as string[], filters: [] as [string, unknown][] }));
vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({
  auth: {
    getUser: async () => ({ data: { user: { id: 'current-user', email_confirmed_at: 'confirmed', is_anonymous: false } }, error: null }),
    mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: state.assurance }, error: null }) },
  },
  from: (table: string) => {
    state.reads.push(table);
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { state.filters.push([column, value]); return query; },
      maybeSingle: async () => ({ data: table === 'memberships' ? (state.member ? { role: state.role } : null) : { name: 'Authorized tenant' }, error: null }),
    };
    return query;
  },
}) }));
import { readTenantAccess } from '../lib/auth/tenant';
const tenant = '12345678-1234-1234-1234-123456789abc';
beforeEach(() => { state.role = 'owner'; state.member = true; state.assurance = 'aal1'; state.reads = []; state.filters = []; });
it('never loads tenant data for an owner without AAL2', async () => {
  expect((await readTenantAccess(tenant)).status).toBe('mfa-required');
  expect(state.reads).toEqual(['memberships']);
});
it('rechecks revoked membership before loading protected data', async () => {
  state.assurance = 'aal2';
  expect((await readTenantAccess(tenant)).status).toBe('authorized');
  expect(state.filters).toContainEqual(['user_id', 'current-user']);
  expect(state.filters).toContainEqual(['tenant_id', tenant]);
  expect(state.filters).toContainEqual(['status', 'active']);
  state.member = false;
  state.reads = [];
  expect((await readTenantAccess(tenant)).status).toBe('denied');
  expect(state.reads).toEqual(['memberships']);
});
