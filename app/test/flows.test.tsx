import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { today } from "../src/lib/dates";
import { HealthStore } from "../src/storage/healthStore";
import type { SqlDriver } from "../src/storage/driver";
import { failingDriver, FakeServer, memoryDriver, MemoryTokenStore, renderApp } from "./helpers";

let server: FakeServer;
let tokenStore: MemoryTokenStore;
let driver: SqlDriver;

beforeEach(async () => {
  server = new FakeServer();
  tokenStore = new MemoryTokenStore();
  driver = await memoryDriver();
});

const TODAY = today();

/** Sets up a user who signed in previously, optionally with a saved cycle profile. */
async function returningUser({ withProfile = true, name = "Asha Rao", email = "asha@example.com" } = {}) {
  const user = server.addUser(email, "Lavender42", name);
  tokenStore.refreshToken = server.issueRefresh(user);
  tokenStore.user = { id: user.id, email: user.email, displayName: user.displayName };
  if (withProfile) {
    const store = await HealthStore.open(driver);
    await store.saveCycleProfile(user.id, { cycleLength: 28, periodLength: 5, lastPeriodStart: TODAY }, TODAY);
  }
  return user;
}

const homeHeading = (name = "Asha") => screen.findByRole("heading", { level: 1, name: new RegExp(`, ${name}$`) });

describe("authentication screens", () => {
  it("shows a working forgot-password link and no fake or preview sign-in", async () => {
    renderApp({ path: "/login", server, tokenStore, driver });
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByText(/preview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/continue as/i)).not.toBeInTheDocument();
  });

  it("validates the login form and shows server errors", async () => {
    const user = userEvent.setup();
    server.addUser("asha@example.com", "Lavender42", "Asha");
    renderApp({ path: "/login", server, tokenStore, driver });
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(server.calls).toEqual([]);

    await user.type(screen.getByLabelText("Email"), "asha@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
    expect(tokenStore.refreshToken).toBeNull();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    renderApp({ path: "/login", server, tokenStore, driver });
    const input = await screen.findByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
  });
});

describe("registration and onboarding", () => {
  it("goes from registration to onboarding to Home without redirecting back to setup", async () => {
    const user = userEvent.setup();
    renderApp({ path: "/register", server, tokenStore, driver });

    await user.type(await screen.findByLabelText("Full name"), "Asha Rao");
    await user.type(screen.getByLabelText("Email"), "Asha@Example.com");
    await user.type(screen.getByLabelText("Password"), "Lavender42");
    await user.type(screen.getByLabelText("Confirm password"), "Lavender42");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Welcome, Asha" })).toBeInTheDocument();
    expect(tokenStore.refreshToken).not.toBeNull();

    const cycle = screen.getByLabelText("Typical cycle length");
    await user.clear(cycle);
    await user.type(cycle, "31");
    fireEvent.change(screen.getByLabelText("First day of your most recent period"), { target: { value: TODAY } });
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(await homeHeading()).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Welcome, Asha" })).not.toBeInTheDocument();
    expect(await screen.findByText("Estimated period day 1")).toBeInTheDocument();

    const store = await HealthStore.open(driver);
    const saved = await store.getCycleProfile(tokenStore.user!.id);
    expect(saved).toMatchObject({ cycleLength: 31, periodLength: 5, lastPeriodStart: TODAY });
  });

  it("enforces the 15–90 day cycle length and 1–15 day period length", async () => {
    const user = userEvent.setup();
    await returningUser({ withProfile: false });
    renderApp({ path: "/setup", server, tokenStore, driver });
    const cycle = await screen.findByLabelText("Typical cycle length");
    await user.click(screen.getByRole("checkbox"));

    await user.clear(cycle);
    await user.type(cycle, "14");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Enter a cycle length between 15 and 90 days.")).toBeInTheDocument();

    await user.clear(cycle);
    await user.type(cycle, "91");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Enter a cycle length between 15 and 90 days.")).toBeInTheDocument();

    const period = screen.getByLabelText("Typical period length");
    await user.clear(cycle);
    await user.type(cycle, "90");
    await user.clear(period);
    await user.type(period, "16");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Enter a period length between 1 and 15 days.")).toBeInTheDocument();

    await user.clear(period);
    await user.type(period, "15");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await homeHeading()).toBeInTheDocument();
    // No last-period date: wellness tracking works without fabricated estimates.
    expect(screen.getByText("Add a period date to see estimates")).toBeInTheDocument();
  });

  it("sends signed-in users without a cycle profile to setup", async () => {
    await returningUser({ withProfile: false });
    renderApp({ path: "/", server, tokenStore, driver });
    expect(await screen.findByRole("heading", { name: "Welcome, Asha" })).toBeInTheDocument();
  });
});

