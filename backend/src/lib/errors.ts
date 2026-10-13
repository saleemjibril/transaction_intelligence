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
