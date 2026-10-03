import type { FastifyRequest, FastifyReply } from 'fastify'
import { canAccess, type JwtPayload, type UserRole } from '@rxflow/types'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // Access tokens carry the full payload; refresh tokens sign only { userId, sid, jti } (sid = device session; jti makes
    // every rotation unique, even two within the same second).
    payload: JwtPayload | { userId: string; sid?: string; jti?: string }
    user: JwtPayload
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({ success: false, error: 'Unauthorized' })
  }
  // Refresh tokens are signed with the same key but carry only { userId }. Without this
  // check one could be replayed as an access token, leaving request.user.tenantId undefined —
  // and Prisma silently DROPS `where: { tenantId: undefined }`, exposing every tenant's rows.
  const { userId, tenantId, role } = request.user ?? ({} as Partial<JwtPayload>)
  if (!userId || !tenantId || !role) {
    return reply.status(401).send({ success: false, error: 'Unauthorized' })
  }
  // Central role matrix (packages/types → canAccess). Every protected route passes through
  // here, so one table governs who may read or change what.
  const routeUrl = request.routeOptions?.url
  if (routeUrl && !canAccess(role, request.method, routeUrl)) {
    return reply.status(403).send({ success: false, error: 'Your role does not have permission for this action' })
  }
}

export function requireRole(...roles: `${UserRole}`[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply)
    if (reply.sent) return reply
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ success: false, error: 'Forbidden: insufficient permissions' })
    }
  }
}

export async function requireTenant(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.tenantId) {
    return reply.status(403).send({ success: false, error: 'Tenant context required' })
  }
}
