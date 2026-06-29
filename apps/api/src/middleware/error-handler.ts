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
  const prismaError = error as FastifyError & { code?: string; meta?: Record<string, unknown> }
  if (prismaError.code === 'P2002') {
    const target = (prismaError.meta?.target as string[] | undefined)?.join(', ')
    return reply.status(409).send({
      success: false,
      error: target ? `A record with this ${target} already exists` : 'A record with this value already exists',
    })
  }
  if (prismaError.code === 'P2025') {
    return reply.status(404).send({ success: false, error: 'Record not found' })
  }
  if (prismaError.code === 'P2003') {
    return reply.status(400).send({ success: false, error: 'Related record not found or still in use' })
  }
  if (prismaError.code === 'P2011') {
    return reply.status(400).send({ success: false, error: 'A required field is missing' })
  }
  // Schema drift — column/table missing. Surface a clear, actionable message.
  if (prismaError.code === 'P2022' || prismaError.code === 'P2021') {
    request.log.error({ meta: prismaError.meta }, 'Database schema is out of date')
    return reply.status(500).send({
      success: false,
      error: 'The database schema is out of date. Please run the latest migrations.',
    })
  }

  // Default
  const statusCode = error.statusCode ?? 500
  return reply.status(statusCode).send({
    success: false,
    error: statusCode >= 500 ? 'Internal Server Error' : error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  })
}
