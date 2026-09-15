import type { User } from '@supabase/supabase-js';
export type Identity = { status: 'authenticated'; userId: string } | { status: 'signed-out' } | { status: 'unavailable' } | { status: 'setup-needed' };
/** Only a successful fresh Auth response qualifies; cookie payloads and metadata do not. */
export async function verifyIdentity(getUser: () => Promise<{ data: { user: User | null }; error: unknown }>): Promise<Identity> {
  try {
    const { data, error } = await getUser();
    if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) return { status: 'signed-out' };
    return { status: 'authenticated', userId: data.user.id };
  } catch { return { status: 'unavailable' }; }
}
