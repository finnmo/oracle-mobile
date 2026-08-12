# Set up your weekly picker site

Two paths:

1. **Updating [picker.example.com](https://picker.example.com)** (this repo’s production site) → see [instances/oracle-finn-morris/README.md](instances/oracle-finn-morris/README.md). Just `npm run deploy` — data stays in Cloudflare D1.
2. **New blank site** (fork / new domain) → follow Part A below.

`npm run deploy` never runs `seed.sql` and never deletes D1 data. `npm run setup` only creates empty tables.

---

## Who does what?

| Task | Who | How |
|------|-----|-----|
| Deploy once to Cloudflare | Technical helper | Steps below (~30 min) |
| Add venues | Anyone with admin access | `/admin` → Pub management |
| Colors, title, icon | Anyone with admin access | `/admin` → Site branding |
| Announce / reset a week | Anyone with admin access | `/admin` → Round control |

---

## Part A — One-time deploy (technical helper)

### 1. Prerequisites

- [Cloudflare](https://dash.cloudflare.com) account (free tier is fine)
- Domain name using Cloudflare DNS
- [Node.js](https://nodejs.org) 20+ installed
- This repo on your computer

### 2. Install and configure

```bash
cd oracle-mobile
npm install
cp wrangler.toml.example wrangler.toml   # if starting fresh without Finn's config
```

Apply blank template assets (skip this for picker.example.com — that site keeps Oracle HTML/manifest/icon at repo root):

```bash
cp template/index.html index.html
cp template/manifest.json public/manifest.json
cp template/icon.svg public/icon.svg
npm run icons
```

Also edit `worker/response.ts` — set `Access-Control-Allow-Origin` to your production URL (e.g. `https://picker.yourdomain.com`).

Create the database (once per Cloudflare account):

```bash
npx wrangler d1 create oracle-db
```

Copy the `database_id` from the output into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "oracle-db"
database_id = "PASTE_YOUR_ID_HERE"
```

Set your Access team URL in `wrangler.toml` (from Zero Trust → Settings → Team domain):

```toml
[vars]
CF_ACCESS_TEAM_DOMAIN = "https://YOURTEAM.cloudflareaccess.com"
```

### 3. Create the empty database tables

```bash
npm run setup
```

This applies `schema.sql` to production. **It does not add any venues** — the site starts blank.

### 4. Set two secrets

```bash
npx wrangler secret put ADMIN_API_TOKEN
# Choose a long random password — save it in a password manager

npx wrangler secret put CF_ACCESS_AUD
# Paste the Application Audience (AUD) tag from your Access app (step 5)
```

### 5. Cloudflare Access (protect admin only)

In **Zero Trust → Access → Applications**:

1. Add a **Self-hosted** application for your domain, e.g. `picker.yourdomain.com`
2. **Subdomain paths to protect** — add only:
   - `/admin`
   - `/admin/*`
3. **Do not** protect `/api/admin` or `/api/admin/*`
4. Policy: Allow your Google account (or email allowlist)
5. Copy the **Application Audience (AUD) Tag** → use in step 4

### 6. Connect domain to the Worker

In Cloudflare dashboard → **Workers & Pages** → your worker → **Settings → Domains & Routes** → add your custom domain.

### 7. Deploy

```bash
npm run deploy
```

Or combine setup + deploy:

```bash
npm run first-deploy
```

Open `https://your-domain.com` — you should see a neutral **Weekly Picker** template with no venues.

---

## Part B — Customize (site owner, no code)

1. Open `https://your-domain.com/admin`
2. Sign in with Google (Cloudflare Access)
3. **Site branding** — title, colors, icon
4. **Pub management** — add each venue (name, address, maps link)
5. Share the main URL with your group

Votes, announcements, and ratings work automatically on the weekly schedule (Perth time by default — see README for cron details).

---

## Optional

| Goal | Command / action |
|------|------------------|
| Example starter venues | Copy rows from `seed.example.sql` into `seed.sql`, then `npm run db:seed:remote` |
| Local dev on your laptop | `npm run db:init` then `npm run dev:worker` + `npm run dev:ui` |
| Emergency admin without Google | `/admin` → “Use API token instead” → paste `ADMIN_API_TOKEN` |
| Update live site after code changes | `npm run deploy` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Admin shows “Unauthorized” after Google login | Open `/admin` directly (not a `/cdn-cgi/access/authorized` link). Ensure `CF_ACCESS_AUD` matches your Access app. |
| Admin API blocked | Access must protect **only** `/admin`, not `/api/admin` |
| Blank vote section | Normal on first deploy — add venues in Admin |
| Announce fails | Need at least one **active** venue |

---

## Checklist (printable)

- [ ] `database_id` in `wrangler.toml`
- [ ] `CF_ACCESS_TEAM_DOMAIN` in `wrangler.toml`
- [ ] `npm run setup` (database tables)
- [ ] `ADMIN_API_TOKEN` secret set
- [ ] Access app on `/admin` only
- [ ] `CF_ACCESS_AUD` secret set
- [ ] Custom domain attached to Worker
- [ ] `npm run deploy`
- [ ] Admin: branding saved
- [ ] Admin: venues added
