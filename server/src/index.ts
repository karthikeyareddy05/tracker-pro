import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { connectMongo, ensureIndexes, getCollections } from "./db.js";
import { logger } from "./logger.js";
import { redact } from "./redact.js";
import { checkResendConfig, type EmailCheckResult } from "./emailCheck.js";
import { createResendMailer } from "./mailer.js";

async function main() {
  const config = loadConfig();
  const { client, db } = await connectMongo(config.mongodbUri, config.mongodbDbName);
  const collections = getCollections(db);
  await ensureIndexes(collections);
  logger.info("mongodb connected", { database: config.mongodbDbName });

  logger.info("mongodb indexes ensured");

  const mailer = createResendMailer(config);
  const missing = ["RESEND_API_KEY", "RESEND_FROM_EMAIL"].filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    logger.warn("password-reset emails are disabled", { missing });
  }
  // Check the Resend key without sending mail; logs statuses only, never the key.
  let emailStatus: EmailCheckResult | null = null;
  const runEmailCheck = async () => {
    emailStatus = await checkResendConfig(config.resendApiKey, config.resendFromEmail);
    const log = emailStatus.key === "invalid" ? logger.error : emailStatus.key === "valid" ? logger.info : logger.warn;
    log("resend check", { key: emailStatus.key, keyAccess: emailStatus.keyAccess, sender: emailStatus.sender, detail: emailStatus.detail });
  };
  await runEmailCheck();
  // Re-check periodically so a rotated or revoked key shows up in /_api/health.
  setInterval(() => void runEmailCheck().catch(() => undefined), 6 * 60 * 60 * 1000).unref();

  const app = createApp({
    collections,
    config,
    mailer,
    healthCheck: async () => {
      await db.command({ ping: 1 });
    },
    emailStatus: () => emailStatus,
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
  logger.error("startup failed", { reason: redact(error.message) });
  process.exit(1);
});
