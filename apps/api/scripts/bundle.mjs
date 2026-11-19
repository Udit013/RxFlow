// Pre-compiles the API, the @rxflow/* workspace packages and most npm dependencies into one
// ESM file, so a cold start on Render's free plan (0.1 CPU) loads one JavaScript file instead of
// transpiling TypeScript with tsx and resolving hundreds of modules.
//
// Kept external (loaded from apps/api/node_modules at runtime):
//   @prisma/*  — the query compiler ships as a wasm module resolved from the package
//   pino*, thread-stream — logging transports run in worker threads loaded by file path
//   @fastify/swagger-ui — serves its static assets from the package directory
//   meilisearch — optional, not installed; imported lazily only when configured
const EXTERNAL = /^(@prisma\/|pino($|-|\/)|thread-stream|@fastify\/swagger-ui|meilisearch$)/
import { build } from 'esbuild'

const started = Date.now()
await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: 'linked',
  logLevel: 'warning',
  // Some bundled CommonJS dependencies call require() for Node built-ins.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  plugins: [{
    name: 'externals',
    setup(b) {
      b.onResolve({ filter: EXTERNAL }, (args) => ({ path: args.path, external: true }))
    },
  }],
})
console.log(`bundled dist/server.mjs in ${Date.now() - started}ms`)