describe("returning users and sessions", () => {
  it("restores a saved session and opens Home", async () => {
    await returningUser();
    renderApp({ path: "/", server, tokenStore, driver });
    expect(await homeHeading()).toBeInTheDocument();
    expect(server.calls).toContain("/auth/refresh");
  });

  it("sends users with an expired session to login", async () => {
    await returningUser();
    tokenStore.refreshToken = "revoked-token";
    renderApp({ path: "/", server, tokenStore, driver });
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByText("Your session has expired. Please sign in again.")).toBeInTheDocument();
    expect(tokenStore.user).toBeNull();
  });

  it("logs out to the login screen and revokes the session", async () => {
    const user = userEvent.setup();
    await returningUser();
    renderApp({ path: "/profile", server, tokenStore, driver });
    await user.click(await screen.findByRole("button", { name: /Sign out/ }));
    const dialog = await screen.findByRole("dialog", { name: "Sign out?" });
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(server.calls).toContain("/auth/logout");
    expect(tokenStore.refreshToken).toBeNull();
    expect(server.refresh.size).toBe(0);
    // Health records are kept on the device after sign-out.
    const store = await HealthStore.open(driver);
    expect(await store.getCycleProfile("user-1")).not.toBeNull();
  });

  it("keeps each account's records separate on a shared phone", async () => {
    const user = userEvent.setup();
    const first = await returningUser();
    const store = await HealthStore.open(driver);
    await store.saveDay(first.id, TODAY, { mood: "great", notes: "Asha's private note" }, TODAY);

    tokenStore.refreshToken = null;
    tokenStore.user = null;
    server.addUser("bea@example.com", "Hibiscus77", "Bea");
    renderApp({ path: "/login", server, tokenStore, driver });
    await user.type(await screen.findByLabelText("Email"), "bea@example.com");
    await user.type(screen.getByLabelText("Password"), "Hibiscus77");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    // Bea has no profile of her own, so she is sent to onboarding — not shown Asha's.
    expect(await screen.findByRole("heading", { name: "Welcome, Bea" })).toBeInTheDocument();
    expect(screen.queryByText(/Asha/)).not.toBeInTheDocument();
  });
});

