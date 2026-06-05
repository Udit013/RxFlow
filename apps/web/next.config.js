/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
  transpilePackages: ['@rxflow/types'],
  images: {
    domains: ['localhost', 'storage.rxflow.in'],
  },
}

module.exports = nextConfig
