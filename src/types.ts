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
  userRated?: boolean;
}

export interface HistoryRound {
  weekKey: string;
  announceAtUtc: string;
  pubId: string | null;
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

export interface PubReview {
  weekKey: string;
  score: number;
  comment: string | null;
  createdAtUtc: string;
}

export interface PubReviewsResponse {
  pubId: string;
  name: string;
  reviews: PubReview[];
}

// ── Voting / veto ────────────────────────────────────────────────────────────

export interface BallotPub {
  id: string;
  name: string;
  address: string | null;
  votes: number;
  vetoed: boolean;
}

export interface VotesResponse {
  weekKey: string;
  pubs: BallotPub[];
  totalVotes: number;
  userVote: string | null;
  userVetoedPubId: string | null;
  userVetoUsed: boolean;
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface AdminPub {
  id: string;
  name: string;
  address: string | null;
  mapsUrl: string | null;
  active: number;
}