describe("navigation", () => {
  it("moves between all five primary screens", async () => {
    const user = userEvent.setup();
    await returningUser();
    renderApp({ path: "/", server, tokenStore, driver });
    await homeHeading();
    const nav = screen.getByRole("navigation", { name: "Primary" });

    await user.click(within(nav).getByRole("link", { name: "Calendar" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Your cycle" })).toBeInTheDocument();
    await user.click(within(nav).getByRole("link", { name: "Track" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
    await user.click(within(nav).getByRole("link", { name: "Insights" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Your patterns" })).toBeInTheDocument();
    await user.click(within(nav).getByRole("link", { name: "Profile" }));
    expect(await screen.findByRole("heading", { level: 1, name: "You & your data" })).toBeInTheDocument();
    await user.click(within(nav).getByRole("link", { name: "Home" }));
    expect(await homeHeading()).toBeInTheDocument();
  });
});

describe("tracking", () => {
  it("saves a mood and symptoms to the device and shows confirmation only after the write", async () => {
    const user = userEvent.setup();
    const account = await returningUser();
    renderApp({ path: "/track", server, tokenStore, driver });
    const mood = await screen.findByRole("region", { name: "Mood" });
    await user.click(within(mood).getByRole("button", { name: "Great" }));
    expect(await within(mood).findByText("Saved on this phone")).toBeInTheDocument();

    const symptoms = screen.getByRole("region", { name: "Symptoms" });
    await user.click(within(symptoms).getByRole("button", { name: "Cramps" }));
    await within(symptoms).findByText("Saved on this phone");
    await user.click(within(symptoms).getByRole("button", { name: "Severe" }));

    const store = await HealthStore.open(driver);
    await waitFor(async () => {
      expect(await store.getDay(account.id, TODAY)).toMatchObject({
        mood: "great",
        symptoms: [{ name: "cramps", severity: 3 }],
      });
    });
  });

  it("shows an error and does not pretend to save when storage fails", async () => {
    const user = userEvent.setup();
    const { driver: flaky, control } = failingDriver(driver);
    await returningUser();
    renderApp({ path: "/track", server, tokenStore, driver: flaky });
    const mood = await screen.findByRole("region", { name: "Mood" });
    control.failWrites = true;
    await user.click(within(mood).getByRole("button", { name: "Low" }));
    expect(await within(mood).findByText(/Your change was not saved/)).toBeInTheDocument();
    expect(within(mood).getByRole("button", { name: "Low" })).toHaveAttribute("aria-pressed", "false");
    expect(within(mood).queryByText("Saved on this phone")).not.toBeInTheDocument();
  });

  it("refuses to continue when on-device storage can't be opened", async () => {
    await returningUser({ withProfile: false });
    renderApp({
      path: "/",
      server,
      tokenStore,
      driver,
      openStore: () => Promise.reject(new Error("SQLite failed to initialise.")),
    });
    expect(await screen.findByRole("heading", { name: "Storage unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("offline access", () => {
  it("opens previously saved records and records new ones without a connection", async () => {
    const user = userEvent.setup();
    const account = await returningUser();
    const store = await HealthStore.open(driver);
    await store.saveDay(account.id, TODAY, { mood: "good" }, TODAY);
    server.offline = true;

    renderApp({ path: "/", server, tokenStore, driver });
    expect(await homeHeading()).toBeInTheDocument();
    expect(screen.getByText("Offline — your on-device records still work.")).toBeInTheDocument();
    const moodCard = screen.getByRole("region", { name: "How are you feeling?" });
    expect(within(moodCard).getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(moodCard).getByRole("button", { name: "Great" }));
    expect(await within(moodCard).findByText("Saved on this phone")).toBeInTheDocument();
    expect((await store.getDay(account.id, TODAY))?.mood).toBe("great");
  });
});

describe("password reset", () => {
  it("requests a reset link and completes the reset with the emailed token", async () => {
    const user = userEvent.setup();
    server.addUser("asha@example.com", "Lavender42", "Asha");
    const first = renderApp({ path: "/forgot-password", server, tokenStore, driver });
    await user.type(await screen.findByLabelText("Email"), "asha@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(
      await screen.findByText("If an account exists for this email, you will receive password-reset instructions."),
    ).toBeInTheDocument();
    const [token] = [...server.resetTokens.keys()];
    expect(token).toBeDefined();
    first.unmount();

    renderApp({ path: `/reset-password#token=${token}`, server, tokenStore, driver });
    await user.type(await screen.findByLabelText("New password"), "Peony2026x");
    await user.type(screen.getByLabelText("Confirm new password"), "Peony2026x");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText(/Your password has been updated/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toBeInTheDocument();
    expect(server.users.get("asha@example.com")?.password).toBe("Peony2026x");
  });

  it("explains when the reset link is missing", async () => {
    renderApp({ path: "/reset-password", server, tokenStore, driver });
    expect(await screen.findByRole("heading", { name: "Reset link needed" })).toBeInTheDocument();
  });

  it("shows the server's message for an invalid or used token", async () => {
    const user = userEvent.setup();
    renderApp({ path: "/reset-password#token=not-a-real-token", server, tokenStore, driver });
    await user.type(await screen.findByLabelText("New password"), "Peony2026x");
    await user.type(screen.getByLabelText("Confirm new password"), "Peony2026x");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
  });
});
