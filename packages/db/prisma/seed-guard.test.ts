import { describe, it, expect } from 'vitest'
import { demoSeedDecision } from './seed-guard.js'

describe('demo seeding is opt-in', () => {
  it('does nothing by default — a normal deploy never creates the public demo login', () => {
    expect(demoSeedDecision({})).toMatchObject({ seed: false })
    expect(demoSeedDecision({ NODE_ENV: 'production' })).toMatchObject({ seed: false })
  })
  it('requires the exact value "true"', () => {
    for (const v of ['1', 'yes', 'TRUE', 'false', '']) expect(demoSeedDecision({ SEED_DEMO: v })).toMatchObject({ seed: false })
  })
  it('seeds when opted in outside production', () => {
    expect(demoSeedDecision({ SEED_DEMO: 'true' })).toEqual({ seed: true })
    expect(demoSeedDecision({ SEED_DEMO: 'true', NODE_ENV: 'development' })).toEqual({ seed: true })
  })
  it('refuses production even when opted in, unless explicitly forced', () => {
    expect(demoSeedDecision({ SEED_DEMO: 'true', NODE_ENV: 'production' })).toMatchObject({ seed: false })
    expect(demoSeedDecision({ SEED_DEMO: 'true', NODE_ENV: 'production', SEED_DEMO_IN_PRODUCTION: 'true' })).toEqual({ seed: true })
  })
})
