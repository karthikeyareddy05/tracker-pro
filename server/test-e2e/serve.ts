/**
 * End-to-end test server: the real API (all security logic) against an
 * in-memory MongoDB, serving the built web app. Password-reset emails are
 * written to a local file instead of being sent.
 */
import { appendFileSync } from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { ensureIndexes, getCollections } from "../src/db.js";
import type { Mailer } from "../src/mailer.js";

const port = process.env.PORT ?? "8787";
const mailFile = process.env.E2E_MAIL_FILE ?? path.resolve("e2e-mail.jsonl");

const mongod = await MongoMemoryServer.create();
const client = new MongoClient(mongod.getUri());
await client.connect();
const collections = getCollections(client.db("tracker_pro_e2e"));
await ensureIndexes(collections);

const config = loadConfig({
  MONGODB_URI: mongod.getUri(),
  APP_BASE_URL: `http://localhost:${port}`,
  WEB_DIST_DIR: process.env.WEB_DIST_DIR ?? path.resolve("../app/dist"),
  PORT: port,
  NODE_ENV: "test",
});

const mailer: Mailer = {
  configured: true,
  async sendPasswordReset(message) {
    appendFileSync(mailFile, `${JSON.stringify({ to: message.to, resetUrl: message.resetUrl })}\n`);
  },
};

createApp({ collections, config, mailer, healthCheck: async () => void (await client.db("admin").command({ ping: 1 })) }).listen(
  Number(port),
  () => console.log(`e2e server listening on ${port}`),
);
