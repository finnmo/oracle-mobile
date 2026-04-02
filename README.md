# Oracle — Pub of the Week

Mobile-first web app for the weekly pub selector (Perth time). Built on Cloudflare Workers + D1.

---

## Stack

| Layer    | Tech                              |
|----------|-----------------------------------|
| Frontend | React + TypeScript + Vite         |
| Backend  | Cloudflare Worker (TypeScript)    |
| Database | Cloudflare D1 (SQLite)            |
| Hosting  | Cloudflare Workers Static Assets  |
| Cron     | Cloudflare Scheduled Triggers     |

There is **no user login**. Each phone/browser gets a random **`deviceId`** in `localStorage` — one vote per week, one rating per round, one veto per month, tied to that id. **We do not rate-limit by Wi‑Fi** (shared networks are expected). Users can **withdraw their vote** while voting is open (`POST /api/votes` with `{ deviceId, clear: true }`). IP-based caps were removed for this reason.

---

## Weekly schedule (Perth / UTC+8)

Default week: **anchor = calendar Friday** in Perth. If that Friday is a **Western Australia public holiday**, the whole round moves to the **previous Thursday** (same local clock times: announce 11:45, meet 12:00, ratings open 12:20, ratings close 23:59 Perth on the calendar day after the anchor).

WA holiday dates are listed in `worker/waPublicHolidays.ts` (sourced from [publicholidays.com.au/western-australia](https://publicholidays.com.au/western-australia/) and the [WA government site](https://www.wa.gov.au/service/employment/workplace-arrangements/public-holidays-western-australia); update yearly, especially 2028+).

| Event         | Perth time (normal week) | UTC crons (see `wrangler.toml`) |
|---------------|--------------------------|-----------------------------------|
| Pub announced | Thu/Fri 11:45            | `45 3 * * 4,5` (Thu + Fri)        |
| Meet time     | Thu/Fri 12:00            | *(display only)*                  |
| Ratings open  | Thu/Fri 12:20            | `20 4 * * 4,5`                    |
| Ratings close | Fri/Sat 23:59 Perth\*    | `59 15 * * 5,6`                   |

(Combined weekday lists keep the Worker under Cloudflare’s per-script cron limit.)

\*Close is always `rateCloseAtUtc` in D1 (next calendar day after anchor at 15:59 UTC). Open/close cron handlers apply to **any** round whose timestamps have passed, so Thursday-anchor and Friday-anchor weeks both work.

The cron jobs run automatically. The admin API can trigger any of these early.

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

Copy the `database_id` from the output into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "oracle-db"
database_id = "YOUR_ID_HERE"
```

### 3. Apply schema and seed pubs

Edit `seed.sql` with your pub list, then:

```bash
# Local dev
npm run db:init && npm run db:seed

# Production (remote)
npm run db:init:remote && npm run db:seed:remote
```

To wipe and re-seed local data at any time:

```bash
npx wrangler d1 execute oracle-db --local \
  --command "DELETE FROM ratings; DELETE FROM rounds; DELETE FROM pubs;"
npm run db:seed
```

### 4. Set the admin secret

```bash
npx wrangler secret put ADMIN_API_TOKEN
# Enter a strong random string when prompted
```

---

## Development

Run both servers in separate terminals:

```bash
# Terminal 1 — Worker + D1 (port 8787)
npm run dev:worker

# Terminal 2 — Vite UI with hot reload (port 5173, proxies /api → 8787)
npm run dev:ui
```

Open http://localhost:5173

---

## Deploy

```bash
npm run deploy
```

Builds the frontend then deploys Worker + assets to Cloudflare. Cron triggers are registered automatically.

---

## Admin API

All admin endpoints require:
```
Authorization: Bearer <ADMIN_API_TOKEN>
```

### Announce a pub

```bash
BASE="https://your-worker.workers.dev"
TOKEN="your-token"

# Pick a random pub (skips last 3 chosen)
curl -X POST "$BASE/api/admin/announce" \
  -H "Authorization: Bearer $TOKEN"

# Specify a pub by name (always overrides existing choice)
curl -X POST "$BASE/api/admin/announce" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pubName": "The Como"}'

# Specify a pub by ID
curl -X POST "$BASE/api/admin/announce" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pubId": "pub-001"}'

# Force a fresh random pick (overrides existing choice)
curl -X POST "$BASE/api/admin/announce" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

**Behaviour:**
- Calling announce sets `status = "announced"` immediately — the pub shows on the frontend right away, regardless of what day of the week it is.
- If the cron fires later on the announce day (Thursday or Friday in Perth, per WA holidays), it sees a pub is already chosen and does nothing.
- Providing `pubId` or `pubName` **always** overwrites the current selection, no `force` flag needed.

**Response:**
```json
{
  "ok": true,
  "weekKey": "2026-02-27",
  "pub": { "id": "pub-001", "name": "The Como", "address": "..." },
  "round": { "id": "...", "status": "announced", "chosenBy": "api", ... }
}
```

### Reset the announcement

Clears the current pub selection and returns the round to `scheduled`, so the next announce cron will pick a fresh random pub. Blocked if ratings are already open or closed.

```bash
curl -X POST "$BASE/api/admin/reset" \
  -H "Authorization: Bearer $TOKEN"
```

### Open / close ratings manually

```bash
curl -X POST "$BASE/api/admin/open-ratings"  -H "Authorization: Bearer $TOKEN"
curl -X POST "$BASE/api/admin/close-ratings" -H "Authorization: Bearer $TOKEN"
```

### Manage pubs

```bash
# List all pubs (including inactive)
curl "$BASE/api/admin/pubs" -H "Authorization: Bearer $TOKEN"

# Add a pub
curl -X POST "$BASE/api/admin/pubs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"The Generous Squire","address":"123 Hay St, Perth WA 6000","mapsUrl":"https://maps.google.com/?q=..."}'

# Update a pub (any combination of fields)
curl -X PATCH "$BASE/api/admin/pubs/pub-001" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"The Como Hotel","active":true}'

# Delete a pub
# — Hard deletes if never used in a round
# — Deactivates (hides from selection) if it has history
curl -X DELETE "$BASE/api/admin/pubs/pub-001" \
  -H "Authorization: Bearer $TOKEN"

# Reactivate a deactivated pub
curl -X PATCH "$BASE/api/admin/pubs/pub-001" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"active":true}'
```

---

## Python integration

```python
import os
import requests

TOKEN = os.environ["ORACLE_ADMIN_TOKEN"]
BASE  = "https://your-worker.workers.dev"

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}


def announce(pub_name: str | None = None, pub_id: str | None = None, force: bool = False) -> dict:
    """Announce this week's pub. Pub shows immediately on the frontend."""
    body = {}
    if pub_name:
        body["pubName"] = pub_name
    elif pub_id:
        body["pubId"] = pub_id
    elif force:
        body["force"] = True

    r = requests.post(f"{BASE}/api/admin/announce", json=body, headers=HEADERS)
    r.raise_for_status()
    return r.json()


def reset() -> dict:
    """Clear the current announcement so the cron picks a fresh pub on Friday."""
    r = requests.post(f"{BASE}/api/admin/reset", headers=HEADERS)
    r.raise_for_status()
    return r.json()


def open_ratings() -> dict:
    r = requests.post(f"{BASE}/api/admin/open-ratings", headers=HEADERS)
    r.raise_for_status()
    return r.json()


def close_ratings() -> dict:
    r = requests.post(f"{BASE}/api/admin/close-ratings", headers=HEADERS)
    r.raise_for_status()
    return r.json()


def list_pubs() -> list[dict]:
    r = requests.get(f"{BASE}/api/admin/pubs", headers=HEADERS)
    r.raise_for_status()
    return r.json()["pubs"]


def add_pub(name: str, address: str | None = None, maps_url: str | None = None) -> dict:
    body = {"name": name, "address": address, "mapsUrl": maps_url}
    r = requests.post(f"{BASE}/api/admin/pubs", json=body, headers=HEADERS)
    r.raise_for_status()
    return r.json()["pub"]


def update_pub(pub_id: str, **kwargs) -> dict:
    """kwargs: name, address, mapsUrl, active (bool)"""
    r = requests.patch(f"{BASE}/api/admin/pubs/{pub_id}", json=kwargs, headers=HEADERS)
    r.raise_for_status()
    return r.json()["pub"]


def delete_pub(pub_id: str) -> dict:
    r = requests.delete(f"{BASE}/api/admin/pubs/{pub_id}", headers=HEADERS)
    r.raise_for_status()
    return r.json()  # {"ok": true, "action": "deleted" | "deactivated"}


# ── Usage examples ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Announce a specific pub right now (shows on frontend immediately)
    result = announce(pub_name="The Como")
    print(result["pub"]["name"])

    # Force a fresh random pick
    announce(force=True)

    # Change the pub after the initial announcement
    announce(pub_name="Baillie Hill")

    # Reset so cron picks on the next announce day
    reset()
```

---

## Public API

These endpoints require no authentication:

| Method | Path           | Description                              |
|--------|----------------|------------------------------------------|
| GET    | `/api/status`  | Current state, round info, ratings       |
| GET    | `/api/rounds`  | Last 12 closed rounds (history)          |
| GET    | `/api/stats`   | Per-pub visit counts and average ratings |
| GET    | `/api/pubs/:id/comments` | Per-pub rating history (closed rounds), newest first |
| GET    | `/api/pubs`    | Active pub list                          |
| GET    | `/api/votes?deviceId=` | Ballot + your vote (if `deviceId` sent) |
| POST   | `/api/votes`   | `{"pubId","deviceId"}` to vote; `{"deviceId","clear":true}` to undo |
| POST   | `/api/ratings` | Submit a rating (`deviceId` required)    |

---

## Project layout

```
oracle-mobile/
├── worker/
│   ├── index.ts              Router
│   ├── types.ts              Env + DB interfaces
│   ├── timeUtils.ts          Perth anchor + round timestamps
│   ├── waPublicHolidays.ts   WA public holiday dates (Thu shift when Fri is PH)
│   ├── response.ts           JSON/CORS helpers
│   ├── auth.ts               Bearer auth + SHA-256
│   ├── handlers/
│   │   ├── status.ts         GET /api/status
│   │   ├── ratings.ts        POST /api/ratings
│   │   ├── pubs.ts           GET /api/pubs
│   │   ├── rounds.ts         GET /api/rounds
│   │   ├── stats.ts          GET /api/stats
│   │   ├── pub-comments.ts   GET /api/pubs/:id/comments
│   │   └── admin/
│   │       ├── announce.ts   POST /api/admin/announce
│   │       ├── reset.ts      POST /api/admin/reset
│   │       ├── open-ratings.ts
│   │       ├── close-ratings.ts
│   │       └── pubs.ts       GET/POST/PATCH/DELETE /api/admin/pubs
│   └── cron/
│       └── friday.ts         Scheduled cron logic
├── src/
│   ├── App.tsx
│   ├── api.ts
│   ├── types.ts
│   ├── index.css
│   └── components/
│       ├── CountdownTimer.tsx
│       ├── PubCard.tsx
│       ├── RatingSection.tsx
│       ├── HistorySection.tsx
│       └── StatsDrawer.tsx   Hamburger menu + pub stats chart
├── schema.sql
├── seed.sql
└── wrangler.toml
```
