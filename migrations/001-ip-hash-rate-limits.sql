-- Run once on existing D1 DBs: wrangler d1 execute oracle-db --remote --file=migrations/001-ip-hash-rate-limits.sql

ALTER TABLE votes ADD COLUMN ipHash TEXT;
CREATE INDEX IF NOT EXISTS idx_votes_week_ip ON votes(weekKey, ipHash);

ALTER TABLE vetoes ADD COLUMN ipHash TEXT;
CREATE INDEX IF NOT EXISTS idx_vetoes_month_ip ON vetoes(monthKey, ipHash);
