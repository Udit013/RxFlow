import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  request.log.error(error)

  // Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(422).send({
      success: false,
      error: 'Validation Error',
      details: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    })
  }

  // Fastify validation errors
  if (error.validation) {
    return reply.status(400).send({
      success: false,
      error: 'Bad Request',
      message: error.message,
    })
  }

  // JWT errors
  if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' ||
      error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
    return reply.status(401).send({
      success: false,
      error: 'Unauthorized',
    })
  }

  // Prisma errors
  const prismaError = error as FastifyError & { code?: string }
  if (prismaError.code === 'P2002') {
    return reply.status(409).send({
      success: false,
      error: 'Conflict',
      message: 'A record with this value already exists',
    })
  }
  if (prismaError.code === 'P2025') {
    return reply.status(404).send({
      success: false,
      error: 'Not Found',
      message: 'Record not found',
    })
  }

  // Default
  const statusCode = error.statusCode ?? 500
  reply.status(statusCode).send({
    success: false,
    error: statusCode >= 500 ? 'Internal Server Error' : error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  })
}
