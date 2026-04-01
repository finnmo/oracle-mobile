import { Env } from '../../types';
import { json, error } from '../../response';
import { requireAdmin } from '../../auth';
import { getVoteAndRoundAnchorPerthYmd } from '../../timeUtils';

export async function handleAdminReset(request: Request, env: Env): Promise<Response> {
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

  const existing = await env.DB.prepare(
    'SELECT id, status FROM rounds WHERE weekKey = ?'
  ).bind(weekKey).first<{ id: string; status: string }>();

  if (!existing) {
    return error(`No round found for ${weekKey} — nothing to reset`, 404);
  }

  // Block reset once ratings have started — it would invalidate submitted ratings
  if (existing.status === 'rating_open' || existing.status === 'closed') {
    return error(
      `Cannot reset a round in '${existing.status}' state — ratings may have been submitted`,
      409
    );
  }

  await env.DB.prepare(`
    UPDATE rounds
    SET chosenPubId = NULL, chosenAtUtc = NULL, chosenBy = NULL, status = 'scheduled'
    WHERE weekKey = ?
  `).bind(weekKey).run();

  return json({
    ok: true,
    weekKey,
    status: 'scheduled',
    message:
      'Round cleared — cron will pick a random pub on the next announce day (Thursday if Friday is a WA public holiday), or call /api/admin/announce to set one manually',
  });
}
