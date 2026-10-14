# Troubleshooting

## Login screen says "This build of Tracker Pro doesn't have a server address configured"

The APK was built without `API_BASE_URL`. Set the repository variable (see [DEPLOYMENT.md](DEPLOYMENT.md#4-point-the-android-app-at-your-server)) and re-run CI, then install the new APK.

## "You're offline or the server can't be reached"

- Open `https://<server>/_api/health` in the phone's browser.
- On Render's free plan, wait up to a minute for the server to wake and try again.
- Check that `API_BASE_URL` uses `https://` and has no trailing slash.

## `/_api/health` shows `"database":"unreachable"`, or the server won't start

- `MONGODB_URI` is wrong, the password contains unescaped special characters (URL-encode them), or Atlas *Network Access* doesn't allow the server.
- Check the server log for `startup failed`. It names the missing setting without printing secrets.

## Reset email never arrives

- `/_api/health` should show `"email":"configured"`. If not, set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
- With the test sender `onboarding@resend.dev`, Resend only delivers to your own Resend account's email. Verify a domain to email anyone.
- In MongoDB, the `security_events` collection records `password_reset_email_failed` when Resend rejects a message. Check the Resend dashboard's *Logs* for the reason.
- At most 3 reset emails per address per hour are sent; extra requests get the same reply but no email.

## "Too many failed sign-in attempts"

After 3 wrong passwords the account is locked for 15 minutes. Wait, or use **Forgot password?**, which clears the lock.

## "Storage unavailable" on launch

The on-device database couldn't be opened, for example because the phone is out of space. Nothing is deleted. Free some space and tap **Try again**. If you installed an older APK over a newer one, install the newer version again.

## Signed out unexpectedly

- Sessions end after 30 days without use, after a password reset (which signs out all devices), or if a refresh token is reused.
- Your health records remain on the phone. Sign in again to see them.

## Android build fails locally

- Use JDK 21 (`java -version`) and set `ANDROID_HOME`.
- Delete `app/android` and re-run `scripts/build-android.sh` to regenerate the platform project.

## Manual device checklist

After installing an APK built with your server URL:

1. Register, finish setup, and land on Home with a cycle estimate.
2. Record mood, symptoms, energy, sleep and hydration on Track. Each section shows "Saved on this phone".
3. Force-close the app and reopen it. You're still signed in and your entries are there.
4. Turn on airplane mode, reopen the app, and record another entry. You'll see the offline banner and the save still works.
5. Sign out, sign in again, and check your entries are still there.
6. Use **Forgot password?**, open the email link, set a new password, and sign in with it.
7. Try the hardware Back button on each tab, the keyboard on forms, and dark mode.
