import { Env } from '../../types';
import { json, error } from '../../response';
import { requireAdmin } from '../../auth';
import { getNextFridayUtc, computeRoundTimings } from '../../timeUtils';

export async function handleAdminCloseRatings(request: Request, env: Env): Promise<Response> {
  const authErr = await requireAdmin(request, env);
  if (authErr) return authErr;

  const nowUtc = new Date();

  // Target this or next Friday
  const friday = getNextFridayUtc(nowUtc);
  const { weekKey } = computeRoundTimings(friday);

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
