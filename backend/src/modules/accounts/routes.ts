import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { z } from "zod";
import { AccountType } from "../../generated/prisma/enums";
import { requireAuth } from "../auth/types";
import { createAccount, listAccounts } from "./service";

const createAccountSchema = z.object({
  name: z.string().min(1),
  type: z.enum(AccountType),
  currency: z.string().optional(),
});

export const accountRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/accounts", async (request) => listAccounts(app.db, request.user.organizationId));

  app.post(
    "/accounts",
    { schema: { body: createAccountSchema } },
    async (request, reply) => {
      const account = await createAccount(app.db, request.user.organizationId, request.body);
      return reply.status(201).send(account);
    },
  );
};
