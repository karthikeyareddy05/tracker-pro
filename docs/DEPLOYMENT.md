# Deployment: MongoDB Atlas, Resend, Render

The phone app talks to one HTTPS server. Setting it up takes about 20 minutes on free tiers.

## 1. MongoDB Atlas (free M0 cluster)

1. Create an account at <https://www.mongodb.com/cloud/atlas> and a free **M0** cluster (choose a region near you, e.g. Mumbai).
2. **Database Access → Add New Database User**:
   - Choose password authentication and generate a strong password.
   - Under *Built-in Role* choose **Specific privileges → `readWrite` on database `tracker_pro`**.
3. **Network Access → Add IP Address**: add `0.0.0.0/0`. Render's free tier has no fixed outbound IPs; access is still protected by the database user's password.
4. **Connect → Drivers** gives you a connection string. This is your `MONGODB_URI`:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority`

Collections and indexes are created automatically when the server starts.

## 2. Resend (password-reset email)

1. Sign up at <https://resend.com> and create an **API key** with *Sending access*. This is your `RESEND_API_KEY`.
2. **Domains → Add Domain**, then add the DNS records Resend shows at your domain registrar until the domain is *Verified*. Set `RESEND_FROM_EMAIL` to an address on that domain, e.g. `Tracker Pro <no-reply@yourdomain.com>`.
3. **No domain yet?** For testing only, use `RESEND_FROM_EMAIL=onboarding@resend.dev`. Resend then only delivers to the email address of your own Resend account. Other users won't receive reset emails until a domain is verified.

The free tier allows a limited number of emails per day and month (see Resend's pricing page). That's plenty for password resets.

## 3. Render (hosting the API)

1. Sign in to <https://render.com> with GitHub. Choose **New → Blueprint** and pick this repository. It reads `render.yaml`.
2. When prompted, enter:
   - `MONGODB_URI` from step 1
   - `RESEND_API_KEY` and `RESEND_FROM_EMAIL` from step 2
   - `APP_BASE_URL`: the service's URL, e.g. `https://tracker-pro.onrender.com`. You can fill it in after the first deploy shows the URL, then redeploy.
3. After the deploy, open `https://<your-service>.onrender.com/_api/health`. You should see `"database":"reachable"` and `"email":"configured"`.

On Render's free plan the server sleeps after about 15 minutes idle. The first request afterwards can take around a minute, so the app may show its loading screen briefly.

## 4. Point the Android app at your server

1. In GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**.
2. Name it `API_BASE_URL` with the value `https://<your-service>.onrender.com` (no trailing slash).
3. **Actions → CI → Run workflow** (or push any commit). The new APK in **Releases → android-latest** will sign in against your server.

The URL isn't secret: anyone with the APK can see it. Keep all real secrets on Render only.
