import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function createPrismaClient(databaseUrl: string) {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export type Db = ReturnType<typeof createPrismaClient>;

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
  }
}
