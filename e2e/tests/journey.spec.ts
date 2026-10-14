import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { MAIL_FILE } from "../playwright.config";

const SHOTS = path.resolve(import.meta.dirname, "../screens");
const EMAIL = `asha.${Date.now()}@example.com`;
const PASSWORD = "Lavender42!";
const NEW_PASSWORD = "Peony2026!x";

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(350); // let entrance animations settle
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

function lastResetUrl(): string {
  const lines = readFileSync(MAIL_FILE, "utf8").trim().split("\n");
  return JSON.parse(lines.at(-1)!).resetUrl as string;
}

test.beforeAll(() => {
  if (existsSync(MAIL_FILE)) rmSync(MAIL_FILE);
});

test("full journey against the real API", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // Login screen
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  await shot(page, "01-login");

  // Registration
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Asha Rao");
  await page.getByLabel("Email", { exact: true }).fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await shot(page, "02-register");
  await page.getByRole("button", { name: "Create account" }).click();

  // Onboarding
  await expect(page.getByRole("heading", { name: "Welcome, Asha" })).toBeVisible();
  const start = new Date(Date.now() - 9 * 86_400_000);
  const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  await page.getByLabel("First day of your most recent period").fill(iso);
  await shot(page, "03-setup");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Home
  await expect(page.getByRole("heading", { level: 1, name: /, Asha$/ })).toBeVisible();
  await expect(page.getByText("Period in about 19 days")).toBeVisible();
  await page.getByRole("region", { name: "How are you feeling?" }).getByRole("button", { name: "Good" }).click();
  await expect(page.getByRole("region", { name: "How are you feeling?" }).getByText("Saved on this phone")).toBeVisible();
  await shot(page, "04-home");

  // Track
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Track" }).click();
  const symptoms = page.getByRole("region", { name: "Symptoms" });
  await symptoms.getByRole("button", { name: "Cramps" }).click();
  await expect(symptoms.getByText("Saved on this phone")).toBeVisible();
  await page.getByRole("region", { name: "Energy" }).getByRole("button", { name: "Good" }).click();
  await page.getByRole("region", { name: "Sleep" }).getByRole("button", { name: "Increase hours slept" }).click();
  await page.getByRole("region", { name: "Hydration" }).getByRole("button", { name: "Increase glasses of water" }).click();
  await expect(page.getByRole("region", { name: "Hydration" }).getByText("Saved on this phone")).toBeVisible();
  await shot(page, "05-track");

  // Persistence across a full reload (new session restore + storage reopen)
  await page.reload();
  await expect(page.getByRole("region", { name: "Symptoms" }).getByRole("button", { name: "Cramps" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Calendar, Insights, Profile
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your cycle" })).toBeVisible();
  await shot(page, "06-calendar");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Insights" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your patterns" })).toBeVisible();
  await shot(page, "07-insights");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "You & your data" })).toBeVisible();
  await shot(page, "08-profile");

  // Dark theme
  await page.getByRole("button", { name: "Dark" }).click();
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await shot(page, "09-home-dark");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Profile" }).click();
  await page.getByRole("button", { name: "Light" }).click();

  // Logout
  await page.getByRole("button", { name: /Sign out/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  // Lockout after 3 wrong passwords
  for (let i = 0; i < 3; i++) {
    await page.getByLabel("Email", { exact: true }).fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill("WrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }
  await page.getByLabel("Email", { exact: true }).fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/Too many failed sign-in attempts/)).toBeVisible();
  await shot(page, "10-lockout");

  // Forgot password → reset (also clears the lockout)
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email", { exact: true }).fill(EMAIL);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account exists for this email/)).toBeVisible();
  await shot(page, "11-forgot");
  const resetUrl = lastResetUrl();
  expect(resetUrl).toContain("/reset-password#token=");
  await page.goto(resetUrl);
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText(/Your password has been updated/)).toBeVisible();
  expect(page.url()).not.toContain("token=");
  await shot(page, "12-reset-done");

  // The link is single-use. Leave the page first: navigating to the same path
  // with only a new #fragment would not reload the app.
  await page.goto("about:blank");
  await page.goto(resetUrl);
  await page.getByLabel("New password", { exact: true }).fill("Another2026!x");
  await page.getByLabel("Confirm new password").fill("Another2026!x");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText(/invalid or has expired/)).toBeVisible();

  // Sign in with the new password; local records are still there.
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /, Asha$/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "How are you feeling?" }).getByRole("button", { name: "Good" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  expect(consoleErrors.filter((e) => !/Failed to load resource: the server responded with a status of 4\d\d/.test(e))).toEqual([]);
});
