import { ApiClient, ApiError, type AuthResult, type PublicUser } from "./api";

/**
 * TEST BUILD ONLY (VITE_TEST_ACCOUNTS=1).
 *
 * Signs in against a fixed list of test accounts on the phone itself, so the app
 * can be tried before the server is deployed. Nothing is sent over the network.
 * Only salted SHA-256 hashes of the test passwords are bundled. The normal build
 * never includes this path and always uses the real server.
 */
interface TestAccount {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
}

const TEST_ACCOUNTS: TestAccount[] = [
  {
    id: "test-user-1",
    email: "testmail1@gmail.com",
    displayName: "Reema",
    passwordHash: "ccb4c937f0a73663789339f5c946ce3350a1487ab1b727a16019fda4c1fe8375",
  },
  {
    id: "test-user-2",
    email: "testmailid2@gmail.com",
    displayName: "Greeshma",
    passwordHash: "ff6b3dbfe6288ce93307c4344b6bdcdabea32fb958e584658c26e768203a58e7",
  },
];

export const TEST_ACCOUNT_EMAILS = TEST_ACCOUNTS.map((a) => a.email);

const NAME_KEY = "tp.test.names";
const SESSIONS_KEY = "tp.test.sessions";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* best effort */
  }
}

const normalize = (email: string) => email.replace(/\s+/g, "").toLowerCase();

function toUser(a: TestAccount): PublicUser {
  const names = readJson<Record<string, string>>(NAME_KEY, {});
  return { id: a.id, email: a.email, displayName: names[a.id] ?? a.displayName, createdAt: "2026-10-14T00:00:00.000Z" };
}

const notInTestBuild = (what: string) =>
  new ApiError(400, "TEST_BUILD", `${what} isn't available in the test build. It works once the app is connected to the server.`);

export class TestAccountsApiClient extends ApiClient {
  constructor() {
    super({ baseUrl: "test://local" });
  }

  private session(account: TestAccount): AuthResult {
    // refresh token -> account id; access token -> account id
    const sessions = readJson<Record<string, string>>(SESSIONS_KEY, {});
    const accessToken = `acc_${randomToken()}`;
    const refreshToken = `ref_${randomToken()}`;
    sessions[accessToken] = account.id;
    sessions[refreshToken] = account.id;
    writeJson(SESSIONS_KEY, sessions);
    return {
      user: toUser(account),
      tokens: {
        accessToken,
        accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        refreshToken,
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
    };
  }

  private accountForToken(token: string | null): TestAccount {
    const id = token ? readJson<Record<string, string>>(SESSIONS_KEY, {})[token] : undefined;
    const account = TEST_ACCOUNTS.find((a) => a.id === id);
    if (!account) throw new ApiError(401, "UNAUTHENTICATED", "Your session has expired. Please sign in again.");
    return account;
  }

  private revoke(...tokens: (string | null)[]) {
    const sessions = readJson<Record<string, string>>(SESSIONS_KEY, {});
    for (const t of tokens) if (t) delete sessions[t];
    writeJson(SESSIONS_KEY, sessions);
  }

  override async login(body: { email: string; password: string }): Promise<AuthResult> {
    const email = normalize(body.email);
    const account = TEST_ACCOUNTS.find((a) => a.email === email);
    const hash = await sha256Hex(`tracker-pro-test:${email}:${body.password}`);
    if (!account || hash !== account.passwordHash) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
    }
    return this.session(account);
  }

  override async register(): Promise<AuthResult> {
    throw notInTestBuild("Creating new accounts");
  }

  override async refresh(refreshToken: string): Promise<AuthResult> {
    const account = this.accountForToken(refreshToken);
    this.revoke(refreshToken); // rotate, like the real server
    return this.session(account);
  }

  override async logout(accessToken: string | null, refreshToken: string | null): Promise<{ ok: true }> {
    this.revoke(accessToken, refreshToken);
    return { ok: true };
  }

  override async requestPasswordReset(): Promise<{ ok: true; message: string }> {
    throw notInTestBuild("Password reset by email");
  }

  override async completePasswordReset(): Promise<{ ok: true; message: string }> {
    throw notInTestBuild("Password reset by email");
  }

  override async getProfile(accessToken: string): Promise<{ user: PublicUser }> {
    return { user: toUser(this.accountForToken(accessToken)) };
  }

  override async updateProfile(accessToken: string, displayName: string): Promise<{ user: PublicUser }> {
    const account = this.accountForToken(accessToken);
    const names = readJson<Record<string, string>>(NAME_KEY, {});
    names[account.id] = displayName.trim();
    writeJson(NAME_KEY, names);
    return { user: toUser(account) };
  }

  override async deleteAccount(): Promise<{ ok: true }> {
    throw notInTestBuild("Deleting an account");
  }
}
