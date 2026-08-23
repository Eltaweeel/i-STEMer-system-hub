/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
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
