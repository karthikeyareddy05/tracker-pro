# Tracker Pro

A private, mobile-first menstrual-cycle and wellness tracker for Android.

- **Accounts** with secure registration, sign-in, sessions and email password reset, backed by a Node.js + MongoDB API.
- **Health records stay on the phone.** Cycle setup, period starts, mood, symptoms, energy, sleep, hydration, notes and the daily checklist live in an on-device SQLite database and work offline. They are never sent to the server.
- Five primary screens: **Home, Calendar, Track, Insights, Profile**, plus onboarding, light/dark themes, and privacy and deletion controls.

Tracker Pro is a personal tracking app, **not a medical device**. Cycle dates are arithmetic estimates from the user's own entries.

## Repository layout

| Path | What it is |
| --- | --- |
| `app/` | React 18 + TypeScript + React Router + React Query, packaged for Android with Capacitor 7 |
| `server/` | Node.js + TypeScript + Express API, MongoDB, Argon2id, Resend |
| `e2e/` | Playwright journey test: real API and in-memory MongoDB, web app at phone size |
| `scripts/` | Android build, emulator smoke test, CI helpers |
| `docs/` | API, security and privacy, deployment, Android, troubleshooting |
| `.github/workflows/ci.yml` | Typecheck, tests, end-to-end, APK build, emulator smoke test, APK release |

## Quick start (local development)

Prerequisites: Node.js 20+ (22 recommended). For Android builds you also need JDK 21 and the Android SDK.

```bash
# 1. API
cd server
cp .env.example .env        # fill in MONGODB_URI (and RESEND_* for reset emails)
npm install
npm run dev                 # http://localhost:8787  (reads env from your shell; e.g. `set -a; . ./.env; set +a`)

# 2. App (in another terminal)
cd app
npm install
npm run dev                 # http://localhost:5173 — proxies /_api to :8787
```

In a desktop browser the app stores health records with a development fallback (SQLite compiled to WebAssembly, kept in the browser's localStorage, unencrypted). That is **not** the same as the Android app's native on-device database.

## Tests

```bash
cd server && npm run typecheck && npm test   # auth, sessions, lockout, rate limits, reset tokens (in-memory MongoDB)
cd app && npm run typecheck && npm test      # storage (real SQLite via sql.js), cycle maths, UI flows
cd e2e && npm install && npx playwright install chromium && npx playwright test   # full journey (needs server + app deps and `npm run build` in app/)
```

CI runs all of these on every push, then builds the APK and launches it on an Android emulator.

## Getting the APK

Every push to `main` builds a debug APK:

- **GitHub → Releases → `android-latest`**: download `TrackerPro-1.0.<run>-debug.apk` on your phone and open it (allow installing from this source when Android asks).
- Or **Actions → latest run → Artifacts → `tracker-pro-apk`**.

**Test build (no server needed).** The release also contains `TrackerPro-1.0.<run>-TEST-ACCOUNTS.apk`. It signs in only with two built-in test accounts, entirely on the phone, so the app can be tried before the server is deployed:

| Name | Email | Password |
| --- | --- | --- |
| Reema | testmail1@gmail.com | 1234567890 |
| Greeshma | testmailid2@gmail.com | 112233445566 |

Registration, password reset and account deletion need the real server and are disabled in this build. Don't use the test build for real data you want to keep in sync with an account.

To build locally instead: `VITE_API_BASE_URL=https://your-server.example bash scripts/build-android.sh` (see [docs/ANDROID.md](docs/ANDROID.md)).

## Configuration you must provide

| Setting | Where | Why |
| --- | --- | --- |
| `MONGODB_URI` | Server host secrets (e.g. Render) | Accounts, sessions, reset tokens |
| `APP_BASE_URL` | Server host | Builds password-reset links |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Server host secrets | Sends password-reset emails |
| `API_BASE_URL` | GitHub → Settings → Secrets and variables → Actions → **Variables** | Compiled into the APK so the phone can reach your server |

Step-by-step setup is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Without `API_BASE_URL` the APK still installs and opens, but it can't sign in. The login screen says so.

## Documentation

- [API reference](docs/API.md)
- [Security, privacy and data storage](docs/SECURITY_AND_PRIVACY.md): auth flow, sessions, MongoDB collections and indexes, what's stored where
- [Deployment: MongoDB Atlas, Resend, Render](docs/DEPLOYMENT.md)
- [Android build and release signing](docs/ANDROID.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
