import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "@fastify/type-provider-zod";
import Fastify from "fastify";
import type { Db } from "./db";
import { errorHandler } from "./lib/errors";
import { accountRoutes } from "./modules/accounts/routes";
import { authRoutes } from "./modules/auth/routes";
import { categoryRoutes } from "./modules/categories/routes";
import { transactionRoutes } from "./modules/transactions/routes";

export interface AppOptions {
  db: Db;
  jwtSecret: string;
  logger?: boolean;
}

export function buildApp({ db, jwtSecret, logger = true }: AppOptions) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, { origin: true });
  app.register(jwt, { secret: jwtSecret });

  app.decorate("db", db);

  app.setErrorHandler(errorHandler);

  app.get("/health", async () => ({ status: "ok" }));

  app.register(authRoutes, { prefix: "/api/v1" });
  app.register(accountRoutes, { prefix: "/api/v1" });
  app.register(categoryRoutes, { prefix: "/api/v1" });
  app.register(transactionRoutes, { prefix: "/api/v1" });

  return app;
}
