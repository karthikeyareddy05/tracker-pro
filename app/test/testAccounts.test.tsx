import { webcrypto } from "node:crypto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, AppRoutes } from "../src/App";
import { ApiError } from "../src/auth/api";
import { TestAccountsApiClient } from "../src/auth/testAccountsApi";
import { HealthStore } from "../src/storage/healthStore";
import { memoryDriver, MemoryTokenStore } from "./helpers";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  }
});

describe("test-accounts build", () => {
  it("signs in both test accounts and rejects wrong passwords", async () => {
    const api = new TestAccountsApiClient();
    const reema = await api.login({ email: "testmail1@gmail.com", password: "1234567890" });
    expect(reema.user).toMatchObject({ email: "testmail1@gmail.com", displayName: "Reema" });
    const greeshma = await api.login({ email: " TestMailId2@gmail.com ", password: "112233445566" });
    expect(greeshma.user).toMatchObject({ email: "testmailid2@gmail.com", displayName: "Greeshma" });
    await expect(api.login({ email: "testmail1@gmail.com", password: "wrong" })).rejects.toBeInstanceOf(ApiError);
    await expect(api.login({ email: "someone@gmail.com", password: "1234567890" })).rejects.toThrow(/Incorrect/);
  });

  it("restores sessions with rotating refresh tokens and supports logout", async () => {
    const api = new TestAccountsApiClient();
    const first = await api.login({ email: "testmail1@gmail.com", password: "1234567890" });
    const second = await api.refresh(first.tokens.refreshToken);
    expect(second.user.displayName).toBe("Reema");
    await expect(api.refresh(first.tokens.refreshToken)).rejects.toThrow(/expired/);
    await api.logout(second.tokens.accessToken, second.tokens.refreshToken);
    await expect(api.refresh(second.tokens.refreshToken)).rejects.toThrow(/expired/);
  });

  it("signs in from the login screen and continues to onboarding", async () => {
    const user = userEvent.setup();
    const driver = await memoryDriver();
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders deps={{ api: new TestAccountsApiClient(), tokenStore: new MemoryTokenStore() }}>
          <AppRoutes openStore={() => HealthStore.open(driver)} />
        </AppProviders>
      </MemoryRouter>,
    );
    await user.type(await screen.findByLabelText("Email"), "testmail1@gmail.com");
    await user.type(screen.getByLabelText("Password"), "1234567890");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Welcome, Reema" })).toBeInTheDocument();
  });
});
