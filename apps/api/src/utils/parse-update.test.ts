import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseUpdate } from './parse-update.js'

const schema = z.object({
  name: z.string().min(1),
  creditLimit: z.number().default(0),
  tags: z.array(z.string()).default([]),
  email: z.preprocess((v) => (v === '' ? undefined : v), z.string().email().optional()),
})

describe('parseUpdate', () => {
  it('never fills in defaults for fields the client did not send', () => {
    // plain `.partial()` in zod 4 would return creditLimit: 0, tags: []
    expect(schema.partial().parse({ name: 'X' })).toMatchObject({ creditLimit: 0, tags: [] })
    expect(parseUpdate(schema, { name: 'X' })).toEqual({ name: 'X' })
  })

  it('still validates and transforms what was sent', () => {
    expect(parseUpdate(schema, { creditLimit: 500, email: '' })).toEqual({ creditLimit: 500, email: undefined })
    expect(() => parseUpdate(schema, { name: '' })).toThrow()
    expect(() => parseUpdate(schema, { creditLimit: 'lots' })).toThrow()
  })
})
