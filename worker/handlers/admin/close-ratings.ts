import { Env } from '../../types';
import { json, error } from '../../response';
import { requireAdmin } from '../../auth';
import { getVoteAndRoundAnchorPerthYmd } from '../../timeUtils';

export async function handleAdminCloseRatings(request: Request, env: Env): Promise<Response> {
  const authErr = await requireAdmin(request, env);
  if (authErr) return authErr;

  const nowUtc = new Date();
  const nowIso = nowUtc.toISOString();

  const activeRound = await env.DB.prepare(
    'SELECT weekKey FROM rounds WHERE rateCloseAtUtc > ? ORDER BY announceAtUtc DESC LIMIT 1'
  )
    .bind(nowIso)
    .first<{ weekKey: string }>();

  const weekKey = activeRound?.weekKey ?? getVoteAndRoundAnchorPerthYmd(nowUtc);

  const result = await env.DB.prepare(`
    UPDATE rounds
    SET status = 'closed'
    WHERE weekKey = ? AND status IN ('announced', 'rating_open')
  `).bind(weekKey).run();

  if (result.meta.changes === 0) {
    return error(`No open round found for ${weekKey}`, 404);
  }

  return json({ ok: true, weekKey, status: 'closed' });
}
