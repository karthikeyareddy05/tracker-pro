import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { connectMongo, ensureIndexes, getCollections } from "./db.js";
import { logger } from "./logger.js";
import { createResendMailer } from "./mailer.js";

async function main() {
  const config = loadConfig();
  const { client, db } = await connectMongo(config.mongodbUri, config.mongodbDbName);
  const collections = getCollections(db);
  await ensureIndexes(collections);
  logger.info("mongodb connected", { database: config.mongodbDbName });

  const mailer = createResendMailer(config);
  if (!mailer.configured) {
    logger.warn("RESEND_API_KEY / RESEND_FROM_EMAIL not set: password-reset emails are disabled");
  }

  const app = createApp({
    collections,
    config,
    mailer,
    healthCheck: async () => {
      await db.command({ ping: 1 });
    },
  });

  const server = app.listen(config.port, () => {
    logger.info("server listening", { port: config.port });
  });

  const shutdown = (signal: string) => {
    logger.info("shutting down", { signal });
    server.close(() => {
      client.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: Error) => {
  logger.error("startup failed", { reason: error.message });
  process.exit(1);
});
