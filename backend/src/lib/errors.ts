import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Prisma reports unique-constraint violations as P2002; the underlying
// node-postgres driver surfaces PostgreSQL's 23505. Handle both.
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  if (code === "P2002" || code === "23505") {
    return true;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /duplicate key|unique constraint/i.test(message);
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  }

  // Fastify's JSON-schema validation failures.
  if (error.validation) {
    return reply.status(400).send({ error: "VALIDATION_ERROR", message: error.message });
  }

  if (error.statusCode === 401) {
    return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or missing token" });
  }

  request.log.error(error);
  return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Something went wrong" });
}
