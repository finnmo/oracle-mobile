import { Env } from '../types';
import { json } from '../response';

interface HistoryRow {
  weekKey: string;
  announceAtUtc: string;
  pubId: string | null;
  pubName: string | null;
  pubAddress: string | null;
  status: string;
  avg_score: number | null;
  ratingCount: number;
}

export async function handleRounds(_req: Request, env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT
      r.weekKey,
      r.announceAtUtc,
      r.status,
      p.id      AS pubId,
      p.name    AS pubName,
      p.address AS pubAddress,
      AVG(rt.score) AS avg_score,
      COUNT(rt.id)  AS ratingCount
    FROM rounds r
    LEFT JOIN pubs p  ON r.chosenPubId = p.id
    LEFT JOIN ratings rt ON rt.roundId  = r.id
    WHERE r.status = 'closed'
    GROUP BY r.id
    ORDER BY r.announceAtUtc DESC
    LIMIT 12
  `).all<HistoryRow>();

  const rounds = result.results.map((row) => ({
    weekKey: row.weekKey,
    announceAtUtc: row.announceAtUtc,
    pubId: row.pubId ?? null,
    pubName: row.pubName,
    pubAddress: row.pubAddress,
    average: row.avg_score != null ? Math.round(row.avg_score * 10) / 10 : null,
    ratingCount: row.ratingCount,
  }));

  return json({ rounds });
}
