import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicConfig } from '../env';
export async function createClient() {
  const result = publicConfig();
  if (result.status !== 'ready') return null;
  const jar = await cookies();
  return createServerClient(result.config.url, result.config.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        // Server Components cannot write cookies; proxy refreshes them first.
        // Server Actions and Route Handlers can and do persist changes here.
        try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* read-only render */ }
      },
    },
  });
}
