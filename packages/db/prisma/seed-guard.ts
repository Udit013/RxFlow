/**
 * The demo workspace ships a publicly known login (admin@rxflow.in / admin123, printed in the
 * README), so seeding it must be a deliberate act. Nothing creates it unless SEED_DEMO=true —
 * and never in production, even then, unless SEED_DEMO_IN_PRODUCTION=true is also set.
 */
export type SeedDecision = { seed: true } | { seed: false; reason: string }

export function demoSeedDecision(env: Record<string, string | undefined>): SeedDecision {
  if (env.SEED_DEMO !== 'true') return { seed: false, reason: 'demo seeding is opt-in: set SEED_DEMO=true' }
  if (env.NODE_ENV === 'production' && env.SEED_DEMO_IN_PRODUCTION !== 'true') {
    return { seed: false, reason: 'refusing to create the public demo login with NODE_ENV=production' }
  }
  return { seed: true }
}
