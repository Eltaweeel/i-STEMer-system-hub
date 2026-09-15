export type PublicConfig = { url: string; key: string };
export type ConfigResult = { status: 'ready'; config: PublicConfig } | { status: 'setup-needed' };

/** Never include submitted configuration in errors or logs. Only publishable keys are accepted. */
export function validatePublicConfig(url: string | undefined, key: string | undefined): ConfigResult {
  try {
    if (!url || !key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return { status: 'setup-needed' };
    const parsed = new URL(url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return { status: 'setup-needed' };
    return { status: 'ready', config: { url: parsed.origin, key } };
  } catch { return { status: 'setup-needed' }; }
}
export function publicConfig(): ConfigResult {
  return validatePublicConfig(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export function validateAppOrigin(value: string | undefined): string | null {
  try {
    if (!value) return null;
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}
