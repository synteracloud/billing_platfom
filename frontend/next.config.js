/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@billing-platform/ui', '@billing-platform/renderer', '@billing-platform/shared-types'],
  experimental: {
    externalDir: true,
  },
};

module.exports = nextConfig;
