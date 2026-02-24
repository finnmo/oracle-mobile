-- Oracle D1 Schema

CREATE TABLE IF NOT EXISTS pubs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  address    TEXT,
  mapsUrl    TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  createdAt  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- One row per Friday week
CREATE TABLE IF NOT EXISTS rounds (
  id             TEXT PRIMARY KEY,
  weekKey        TEXT NOT NULL UNIQUE, -- YYYY-MM-DD of the Friday (Perth date)
  announceAtUtc  TEXT NOT NULL,        -- Friday 02:00 UTC (10:00 Perth)
  meetAtUtc      TEXT NOT NULL,        -- Friday 04:00 UTC (12:00 Perth)
  rateOpenAtUtc  TEXT NOT NULL,        -- Friday 04:20 UTC (12:20 Perth)
  rateCloseAtUtc TEXT NOT NULL,        -- Saturday 15:59 UTC (Friday 23:59 Perth)
  chosenPubId    TEXT REFERENCES pubs(id),
  chosenAtUtc    TEXT,
  chosenBy       TEXT CHECK(chosenBy IN ('cron', 'api')),
  status         TEXT NOT NULL DEFAULT 'scheduled'
                   CHECK(status IN ('scheduled', 'announced', 'rating_open', 'closed')),
  createdAt      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ratings (
  id           TEXT PRIMARY KEY,
  roundId      TEXT NOT NULL REFERENCES rounds(id),
  pubId        TEXT NOT NULL REFERENCES pubs(id),
  score        INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
  comment      TEXT,
  deviceHash   TEXT,
  ipHash       TEXT,
  createdAtUtc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Prevent duplicate ratings: one per device per round
CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_round_device
  ON ratings(roundId, deviceHash);

CREATE INDEX IF NOT EXISTS idx_rounds_weekKey
  ON rounds(weekKey);

CREATE INDEX IF NOT EXISTS idx_ratings_roundId
  ON ratings(roundId);
