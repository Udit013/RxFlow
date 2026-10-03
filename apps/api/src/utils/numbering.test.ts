import { describe, it, expect, vi } from 'vitest'

vi.mock('@rxflow/db', () => ({ prisma: {} }))
const { computeNextSeq, withUniqueRetry } = await import('./numbering.js')

describe('computeNextSeq', () => {
  const stem = 'INV/2025-26/'

  it('starts at 1 for an empty FY', () => {
    expect(computeNextSeq(0, null, stem)).toBe(1)
  })

  it('follows the highest existing number, not the count, after a deletion', () => {
    // 3 rows remain but INV/…/00004 still exists → count+1 would re-use 00004.
    expect(computeNextSeq(3, 'INV/2025-26/00004', stem)).toBe(5)
  })

  it('falls back to count when the latest number is not parseable', () => {
    expect(computeNextSeq(7, 'INV/2025-26/abc', stem)).toBe(8)
  })

  it('uses count past the 5-digit pad, where lexical order stops being numeric', () => {
    // "99999" sorts after "100000" lexically, so the count must win here.
    expect(computeNextSeq(100000, 'INV/2025-26/99999', stem)).toBe(100001)
  })

  it('ignores a latest number from a different stem', () => {
    expect(computeNextSeq(2, 'INV/2024-25/00090', stem)).toBe(3)
  })
})

describe('withUniqueRetry', () => {
  const p2002 = Object.assign(new Error('unique'), { code: 'P2002' })

  it('retries on P2002 and returns the first success', async () => {
    const fn = vi.fn().mockRejectedValueOnce(p2002).mockResolvedValueOnce('ok')
    await expect(withUniqueRetry(fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('gives up after the attempt limit', async () => {
    const fn = vi.fn().mockRejectedValue(p2002)
    await expect(withUniqueRetry(fn, 3)).rejects.toBe(p2002)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry other errors', async () => {
    const boom = new Error('boom')
    const fn = vi.fn().mockRejectedValue(boom)
    await expect(withUniqueRetry(fn)).rejects.toBe(boom)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
