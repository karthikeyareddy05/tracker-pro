# Tracker Pro API

Base path: `/_api`. JSON in, JSON out. Bodies are limited to 10 KB and unknown fields are rejected.

**Errors** always look like this:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Enter a valid email address." } }
```

Messages are safe to show to users. Stack traces and internals are never returned. `429` responses include a `Retry-After` header.

**Authentication.** Authenticated endpoints need `Authorization: Bearer <accessToken>`. Access tokens last 15 minutes. Exchange the refresh token at `/auth/refresh` for a new pair. Refresh tokens are single-use and rotate on every refresh.

```ts
type User = { id: string; email: string; displayName: string; createdAt: string };
type Tokens = {
  accessToken: string; accessTokenExpiresAt: string;    // ISO 8601
  refreshToken: string; refreshTokenExpiresAt: string;
};
```

## Endpoints

| Method & path | Auth | Body | Success | Notable errors |
| --- | --- | --- | --- | --- |
| `GET /health` | – | – | `200 { status, database, email }` | `503` if MongoDB is unreachable |
| `POST /auth/register_with_password` | – | `{ displayName, email, password }` | `201 { user, tokens }` | `400 VALIDATION_ERROR`, `409 ACCOUNT_EXISTS`, `429 RATE_LIMITED` |
| `POST /auth/login_with_password` | – | `{ email, password }` | `200 { user, tokens }` | `401 INVALID_CREDENTIALS`, `429 ACCOUNT_TEMPORARILY_LOCKED`, `429 RATE_LIMITED` |
| `POST /auth/refresh` | – | `{ refreshToken }` | `200 { user, tokens }` | `401 UNAUTHENTICATED` (expired, revoked or reused token) |
| `GET /auth/session` | Bearer | – | `200 { user }` | `401 UNAUTHENTICATED` |
| `POST /auth/logout` | Bearer (optional) | `{ refreshToken? }` | `200 { ok: true }` (idempotent) | – |
| `POST /auth/request_password_reset` | – | `{ email }` | `200 { ok, message }`: the same response whether or not the account exists | `503 SERVICE_UNAVAILABLE` if email isn't configured, `429` |
| `POST /auth/complete_password_reset` | – | `{ token, newPassword }` | `200 { ok, message }` | `400 RESET_TOKEN_INVALID` (invalid, expired or used), `400 VALIDATION_ERROR` |
| `GET /profile` | Bearer | – | `200 { user }` | `401` |
| `POST /profile` | Bearer | `{ displayName }` | `200 { user }` | `400`, `401` |
| `POST /account/delete` | Bearer | `{ password }` | `200 { ok: true }` | `401 INVALID_PASSWORD`, `429` |

## Rules

- **Email** is trimmed and lower-cased before any lookup or storage.
- **Password policy**: 8–128 characters, at least one letter and one number, not one repeated character, and must not contain the email's local part (4+ characters).
- **Lockout**: 3 failed sign-ins for an email lock it for 15 minutes (`LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_MINUTES`). Unknown emails are locked the same way, so lockouts don't reveal which emails are registered. A successful password reset clears the lock.
- **Rate limits** (per IP unless noted; stored in MongoDB so they hold across instances):

  | Action | Limit |
  | --- | --- |
  | Register | 10 per hour |
  | Login | 30 per 15 minutes |
  | Refresh | 300 per 15 minutes |
  | Reset request | 10 per hour per IP, and 3 emails per hour per address (extra requests get the same reply but send nothing) |
  | Reset completion | 20 per hour |
  | Account deletion | 10 per hour |

- **Reset links** have the form `${APP_BASE_URL}/reset-password#token=…`. The token sits in the URL fragment, so browsers never send it to servers or proxies. The page removes it from the address bar after reading it.

There are deliberately **no endpoints for health records**. They exist only on the device.
