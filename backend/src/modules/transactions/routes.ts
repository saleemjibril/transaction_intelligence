import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../auth/types";
import { toTransactionDetailDTO, toTransactionDTO } from "./dto";
import { batchImportSchema, listTransactionsQuerySchema, transactionInputSchema } from "./schemas";
import { getTransaction, importBatch, importSingle, listTransactions } from "./service";

function idempotencyKeyOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const transactionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get(
    "/transactions",
    { schema: { querystring: listTransactionsQuerySchema } },
    async (request) => {
      const result = await listTransactions(app.db, request.user.organizationId, request.query);
      return { data: result.data.map(toTransactionDTO), nextCursor: result.nextCursor };
    },
  );

  app.get(
    "/transactions/:id",
    { schema: { params: z.object({ id: z.string() }) } },
    async (request) => {
      const tx = await getTransaction(app.db, request.user.organizationId, request.params.id);
      return toTransactionDetailDTO(tx);
    },
  );

  app.post(
    "/transactions",
    { schema: { body: transactionInputSchema } },
    async (request, reply) => {
      const result = await importSingle(
        app.db,
        request.user.organizationId,
        request.body,
        idempotencyKeyOf(request.headers["idempotency-key"]),
      );
      return reply.status(result.statusCode).send(result.body);
    },
  );

  app.post(
    "/transactions/batch",
    { schema: { body: batchImportSchema } },
    async (request, reply) => {
      const result = await importBatch(
        app.db,
        request.user.organizationId,
        request.body.transactions,
        idempotencyKeyOf(request.headers["idempotency-key"]),
      );
      return reply.status(result.statusCode).send(result.body);
    },
  );
};
