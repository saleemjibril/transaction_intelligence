import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function createPrismaClient(databaseUrl: string) {
  // Pin the session timezone to UTC. The pg driver sends timestamps as naive
  // UTC wall time, so a non-UTC database session (e.g. Africa/Lagos) would
  // interpret every write as local time and shift it by the UTC offset.
  // Forcing UTC keeps writes, reads and `now()` comparisons consistent.
  const adapter = new PrismaPg({ connectionString: databaseUrl, options: "-c timezone=UTC" });
  return new PrismaClient({ adapter });
}

export type Db = ReturnType<typeof createPrismaClient>;

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
  }
}
