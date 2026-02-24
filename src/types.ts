export type AppState = 'countdown_announce' | 'announced' | 'rating_open' | 'rating_closed';

export interface Pub {
  id: string;
  name: string;
  address: string | null;
  mapsUrl: string | null;
}

export interface Round {
  id: string | null;
  weekKey: string;
  announceAtUtc: string;
  meetAtUtc: string;
  rateOpenAtUtc: string;
  rateCloseAtUtc: string;
  status: string | null;
  pub: Pub | null;
}

export interface RatingStats {
  average: number;
  count: number;
}

export interface StatusResponse {
  serverNowUtc: string;
  state: AppState;
  round: Round;
  ratings: RatingStats | null;
}

export interface HistoryRound {
  weekKey: string;
  announceAtUtc: string;
  pubName: string | null;
  pubAddress: string | null;
  average: number | null;
  ratingCount: number;
}

export interface PubStat {
  id: string;
  name: string;
  visits: number;
  avgScore: number | null;
  ratingCount: number;
}

export interface StatsResponse {
  pubs: PubStat[];
  totalVisits: number;
  totalRatings: number;
  bestPub: PubStat | null;
}
