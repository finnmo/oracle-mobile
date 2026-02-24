export interface Env {
  DB: D1Database;
  ADMIN_API_TOKEN: string;
  ASSETS: Fetcher;
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
