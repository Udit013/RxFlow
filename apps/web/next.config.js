/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app talks to the Fastify API over HTTP (axios), not Server Actions,
  // so no allowedOrigins config is needed.
  transpilePackages: ['@rxflow/types', '@rxflow/regional'],
  // `images.domains` is deprecated in Next 15 — same hosts as remotePatterns.
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'storage.rxflow.in' },
    ],
  },
  // Don't fail the production build on ESLint findings — we lint/type-check
  // locally (tsc --noEmit is clean). Type errors STILL fail the build.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Workspace packages are ESM TypeScript, where relative imports must be written with a
  // `.js` extension (Node's rule). Teach webpack to resolve those to the `.ts` sources.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
  // Auth endpoints are proxied through this app's own origin so the API's httpOnly refresh
  // cookie is FIRST-party (same site as the UI). A cross-site cookie from the API's domain
  // would be dropped by Safari / third-party-cookie blocking. All other API calls go direct.
  async rewrites() {
    const api = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '')
    return [{ source: '/api/v1/auth/:path*', destination: `${api}/auth/:path*` }]
  },
}

module.exports = nextConfig
