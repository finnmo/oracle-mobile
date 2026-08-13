# Set up your weekly picker site

Works on **Windows, macOS, and Linux** (Node.js + npm). You do not need Mac-specific tools.

## Repo = blank template · Each deploy = its own branding in D1

| Layer | What it is |
|-------|------------|
| **This GitHub repo** | Blank starter (“Weekly Picker”, neutral grey, no venues) |
| **Your Cloudflare D1** | *Your* title, colours, icon, pubs — set in `/admin` after deploy |
| **Your `wrangler.toml`** | Local only (gitignored). Copy from `wrangler.toml.example` |

Pushing template code does not wipe an existing D1. New forks start blank until they save branding in Admin.

## Quick start (recommended)

```bash
npm install
npm run onboard
```

Same commands in **PowerShell**, **Command Prompt**, or **Terminal**.

The wizard: Cloudflare login → create Worker + D1 → admin password → empty tables → deploy.  
No Cloudflare Access / Google SSO setup required.

| Goal | Command |
|------|---------|
| New site on your account | `npm run onboard` |
| Trial without touching production config | `npm run onboard:sandbox` |
| Update an existing protected site | keep local `wrangler.toml` → `npm run onboard` → deploy-only |

`npm run deploy` never wipes D1. `npm run setup` only creates empty tables.

### GitHub Actions deploy (maintainers)

Deploy is **manual only** (`workflow_dispatch`) — nothing ships on push to `main`.

Required repository secrets:

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Deploy permission |
| `CLOUDFLARE_ACCOUNT_ID` | Account |
| `WRANGLER_TOML` | Full production `wrangler.toml` contents (not stored in git) |

---

## What a brand-new deployment needs

Everything below is handled by `npm run onboard` unless noted.

| Step | Covered by wizard? | Notes |
|------|--------------------|-------|
| Node.js 20+ installed | Prerequisite | [nodejs.org](https://nodejs.org) (LTS) |
| Cloudflare account | Prerequisite | Free tier is fine |
| `npm install` | Yes (if needed) | |
| `wrangler login` | Yes | Opens a browser |
| Own `wrangler.toml` | Yes | Created from `wrangler.toml.example` (never committed) |
| Blank template (title/icon) | Yes (optional prompt) | |
| Create D1 database | Yes | |
| Write `database_id` + `SITE_ORIGIN` + schedule | Yes | Timezone, announce day/time, meet, ratings |
| Cron schedules | Yes | Generated from your local times → UTC |
| `ADMIN_PASSWORD` secret | Yes | Password for `/admin` |
| Optional `ADMIN_API_TOKEN` | Yes (optional) | For curl/scripts |
| Apply `schema.sql` (empty tables) | Yes | No venues until you add them |
| `npm run build` + deploy | Yes | |
| Custom domain | Manual (optional) | `workers.dev` URL works immediately |
| Sign in at `/admin` | You | Use the password you set |
| Branding + add venues | You | In the admin UI |

### After deploy (you do this in the browser)

1. Open the site URL (wizard prints it — often `https://YOUR-WORKER.workers.dev`)
2. Go to `/admin` → enter password
3. **Site branding** — title, colours, icon
4. **Pub management** — add venues
5. Share the home URL with your group

### Weekly schedule (wizard)

The onboard wizard asks for:

1. **Timezone** (IANA, e.g. `Australia/Perth`, `Europe/London`)
2. **Announce weekday** + **time**
3. **Meet time**
4. **Ratings open** (default meet + 20 minutes) and **close** (default 23:59 next day)
5. Optional **WA public-holiday shift** (off by default)

These become `SCHEDULE_*` vars in `wrangler.toml` plus matching UTC crons. Change later by editing those vars and regenerating crons (or re-running onboard for a new site).

If your timezone observes daylight saving, UTC cron hours can drift when clocks change — re-run onboard schedule generation (or edit the three cron lines) after the switch.

---

## Who does what?

| Task | Who | How |
|------|-----|-----|
| Deploy once | Someone with Node + Cloudflare | `npm run onboard` |
| Add venues / branding / announce | Anyone with the password | `/admin` |

---

## Windows / macOS / Linux

| Action | All platforms |
|--------|----------------|
| Install deps | `npm install` |
| Wizard | `npm run onboard` |
| Deploy | `npm run deploy` |
| Blank template | `npm run apply-template` |

Use **PowerShell** or **cmd** on Windows — same `npm` commands. No `cp` / bash required (scripts use Node).

Optional: [Windows Terminal](https://aka.ms/terminal) + Node LTS installer.

If `npm run icons` fails on Windows, install [Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (needed by `sharp` once). The wizard can skip template apply; you can still change the icon later in Admin → Site branding.

---

## Manual path (if you prefer not to use the wizard)

### 1. Prerequisites

- Cloudflare account
- Node.js 20+
- This repo cloned

### 2. Configure

```bash
cd oracle-mobile
npm install
npm run apply-template
```

Copy config (pick one):

```bash
# macOS / Linux
cp wrangler.toml.example wrangler.toml

# Windows PowerShell
Copy-Item wrangler.toml.example wrangler.toml
```

Create D1, paste `database_id` into `wrangler.toml`, set `SITE_ORIGIN` and `name`:

```bash
npx wrangler login
npx wrangler d1 create my-picker-db
```

Optional local guard (gitignored): list production D1 UUIDs in `.protect-databases` so sandbox/onboard refuse them.

### 3. Tables + password + deploy

```bash
npm run setup
npx wrangler secret put ADMIN_PASSWORD
npm run deploy
```

Optional: `npx wrangler secret put ADMIN_API_TOKEN`

### 4. Custom domain (optional)

Cloudflare dashboard → Workers → your worker → **Domains & Routes**.

---

## Local development

```bash
npm run db:init
```

Create `.dev.vars` (not committed):

```
ADMIN_PASSWORD=dev-password
ADMIN_API_TOKEN=dev-token
```

Then two terminals:

```bash
npm run dev:worker
npm run dev:ui
```

Open http://localhost:5173/admin

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Fork deploys to wrong place | Start from `wrangler.toml.example`; never commit production `wrangler.toml` |
| Wrong password | `npx wrangler secret put ADMIN_PASSWORD` |
| Login then 401 | Use same-origin `/admin`; allow cookies |
| Google / Access page | Disable Access app for this hostname |
| Blank vote list | Add venues in Admin |
| Announce fails | Need ≥1 **active** venue |
| `sharp` / icons fail on Windows | Install C++ build tools, or set icon in Admin later |
| Rate limit binding errors | Rare on new accounts; open a Cloudflare support ticket or remove the `RATE_LIMITER` block temporarily |

---

## Checklist (brand-new site)

- [ ] Node 20+ and Cloudflare account
- [ ] `npm install`
- [ ] `npm run onboard` completed (own Worker + D1 + password)
- [ ] Site opens on `workers.dev` (or custom domain)
- [ ] `/admin` password works
- [ ] Branding saved
- [ ] At least one venue added
- [ ] (Optional) Confirm schedule timezone/day/times in wizard matched your group
- [ ] (Optional) Custom domain attached
