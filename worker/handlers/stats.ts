import { Env } from '../types';
import { json } from '../response';

interface PubStatRow {
  id: string;
  name: string;
  visits: number;
  avgScore: number | null;
  ratingCount: number;
}

export async function handleStats(_req: Request, env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT
      p.id,
      p.name,
      COUNT(DISTINCT r.id)  AS visits,
      ROUND(AVG(rt.score), 1) AS avgScore,
      COUNT(rt.id)          AS ratingCount
    FROM pubs p
    LEFT JOIN rounds r
      ON r.chosenPubId = p.id AND r.status = 'closed'
    LEFT JOIN ratings rt
      ON rt.roundId = r.id AND rt.pubId = p.id
    WHERE p.active = 1
    GROUP BY p.id
    ORDER BY visits DESC, p.name ASC
  `).all<PubStatRow>();

  const pubs = result.results.map((row) => ({
    id: row.id,
    name: row.name,
    visits: row.visits,
    avgScore: row.avgScore,
    ratingCount: row.ratingCount,
  }));

  const totalVisits  = pubs.reduce((s, p) => s + p.visits, 0);
  const totalRatings = pubs.reduce((s, p) => s + p.ratingCount, 0);

  // Highest average score among pubs with at least one rating (not "first row" by visit sort).
  const rated = pubs.filter((p) => p.ratingCount > 0 && p.avgScore != null);
  const bestPub =
    rated.length === 0
      ? null
      : rated.reduce((best, p) => {
          const diff = (p.avgScore ?? 0) - (best.avgScore ?? 0);
          if (diff > 0) return p;
          if (diff < 0) return best;
          if (p.ratingCount !== best.ratingCount) return p.ratingCount > best.ratingCount ? p : best;
          return p.name.localeCompare(best.name) < 0 ? p : best;
        });

  return json({ pubs, totalVisits, totalRatings, bestPub });
}
