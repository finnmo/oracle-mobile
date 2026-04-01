import { Env, AppState } from '../types';
import { json } from '../response';
import { getNextRoundTimings } from '../timeUtils';

export type StatusPayload = {
  serverNowUtc: string;
  state: AppState;
  round: Record<string, unknown>;
  ratings: { average: number; count: number } | null;
};

interface RoundRow {
  id: string;
  weekKey: string;
  announceAtUtc: string;
  meetAtUtc: string;
  rateOpenAtUtc: string;
  rateCloseAtUtc: string;
  chosenPubId: string | null;
  chosenAtUtc: string | null;
  chosenBy: string | null;
  status: string;
  pubName: string | null;
  pubAddress: string | null;
  pubMapsUrl: string | null;
}

interface RatingStats {
  avg_score: number | null;
  count: number;
}

export async function buildStatus(env: Env): Promise<StatusPayload> {
  const nowUtc = new Date();
  const nowIso = nowUtc.toISOString();

  // Fetch the most recent round (may or may not be active)
  const row = await env.DB.prepare(`
    SELECT r.id, r.weekKey, r.announceAtUtc, r.meetAtUtc, r.rateOpenAtUtc,
           r.rateCloseAtUtc, r.chosenPubId, r.chosenAtUtc, r.chosenBy, r.status,
           p.name  AS pubName,
           p.address AS pubAddress,
           p.mapsUrl AS pubMapsUrl
    FROM rounds r
    LEFT JOIN pubs p ON r.chosenPubId = p.id
    ORDER BY r.announceAtUtc DESC
    LIMIT 1
  `).first<RoundRow>();

  // A round is "active" until its close time has passed
  const isActive = row != null && nowIso <= row.rateCloseAtUtc;

  let state: AppState;
  let roundPayload: Record<string, unknown>;

  if (isActive && row) {
    const hasPub = Boolean(row.chosenPubId && row.pubName);

    // Pub is visible if it was explicitly announced (via API or cron),
    // OR if the clock has passed the scheduled announce time.
    // This lets an API-triggered announcement show immediately, even days before the scheduled announce.
    const dbAnnounced = ['announced', 'rating_open', 'closed'].includes(row.status);
    const pubVisible  = hasPub && (dbAnnounced || nowIso >= row.announceAtUtc);

    if (!pubVisible) {
      state = 'countdown_announce';
    } else if (nowIso < row.rateOpenAtUtc) {
      state = 'announced';
    } else if (nowIso <= row.rateCloseAtUtc) {
      state = 'rating_open';
    } else {
      state = 'rating_closed';
    }

    roundPayload = {
      id: row.id,
      weekKey: row.weekKey,
      announceAtUtc: row.announceAtUtc,
      meetAtUtc: row.meetAtUtc,
      rateOpenAtUtc: row.rateOpenAtUtc,
      rateCloseAtUtc: row.rateCloseAtUtc,
      status: row.status,
      pub: hasPub
        ? {
            id: row.chosenPubId,
            name: row.pubName,
            address: row.pubAddress,
            mapsUrl: row.pubMapsUrl,
          }
        : null,
    };
  } else {
    // Between rounds — compute next round schedule (Perth Fri, or Thu if Fri is a WA PH)
    state = 'countdown_announce';
    const timings = getNextRoundTimings(nowUtc);
    roundPayload = {
      id: null,
      weekKey: timings.weekKey,
      announceAtUtc: timings.announceAtUtc,
      meetAtUtc: timings.meetAtUtc,
      rateOpenAtUtc: timings.rateOpenAtUtc,
      rateCloseAtUtc: timings.rateCloseAtUtc,
      status: null,
      pub: null,
    };
  }

  // Aggregate ratings when relevant
  let ratings: { average: number; count: number } | null = null;
  const roundId = roundPayload.id as string | null;
  if (roundId && (state === 'rating_open' || state === 'rating_closed')) {
    const stats = await env.DB.prepare(`
      SELECT AVG(score) AS avg_score, COUNT(*) AS count
      FROM ratings WHERE roundId = ?
    `).bind(roundId).first<RatingStats>();

    if (stats && stats.count > 0) {
      ratings = {
        average: Math.round((stats.avg_score ?? 0) * 10) / 10,
        count: stats.count,
      };
    }
  }

  return { serverNowUtc: nowIso, state, round: roundPayload, ratings };
}

export async function handleStatus(_req: Request, env: Env): Promise<Response> {
  return json(await buildStatus(env));
}
