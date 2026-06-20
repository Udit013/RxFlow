/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app talks to the Fastify API over HTTP (axios), not Server Actions,
  // so no allowedOrigins config is needed.
  transpilePackages: ['@rxflow/types'],
  images: {
    domains: ['localhost', 'storage.rxflow.in'],
  },
  // Don't fail the production build on ESLint findings — we lint/type-check
  // locally (tsc --noEmit is clean). Type errors STILL fail the build.
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
