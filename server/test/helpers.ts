import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/config.js";
import { ensureIndexes, getCollections, type Collections } from "../src/db.js";
import type { Mailer, PasswordResetEmail } from "../src/mailer.js";

process.env.ARGON2_TEST_FAST = "1";
process.env.LOG_SILENT = "1";

export class FakeMailer implements Mailer {
  configured = true;
  fail = false;
  sent: PasswordResetEmail[] = [];
  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    if (this.fail) throw new Error("simulated provider failure");
    this.sent.push(message);
  }
  lastToken(): string {
    const last = this.sent.at(-1);
    if (!last) throw new Error("no email sent");
    const token = new URL(last.resetUrl).hash.replace(/^#token=/, "");
    return decodeURIComponent(token);
  }
}

export class Clock {
  constructor(public current = new Date("2026-03-01T10:00:00.000Z")) {}
  now = () => new Date(this.current);
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export interface Harness {
  mongod: MongoMemoryServer;
  client: MongoClient;
  db: Db;
  c: Collections;
  config: AppConfig;
  mailer: FakeMailer;
  clock: Clock;
  app: ReturnType<typeof createApp>;
  reset(): Promise<void>;
  stop(): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const mongod = await MongoMemoryServer.create();
  const client = new MongoClient(mongod.getUri());
  await client.connect();
  const db = client.db("tracker_pro_test");
  const c = getCollections(db);
  await ensureIndexes(c);
  const config = loadConfig({
    MONGODB_URI: mongod.getUri(),
    APP_BASE_URL: "https://tracker.example.test",
    NODE_ENV: "test",
  });
  const mailer = new FakeMailer();
  const clock = new Clock();
  const app = createApp({ collections: c, config, mailer, now: clock.now });
  return {
    mongod,
    client,
    db,
    c,
    config,
    mailer,
    clock,
    app,
    async reset() {
      await Promise.all([
        c.users.deleteMany({}),
        c.sessions.deleteMany({}),
        c.passwordResetTokens.deleteMany({}),
        c.securityEvents.deleteMany({}),
        c.rateLimits.deleteMany({}),
      ]);
      mailer.sent = [];
      mailer.fail = false;
      mailer.configured = true;
      clock.current = new Date("2026-03-01T10:00:00.000Z");
    },
    async stop() {
      await client.close();
      await mongod.stop();
    },
  };
}

export const VALID_PASSWORD = "Lavender42!";
