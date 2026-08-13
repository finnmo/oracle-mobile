# Weekly Picker

Blank Cloudflare template for a login-free weekly venue picker: vote during the week, announce on a schedule, rate afterward. Pubs, branding, and history live in **each deploy’s Cloudflare D1** — the repo itself stays a neutral starter.

| Goal | Action |
|------|--------|
| New site on your Cloudflare account | `npm run onboard` or [SETUP.md](SETUP.md) |
| Safe trial without touching an existing Worker | `npm run onboard:sandbox` (auto defaults after Cloudflare login) |
| Ship code (local) | `npm run deploy` (needs your own `wrangler.toml`) |
| Ship production via GitHub | Actions → **Deploy** → Run workflow (manual only) |

---

## Stack

| Layer    | Tech                              |
|----------|-----------------------------------|
| Frontend | React + TypeScript + Vite         |
| Backend  | Cloudflare Worker (TypeScript)    |
| Database | Cloudflare D1 (SQLite)            |
| Hosting  | Cloudflare Workers Static Assets  |
| Cron     | Cloudflare Scheduled Triggers     |

No user login on the public site. Each phone gets a random `deviceId` in `localStorage` (one vote per week, one rating per round, one veto per month).

---

## Quick commands

```bash
npm install              # once
npm run onboard:sandbox  # safe trial — auto defaults, prints Site + Admin password
npm run onboard          # interactive wizard for a real site (creates wrangler.toml)
npm run deploy           # build + publish only (needs wrangler.toml)
```

`wrangler.toml` / `wrangler.sandbox.toml` are **gitignored** — never commit production IDs or hostnames. Customize in the browser: **`/admin`** → Site branding + venue management.

---

## Weekly schedule

Chosen in **`npm run onboard`** (timezone, announce weekday + time, meet time, ratings open/close). Stored in `wrangler.toml` `[vars]` and converted to UTC crons.

| Event         | Default (if you accept wizard defaults) |
|---------------|----------------------------------------|
| Announced     | Friday 10:00 local |
| Meet          | Friday 12:00 local |
| Ratings open  | Friday 12:20 local |
| Ratings close | Saturday 23:59 local |

Optional WA public-holiday shift (announce one day earlier) is a wizard prompt — off by default for new sites.

Re-run the wizard (or edit `SCHEDULE_*` vars + regenerate crons) to change the ritual.

---

## Development

```bash
npm run db:init      # local D1 schema
npm run dev:worker   # API on :8787
npm run dev:ui       # UI on :5173 (proxies /api)
```

Admin on localhost: http://localhost:5173/admin — set `ADMIN_PASSWORD` in `.dev.vars`, then sign in.

---

## Admin auth

Primary: **password** (`ADMIN_PASSWORD` Worker secret) → HttpOnly session cookie (14 days).

Optional: Bearer `ADMIN_API_TOKEN` for curl/scripts.

Cloudflare Access is **not required**. Optional `CF_ACCESS_*` vars remain supported if you already use Access.

```bash
npx wrangler secret put ADMIN_PASSWORD
# optional:
npx wrangler secret put ADMIN_API_TOKEN
```

---

## Admin API (scripts / token)

```bash
BASE="https://your-domain.com"
TOKEN="your-admin-token"

curl "$BASE/api/admin/pubs" -H "Authorization: Bearer $TOKEN"
curl -X POST "$BASE/api/admin/announce" -H "Authorization: Bearer $TOKEN"
```

---

## Public API

| Method | Path           | Description                    |
|--------|----------------|--------------------------------|
| GET    | `/api/status`  | Current state + round          |
| GET    | `/api/branding`| Site title, colors, icons      |
| GET    | `/api/pubs`    | Active venue list              |
| GET    | `/api/votes?deviceId=` | Ballot + your vote     |
| POST   | `/api/votes`   | Vote or `{ deviceId, clear: true }` to undo |
| POST   | `/api/ratings` | Submit rating                  |

---

## Project layout

```
├── SETUP.md              ← deploy walkthrough
├── wrangler.toml.example ← copy to wrangler.toml (gitignored)
├── schema.sql
├── seed.sql / seed.example.sql
├── instances/README.md   ← keep venue backups private
├── worker/               ← API + cron
└── src/                  ← React UI
```

---

## Admin API (detailed)

### Announce a venue

```bash
curl -X POST "$BASE/api/admin/announce" -H "Authorization: Bearer $TOKEN"
curl -X POST "$BASE/api/admin/announce" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"pubId": "pub-001"}'
```

### Reset / open / close ratings

```bash
curl -X POST "$BASE/api/admin/reset" -H "Authorization: Bearer $TOKEN"
curl -X POST "$BASE/api/admin/open-ratings" -H "Authorization: Bearer $TOKEN"
curl -X POST "$BASE/api/admin/close-ratings" -H "Authorization: Bearer $TOKEN"
```

### Manage venues

```bash
curl "$BASE/api/admin/pubs" -H "Authorization: Bearer $TOKEN"
curl -X POST "$BASE/api/admin/pubs" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Venue name","address":"...","mapsUrl":"https://..."}'
```

### Branding

```bash
curl "$BASE/api/admin/branding" -H "Authorization: Bearer $TOKEN"
curl -X PATCH "$BASE/api/admin/branding" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Our Picker","accentColor":"#2563eb","mainColor":"#1e3a5f","backgroundColor":"#f8fafc"}'
```

---

## Python helper (optional)

```python
import os, requests
TOKEN = os.environ["ADMIN_API_TOKEN"]
BASE = "https://your-domain.com"
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

requests.get(f"{BASE}/api/admin/pubs", headers=H).json()
requests.post(f"{BASE}/api/admin/announce", headers=H).json()
```
