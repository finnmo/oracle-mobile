# Weekly Picker (picker.example.com)

This repository deploys **https://picker.example.com** — the Oracle pub-of-the-week app. Pubs, branding, and history live in **Cloudflare D1**; routine deploys only update code.

| Goal | Action |
|------|--------|
| Ship code to Oracle production | `npm run deploy` — see [instances/oracle-finn-morris/README.md](instances/oracle-finn-morris/README.md) |
| Deploy a **new** blank site elsewhere | [SETUP.md](SETUP.md) + `template/` + `wrangler.toml.example` |

Forkers get a blank template (`seed.sql` empty, API defaults = “Weekly Picker”). Oracle keeps its DB branding and pubs.

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
npm install          # once
npm run setup        # create production DB tables (empty — no venues)
npm run deploy       # build + publish
npm run first-deploy # setup + deploy
```

Customize in the browser: **`/admin`** → Site branding + Pub management.

---

## Weekly schedule (Perth / UTC+8)

Default week anchor is **Friday** in Perth (Thursday when Friday is a WA public holiday). See `worker/waPublicHolidays.ts` for holiday dates.

| Event         | Perth time (normal week) | UTC crons (`wrangler.toml`) |
|---------------|--------------------------|-----------------------------|
| Announced     | Thu/Fri **10:00**        | `0 2 * * THU,FRI`           |
| Meet time     | Thu/Fri 12:00            | *(display only)*            |
| Ratings open  | Thu/Fri 12:20            | `20 4 * * THU,FRI`          |
| Ratings close | Fri/Sat 23:59 Perth*     | `59 15 * * FRI,SAT`         |

Crons run automatically. Admins can announce / open / close early from `/admin`.

---

## Development

```bash
npm run db:init      # local D1 schema
npm run dev:worker   # API on :8787
npm run dev:ui       # UI on :5173 (proxies /api)
```

Admin on localhost: http://localhost:5173/admin — use **API token** (Access only applies on your production domain).

---

## Cloudflare Access (admin)

Protect **only** `/admin` and `/admin/*`. Do **not** put `/api/admin` behind Access.

1. Zero Trust → Access → Self-hosted app for your domain
2. Paths: `/admin`, `/admin/*`
3. Google login + allowlist policy
4. `npx wrangler secret put CF_ACCESS_AUD` (Application Audience tag)
5. Set `CF_ACCESS_TEAM_DOMAIN` in `wrangler.toml`

Details and troubleshooting: **[SETUP.md](SETUP.md)**.

---

## Admin API (scripts / token)

Bearer `ADMIN_API_TOKEN` or Access JWT after `/admin` login.

```bash
BASE="https://your-domain.com"
TOKEN="your-admin-token"

curl "$BASE/api/admin/pubs" -H "Authorization: Bearer $TOKEN"
curl -X POST "$BASE/api/admin/announce" -H "Authorization: Bearer $TOKEN"
```

Full API reference: see sections below in this file (announce, reset, pubs).

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
oracle-mobile/
├── SETUP.md           ← start here for deploy
├── wrangler.toml.example
├── schema.sql         ← DB tables
├── seed.sql           ← empty by default
├── seed.example.sql   ← optional example venues
├── worker/            ← API + cron
└── src/               ← React UI
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
