# Oracle — Pub of the Week

Mobile-first web app for the weekly Friday pub selector. Built on Cloudflare Workers + D1 + Pages Assets.

---

## Stack

| Layer    | Tech                                  |
|----------|---------------------------------------|
| Frontend | React + TypeScript + Vite             |
| Backend  | Cloudflare Worker (TypeScript)        |
| Database | Cloudflare D1 (SQLite)                |
| Hosting  | Cloudflare Workers Static Assets      |
| Cron     | Cloudflare Scheduled Triggers         |

---

## Timezone

Perth (UTC+8). All times stored in UTC. Key schedule:

| Event          | Perth      | UTC (cron)           |
|----------------|------------|----------------------|
| Announce pub   | Fri 10:00  | Fri 02:00 `0 2 * * 5`   |
| Meet time      | Fri 12:00  | Fri 04:00            |
| Ratings open   | Fri 12:20  | Fri 04:20 `20 4 * * 5`  |
| Ratings close  | Fri 23:59  | Sat 15:59 `59 15 * * 6` |

---

## First-time setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the D1 database

```bash
npx wrangler d1 create oracle-db
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "oracle-db"
database_id = "YOUR_ACTUAL_ID_HERE"
```

### 3. Initialise schema + seed pubs

```bash
# Local dev
npm run db:init && npm run db:seed

# Remote (production)
npm run db:init:remote && npm run db:seed:remote
```

Edit `seed.sql` with your actual pub list first.

### 4. Set the admin token secret

```bash
npx wrangler secret put ADMIN_API_TOKEN
# Enter a strong random string when prompted
```

---

## Development

Run both servers in separate terminals:

```bash
# Terminal 1 — Worker dev server (port 8787)
npm run dev:worker

# Terminal 2 — Vite UI dev server (port 5173, proxies /api → 8787)
npm run dev:ui
```

Open http://localhost:5173

---

## Deploy

```bash
npm run deploy
```

This builds the frontend and deploys the Worker + assets to Cloudflare.

---

## Admin API

All admin endpoints require:
```
Authorization: Bearer <ADMIN_API_TOKEN>
```

### Announce early / specify a pub

```bash
# Random pub (honouring the last-3-weeks exclusion rule)
curl -X POST https://oracle.your-domain.workers.dev/api/admin/announce \
  -H "Authorization: Bearer TOKEN"

# Specific pub by ID
curl -X POST .../api/admin/announce \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pubId": "pub-001"}'

# Specific pub by name
curl -X POST .../api/admin/announce \
  -d '{"pubName": "The Rosemount Hotel"}'

# Force re-announce (overrides existing choice)
curl -X POST .../api/admin/announce \
  -d '{"pubName": "The Newport Hotel", "force": true}'
```

### Open / close ratings manually

```bash
curl -X POST .../api/admin/open-ratings  -H "Authorization: Bearer TOKEN"
curl -X POST .../api/admin/close-ratings -H "Authorization: Bearer TOKEN"
```

---

## Python script hook

```python
import os, requests

TOKEN  = os.environ["ORACLE_ADMIN_TOKEN"]
BASE   = "https://oracle.your-domain.workers.dev"

def announce(pub_name: str | None = None):
    body = {"pubName": pub_name} if pub_name else {}
    r = requests.post(
        f"{BASE}/api/admin/announce",
        json=body,
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    r.raise_for_status()
    return r.json()
```

---

## Project layout

```
oracle-mobile/
├── worker/               Cloudflare Worker (API + cron)
│   ├── index.ts          Router entry point
│   ├── types.ts          Shared TypeScript interfaces
│   ├── timeUtils.ts      Perth/UTC time helpers
│   ├── response.ts       JSON/CORS helpers
│   ├── auth.ts           Admin auth + hashing
│   ├── handlers/
│   │   ├── status.ts     GET /api/status
│   │   ├── ratings.ts    POST /api/ratings
│   │   ├── pubs.ts       GET /api/pubs
│   │   ├── rounds.ts     GET /api/rounds (history)
│   │   └── admin/
│   │       ├── announce.ts
│   │       ├── open-ratings.ts
│   │       └── close-ratings.ts
│   └── cron/
│       └── friday.ts     Scheduled cron logic
├── src/                  React frontend
│   ├── App.tsx
│   ├── api.ts            fetch wrappers
│   ├── types.ts
│   ├── index.css
│   └── components/
│       ├── CountdownTimer.tsx
│       ├── PubCard.tsx
│       ├── RatingSection.tsx
│       └── HistorySection.tsx
├── schema.sql            D1 table definitions
├── seed.sql              Initial pub data
└── wrangler.toml         Cloudflare config
```
