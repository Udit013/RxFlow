import type { FastifyRequest, FastifyReply } from 'fastify'
import type { JwtPayload, UserRole } from '@rxflow/types'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.status(401).send({ success: false, error: 'Unauthorized' })
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply)
    if (!roles.includes(request.user.role)) {
      reply.status(403).send({ success: false, error: 'Forbidden: insufficient permissions' })
    }
  }
}

export function requireTenant(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.tenantId) {
    reply.status(403).send({ success: false, error: 'Tenant context required' })
  }
}
