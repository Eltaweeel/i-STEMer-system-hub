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
  experimental: {
    workerThreads: true,
    cpus: 1,
  },
};

export default nextConfig;
