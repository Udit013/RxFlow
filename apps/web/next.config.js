const path = require('node:path')

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
  // Turbopack (the default bundler since Next 16) resolves the `.js` specifiers that ESM
  // TypeScript workspace packages use to their `.ts` sources on its own — no extension alias.
  // The monorepo root, so workspace packages and hoisted node_modules resolve.
  turbopack: { root: path.join(__dirname, '..', '..') },
  // Defence-in-depth headers on every page. No script CSP: Next's inline bootstrap scripts
  // would need nonces. These directives can't affect rendering. (Vercel already adds HSTS.)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
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
