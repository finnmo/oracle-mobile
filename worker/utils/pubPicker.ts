import { Env } from '../types';

/**
 * Pick a pub for the week, respecting:
 *  1. Votes — if any votes exist for this weekKey, the top-voted active pub wins.
 *  2. Vetoes — vetoed pubs are excluded from the random pool.
 *  3. Recency — the last 3 chosen pubs are excluded from the random pool.
 *  4. Fallbacks — if all non-vetoed pubs are excluded by recency, ignore recency but keep vetoes.
 *                 If every active pub is vetoed, ignore vetoes too.
 */
export async function pickPubForWeek(env: Env, weekKey: string): Promise<string | null> {
  // ── 1. Honour votes ────────────────────────────────────────────────────────
  const topVote = await env.DB.prepare(`
    SELECT pubId, COUNT(*) AS voteCount
    FROM votes
    WHERE weekKey = ?
    GROUP BY pubId
    ORDER BY voteCount DESC, MIN(createdAt) ASC
    LIMIT 1
  `).bind(weekKey).first<{ pubId: string; voteCount: number }>();

  if (topVote && topVote.voteCount > 0) {
    const pub = await env.DB.prepare(
      'SELECT id FROM pubs WHERE id = ? AND active = 1'
    ).bind(topVote.pubId).first<{ id: string }>();
    if (pub) return pub.id;
  }

  // ── 2. Build exclusion lists ────────────────────────────────────────────────
  const recent = await env.DB.prepare(`
    SELECT chosenPubId FROM rounds
    WHERE chosenPubId IS NOT NULL
    ORDER BY announceAtUtc DESC
    LIMIT 3
  `).all<{ chosenPubId: string }>();

  const vetoed = await env.DB.prepare(
    'SELECT pubId FROM vetoes WHERE weekKey = ?'
  ).bind(weekKey).all<{ pubId: string }>();

  const recentIds = recent.results.map(r => r.chosenPubId);
  const vetoedIds = vetoed.results.map(v => v.pubId);
  const allExcluded = [...new Set([...recentIds, ...vetoedIds])];

  // ── 3. Try random excluding both recent + vetoed ────────────────────────────
  let pub = await queryRandom(env, allExcluded);
  if (pub) return pub;

  // ── 4. Fallback: ignore recency, still respect vetoes ──────────────────────
  pub = await queryRandom(env, vetoedIds);
  if (pub) return pub;

  // ── 5. Last resort: any active pub ─────────────────────────────────────────
  pub = await env.DB.prepare(
    'SELECT id FROM pubs WHERE active = 1 ORDER BY RANDOM() LIMIT 1'
  ).first<{ id: string }>();

  return pub?.id ?? null;
}

async function queryRandom(env: Env, excluded: string[]): Promise<string | null> {
  let query = 'SELECT id FROM pubs WHERE active = 1';
  const params: string[] = [];

  if (excluded.length > 0) {
    query += ` AND id NOT IN (${excluded.map(() => '?').join(',')})`;
    params.push(...excluded);
  }
  query += ' ORDER BY RANDOM() LIMIT 1';

  const pub = await env.DB.prepare(query).bind(...params).first<{ id: string }>();
  return pub?.id ?? null;
}
