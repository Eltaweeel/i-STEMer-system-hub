import { fileURLToPath } from 'node:url';
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
  transpilePackages: [
    '@bagos/contracts',
    '@bagos/fixtures',
    '@bagos/organization',
    '@bagos/ui',
  ],
  // Static-export static-generation runs each page in a worker. On Windows
  // Node's child_process.fork intermittently fails with "spawn UNKNOWN" for
  // paths containing spaces. Using worker_threads sidesteps that path, and a
  // single CPU keeps the pool trivially bounded.
  experimental: {
    workerThreads: true,
    cpus: 1,
  },
};

export default nextConfig;
