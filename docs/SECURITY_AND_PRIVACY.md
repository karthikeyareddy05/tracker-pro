# Security, privacy and data storage

## Where data lives

| Data | Location | Notes |
| --- | --- | --- |
| Name, email | MongoDB `users` | Email normalized; unique index |
| Password | MongoDB `users.passwordHash` | Argon2id (m=19 MiB, t=2, p=1). Plaintext is never stored or logged |
| Sessions | MongoDB `sessions` | Only SHA-256 hashes of tokens |
| Password-reset requests | MongoDB `password_reset_tokens` | Only token hashes; 30-minute expiry; single use |
| Security log | MongoDB `security_events` | Event type, user id and time only; deleted after 90 days |
| Rate-limit counters | MongoDB `rate_limits` | Keyed by IP or SHA-256 of the email; auto-expire |
| Cycle setup, period starts, mood, symptoms, energy, sleep, hydration, notes, checklist, preferences | **On the phone only**: SQLite (`trackerproSQLite.db`) in the app's private storage | Never sent to the server; available offline |
| Refresh token + cached name/email | Android Keystore-backed secure storage | Access token is kept in memory only |
| Theme choice | WebView localStorage | Not sensitive |

**Encryption.** The on-device SQLite database is **not encrypted by the app**. It is protected by Android's app sandbox (other apps can't read it) and by the phone's own full-disk/file-based encryption, which is on by default on modern Android when a screen lock is set. The app shows this honestly in Profile → Privacy & storage. Adding SQLCipher encryption is possible: `@capacitor-community/sqlite` supports it. It needs on-device testing and was left off rather than shipped unverified.

**Backups.** The Android build sets `android:allowBackup="false"`, so health records aren't copied into Google cloud backups. As a result, they're lost if the app is uninstalled or the phone is lost. Profile explains this.

**Multiple accounts on one phone.** Every local row carries the user id from the authenticated session. All queries filter by it, and the React Query cache is cleared whenever the signed-in user changes or signs out.

## Authentication flow

1. **Register / login** → the server returns `{ user, tokens }`. The app keeps the access token (15 min) in memory and stores the refresh token (30 days) in secure storage.
2. **App launch** → if a refresh token exists, call `/auth/refresh`:
   - Success: new tokens, signed in.
   - `401`: stored tokens are cleared and the login screen shows "session expired".
   - Network error or server unavailable: the last signed-in user is let in **offline** to their on-device records. A banner offers "Retry", and the app reconnects automatically when the network returns.
3. **API calls** refresh the access token when it's about to expire, and retry once after a `401`. Concurrent refreshes are merged into one request.
4. **Rotation and reuse detection.** Each refresh replaces the refresh token. If an old refresh token is presented again, the server revokes that whole session, because it may have been copied.
5. **Logout** revokes the session on the server, clears secure storage and all cached queries, and keeps on-device health records. Deleting those is a separate, explicit action.
6. **Password reset**:
   1. The server generates a 256-bit random token, stores only its SHA-256 and deletes older unused tokens.
   2. It emails `APP_BASE_URL/reset-password#token=…` through Resend.
   3. On completion it atomically marks the token used, sets the new Argon2id hash, revokes **all** sessions and clears the lockout.
   4. If the email can't be sent, the token is deleted immediately.
   5. The API response never reveals whether an account exists.

No cookies are used, so cross-site request forgery doesn't apply. CORS only allows the Capacitor app origins, local dev and `APP_BASE_URL`, without credentials.

## Server hardening

- Input validation with zod (`.strict()` objects, so `{"$ne": …}` injection attempts are rejected as non-strings).
- Helmet security headers and a CSP for the served web pages. HSTS and `upgrade-insecure-requests` apply in production.
- Error handler never returns stack traces.
- Request logs contain method, path, status and duration only: no bodies, query strings, tokens, emails or IPs.
- Production refuses to start without `MONGODB_URI` or with a non-https `APP_BASE_URL`.
- No default or admin accounts, and no secrets in the repository or APK. The APK contains only the public server URL.

**Least privilege for MongoDB.** Create an Atlas database user with the built-in role `readWrite` on database `tracker_pro` only. Don't use an Atlas admin user.

## MongoDB collections and indexes

Created automatically at startup (`ensureIndexes`), or manually with `npm run build && npm run db:indexes`.

| Collection | Indexes |
| --- | --- |
| `users` | `email` unique |
| `sessions` | `accessTokenHash` unique; `refreshTokenHash` unique; `previousRefreshTokenHash`; `userId`; TTL on `refreshExpiresAt` |
| `password_reset_tokens` | `tokenHash` unique; `userId`; TTL on `expiresAt` + 1 day |
| `security_events` | TTL on `createdAt` (90 days); `{ userId, createdAt }` |
| `rate_limits` | TTL on `expiresAt` |

## Account deletion

Profile → **Delete my account** (password required) removes, on the server:

- the user record
- all sessions
- reset tokens
- that user's security events

An anonymous `account_deleted` event with no identifiers is kept. An option, on by default, also deletes the on-device health records. Profile → **Delete health data on this phone** removes only local records and leaves the account intact.

## Medical safety

Predictions are labelled as estimates throughout. The app makes no diagnosis, fertility, contraception or pregnancy claims, and insights are phrased as observations about the user's own entries, shown only once there's enough data.
