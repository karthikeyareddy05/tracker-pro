import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

export const MAIL_FILE = path.resolve(import.meta.dirname, "e2e-mail.jsonl");

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8787",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "phone-light", use: { ...devices["Pixel 7"], colorScheme: "light" } },
  ],
  webServer: {
    command: "npx tsx test-e2e/serve.ts",
    cwd: path.resolve(import.meta.dirname, "../server"),
    url: "http://localhost:8787/_api/health",
    timeout: 120_000,
    reuseExistingServer: false,
    env: { E2E_MAIL_FILE: MAIL_FILE, PORT: "8787", LOG_SILENT: "1" },
  },
});
