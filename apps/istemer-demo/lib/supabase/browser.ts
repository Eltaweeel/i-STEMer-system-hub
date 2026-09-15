'use client';
import { createBrowserClient } from '@supabase/ssr';
import { publicConfig } from '../env';
export function createClient() {
  const result = publicConfig();
  return result.status === 'ready' ? createBrowserClient(result.config.url, result.config.key) : null;
}
