import type { PaginationMeta } from '@rxflow/types'

export interface PaginationParams {
  page?: number
  limit?: number
}

export function getPaginationParams(query: PaginationParams) {
  const safePage = Number.isFinite(query.page) ? (query.page as number) : 1
  const safeLimit = Number.isFinite(query.limit) ? (query.limit as number) : 20
  const page = Math.max(1, safePage)
  const limit = Math.min(100, Math.max(1, safeLimit))
  const skip = (page - 1) * limit
  return { page, limit, skip, take: limit }
}

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit)
  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  }
}
