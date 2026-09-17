import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const tenantId = '00000000-0000-4000-8000-000000000001';
const requesterId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const state = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null, member: null as Record<string, unknown> | null,
  tenant: null as Record<string, unknown> | null, error: null as unknown,
  level: 'aal2', reads: [] as string[], filters: [] as [string, unknown][],
}));
vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({
  auth: {
    getUser: async () => ({ data: { user: state.user }, error: state.error }),
    mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: state.level }, error: null }) },
  },
  from: (table: string) => {
    state.reads.push(table);
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { state.filters.push([column, value]); return query; },
      maybeSingle: async () => ({ data: table === 'memberships' ? state.member : state.tenant, error: state.error }),
    };
    return query;
  },
}) }));
import { readResearchAuthorization } from '../lib/workflow/authorization';

beforeEach(() => {
  vi.stubEnv('ISTEMER_RESEARCH_TENANT_ID', tenantId);
  state.user = { id: requesterId, email_confirmed_at: 'confirmed', is_anonymous: false,
    user_metadata: { tenantId: otherId, role: 'owner', agentId: 'publisher' } };
  state.member = { tenant_id: tenantId, user_id: requesterId, status: 'active', role: 'operator' };
  state.tenant = { id: tenantId, status: 'active' };
  state.error = null; state.level = 'aal2'; state.reads = []; state.filters = [];
});
afterEach(() => vi.unstubAllEnvs());

describe('research authorization', () => {
  it('derives identity and tenant server-side and grants only research scope', async () => {
    expect(await readResearchAuthorization()).toEqual({ status: 'authorized', tenantId, requesterId,
      agentId: 'competitor_analyst', allowedScope: ['research:read'], liveEffects: false });
    expect(state.filters).toContainEqual(['tenant_id', tenantId]);
    expect(state.filters).toContainEqual(['user_id', requesterId]);
  });
  it('fails closed when the server tenant is missing or malformed', async () => {
    for (const value of ['', 'not-a-tenant']) {
      vi.stubEnv('ISTEMER_RESEARCH_TENANT_ID', value);
      expect(await readResearchAuthorization()).toEqual({ status: 'setup-needed' });
    }
    expect(state.reads).toEqual([]);
  });
  it('denies signed-out, anonymous and unconfirmed identities before database reads', async () => {
    for (const user of [null, { id: requesterId, is_anonymous: true }, { id: requesterId }]) {
      state.user = user;
      expect(await readResearchAuthorization()).toEqual({ status: 'signed-out' });
    }
    expect(state.reads).toEqual([]);
  });
  it('rejects wrong tenant, wrong requester, inactive membership and unsupported roles', async () => {
    const member = state.member;
    for (const replacement of [{ tenant_id: otherId }, { user_id: otherId }, { status: 'revoked' }, { role: 'viewer' }]) {
      state.member = { ...member, ...replacement };
      expect(await readResearchAuthorization()).toEqual({ status: 'denied' });
    }
    expect(state.reads).not.toContain('tenants');
  });
  it('requires owner MFA and rechecks revocation on every call', async () => {
    state.member = { ...state.member, role: 'owner' }; state.level = 'aal1';
    expect(await readResearchAuthorization()).toEqual({ status: 'mfa-required' });
    expect(state.reads).not.toContain('tenants');
    state.level = 'aal2';
    expect((await readResearchAuthorization()).status).toBe('authorized');
    state.member = null;
    expect(await readResearchAuthorization()).toEqual({ status: 'denied' });
  });
  it('rejects missing, inactive or mismatched tenant records', async () => {
    for (const tenant of [null, { id: tenantId, status: 'inactive' }, { id: otherId, status: 'active' }]) {
      state.tenant = tenant;
      expect(await readResearchAuthorization()).toEqual({ status: 'denied' });
    }
  });
});
