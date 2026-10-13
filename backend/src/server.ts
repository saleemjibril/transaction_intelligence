import { buildApp } from "./app";
import { config } from "./config";
import { createPrismaClient } from "./db";

const db = createPrismaClient(config.DATABASE_URL);
const app = buildApp({ db, jwtSecret: config.JWT_SECRET });

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await db.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
