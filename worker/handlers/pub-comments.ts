import { Env } from '../types';
import { json, error } from '../response';

interface ReviewRow {
  weekKey: string;
  score: number;
  comment: string | null;
  createdAtUtc: string;
}

/**
 * GET /api/pubs/:pubId/comments — all ratings for closed rounds (newest first).
 */
export async function handlePubComments(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return error('Method not allowed', 405);

  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // ['api', 'pubs', ':pubId', 'comments']
  if (parts.length !== 4 || parts[0] !== 'api' || parts[1] !== 'pubs' || parts[3] !== 'comments') {
    return error('Not found', 404);
  }

  const pubId = decodeURIComponent(parts[2]);

  const pub = await env.DB.prepare('SELECT id, name FROM pubs WHERE id = ? AND active = 1')
    .bind(pubId)
    .first<{ id: string; name: string }>();
  if (!pub) return error('Pub not found', 404);

  const result = await env.DB.prepare(`
    SELECT r.weekKey, rt.score, rt.comment, rt.createdAtUtc
    FROM ratings rt
    INNER JOIN rounds r ON r.id = rt.roundId AND r.status = 'closed'
    WHERE rt.pubId = ?
    ORDER BY rt.createdAtUtc DESC
    LIMIT 300
  `)
    .bind(pubId)
    .all<ReviewRow>();

  return json({
    pubId: pub.id,
    name: pub.name,
    reviews: result.results,
  });
}
