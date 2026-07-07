# Deploying TeamCollab for your team

This guide takes the app from "runs on my laptop" to "a URL my whole team opens every
day". Expect ~15 minutes. No per-user fees ever — you pay only for the small server
(~$5/month total).

---

## Option A — Railway (recommended, easiest)

1. Push this repo to GitHub (already done if you're reading this on GitHub).
2. Go to [railway.app](https://railway.app) → sign in with GitHub.
3. **New Project → Deploy from GitHub repo** → pick this repository (and your main
   branch). Railway detects the `Dockerfile` and builds automatically.
4. **Add a volume** (this keeps your messages/tasks safe across restarts):
   right-click the service → *Attach Volume* → mount path **`/data`**.
5. **Set variables** (service → *Variables*):
   - `JWT_SECRET` → a long random string. Generate one with:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `RESEND_API_KEY` → see [OTP delivery](#otp-codes-in-production) below (recommended).
6. Service → *Settings* → *Networking* → **Generate Domain**. You'll get a URL like
   `https://teamcollab-production.up.railway.app`. That's your team's app.
   (You can attach your own domain later in the same panel.)

## Option B — Render

1. [render.com](https://render.com) → **New → Blueprint** → connect this repo.
   The included `render.yaml` configures everything: Docker build, a 1 GB disk at
   `/data`, and an auto-generated `JWT_SECRET`.
2. Pick the Starter plan (persistent disks aren't available on the free tier — and the
   free tier also sleeps after idle, which would break chat and reminders).
3. Add `RESEND_API_KEY` in the service's Environment tab (recommended).

## Option C — Any VPS (DigitalOcean / Hetzner / Lightsail, ~$4–6/mo)

On a fresh Ubuntu box with Docker installed:

```bash
git clone https://github.com/kevinvarghese333-debug/Messaging-app.git
cd Messaging-app
docker build -t teamcollab .
docker run -d --name teamcollab --restart unless-stopped \
  -p 80:3000 \
  -v teamcollab-data:/data \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  teamcollab
```

Your team opens `http://<server-ip>`. Put Caddy or nginx in front for HTTPS + a domain.

---

## First boot — setting up your org (5 minutes)

1. Open your new URL. Switch to the **Password** tab and **create an account** —
   **the first account automatically becomes the admin**. Use your own details.
2. Go to **⚙️ Admin** → add your departments (Engineering, Marketing, …) and — once
   people exist — set department heads, role levels, and who reports to whom.
   This hierarchy powers `@managers` mentions and overdue-task escalation.
3. Go to **👥 My team** → add each teammate with their **name + mobile number**
   (+ email so OTP codes can reach their inbox — see below).
4. Send them the URL. They tap **Login with OTP**, enter their phone number or
   email, type the 6-digit code they receive, and they're in.

## OTP codes in production

On your laptop, login codes print to the terminal. On a server, nobody sees that
terminal — so configure a real delivery channel:

**Email codes — free, 2 minutes (recommended):**
1. Create a free account at [resend.com](https://resend.com) (100 emails/day free).
2. Copy an API key → set it as the `RESEND_API_KEY` variable on your host.
3. Optionally set `OTP_EMAIL_FROM` (e.g. `TeamCollab <login@yourdomain.com>`) once
   you've verified a domain in Resend; without it, Resend's test sender is used.
4. Make sure teammates are added **with their email**, and tell them to log in
   using phone *or* email — the code arrives in their inbox either way.

**Real SMS codes — via Twilio (paid per SMS):**
Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` (your Twilio
number). Codes then go to the teammate's phone as a text message.

**Stopgap:** with neither configured, codes appear in your host's log viewer
(Railway → Deployments → View Logs), and you can read a code out to a teammate.
Fine for day one, not for daily use.

## Sharing *today*, without deploying (demo only)

Both options serve from your laptop — they stop the moment it sleeps:

- **Same office network:** run `npm run dev`, find your IP (`ipconfig getifaddr en0`
  on macOS), and teammates open `http://<your-ip>:5179` (add `--host` to the vite
  command in `web/package.json` or run `npx vite --host` in `web/`).
- **Temporary public URL:** install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
  and run `cloudflared tunnel --url http://localhost:5179` — you get a free
  `https://….trycloudflare.com` link to share.

## Updating a deployment

Push new commits to the deployed branch — Railway/Render rebuild automatically.
On a VPS: `git pull && docker build -t teamcollab . && docker restart` (recreate the
container; the `/data` volume keeps your database).

## Good to know

- **Backups:** everything lives in the `/data` volume (`teamcollab.db` + uploads).
  Snapshot or copy that file periodically.
- **Scaling:** SQLite comfortably handles a team of dozens. If you grow past that,
  Prisma makes a Postgres switch straightforward (change the datasource +
  `DATABASE_URL`) — ask Claude to do it when the time comes.
- The demo seed data is **not** loaded in production — you start with a clean org.
