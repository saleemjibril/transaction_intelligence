import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { requireAuth } from "../auth/types";
import { getSummary } from "./service";

export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/dashboard/summary", async (request) => {
    return getSummary(app.db, request.user.organizationId);
  });
};
