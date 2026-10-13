import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { CATEGORIES, CATEGORY_LABELS } from "../../domain/categories";
import { requireAuth } from "../auth/types";

export const categoryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/categories", () =>
    CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
  );
};
