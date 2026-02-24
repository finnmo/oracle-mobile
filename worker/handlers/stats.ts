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

  const totalVisits   = pubs.reduce((s, p) => s + p.visits, 0);
  const totalRatings  = pubs.reduce((s, p) => s + p.ratingCount, 0);
  const bestPub       = pubs.find((p) => p.visits > 0 && p.avgScore != null) ?? null;

  return json({ pubs, totalVisits, totalRatings, bestPub });
}
