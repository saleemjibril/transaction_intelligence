import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { z } from "zod";
import { TransactionCategory } from "../../generated/prisma/enums";
import { requireAuth } from "../auth/types";
import { toTransactionDetailDTO } from "../transactions/dto";
import { correctCategory, listForReview, resolveReview } from "./service";

const reviewActionSchema = z.enum(["resolve", "dismiss"]);

export const reviewRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/review", async (request) => {
    const transactions = await listForReview(app.db, request.user.organizationId);
    return { data: transactions.map(toTransactionDetailDTO) };
  });

  app.patch(
    "/transactions/:id/category",
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({ category: z.enum(TransactionCategory) }),
      },
    },
    async (request) => {
      const transaction = await correctCategory(
        app.db,
        request.user.organizationId,
        request.params.id,
        request.user.sub,
        request.body.category,
      );
      return toTransactionDetailDTO(transaction);
    },
  );

  app.post(
    "/transactions/:id/review",
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({ action: reviewActionSchema }),
      },
    },
    async (request) => {
      const transaction = await resolveReview(
        app.db,
        request.user.organizationId,
        request.params.id,
        request.body.action,
      );
      return toTransactionDetailDTO(transaction);
    },
  );
};
