import 'server-only';
import { createClient } from '../supabase/server';
import { verifyIdentity, type Identity } from './identity';
export async function readIdentity(): Promise<Identity> {
  const client = await createClient();
  return client ? verifyIdentity(() => client.auth.getUser()) : { status: 'setup-needed' };
}
