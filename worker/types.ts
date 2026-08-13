interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  /** Optional: Bearer token for curl / scripts */
  ADMIN_API_TOKEN?: string;
  /** Admin login password (required for /admin password form) */
  ADMIN_PASSWORD?: string;
  ASSETS: Fetcher;
  RATE_LIMITER: RateLimit;
  /** Optional Cloudflare Access (legacy) */
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  /** Public site origin for CORS (e.g. https://picker.example.com) */
  SITE_ORIGIN?: string;
  /** Weekly schedule (set by onboard wizard) */
  SCHEDULE_TIMEZONE?: string;
  SCHEDULE_ANNOUNCE_WEEKDAY?: string;
  SCHEDULE_ANNOUNCE_TIME?: string;
  SCHEDULE_MEET_TIME?: string;
  SCHEDULE_RATE_OPEN_TIME?: string;
  SCHEDULE_RATE_CLOSE_TIME?: string;
  SCHEDULE_HOLIDAY_SHIFT?: string;
}

export interface Pub {
  id: string;
  name: string;
  address: string | null;
  mapsUrl: string | null;
  active: number;
  createdAt: string;
}

export interface Round {
  id: string;
  weekKey: string;
  announceAtUtc: string;
  meetAtUtc: string;
  rateOpenAtUtc: string;
  rateCloseAtUtc: string;
  chosenPubId: string | null;
  chosenAtUtc: string | null;
  chosenBy: 'cron' | 'api' | null;
  status: 'scheduled' | 'announced' | 'rating_open' | 'closed';
  createdAt: string;
}

export interface Rating {
  id: string;
  roundId: string;
  pubId: string;
  score: number;
  comment: string | null;
  deviceHash: string | null;
  ipHash: string | null;
  createdAtUtc: string;
}

export type AppState = 'countdown_announce' | 'announced' | 'rating_open' | 'rating_closed';
