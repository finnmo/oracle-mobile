import { Env } from '../../types';
import { json, error } from '../../response';
import { requireAdmin } from '../../auth';
import { getNextFridayUtc, computeRoundTimings } from '../../timeUtils';

export async function handleAdminOpenRatings(request: Request, env: Env): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;

  const nowUtc = new Date();

  // Target this or next Friday
  const friday = getNextFridayUtc(nowUtc);
  const { weekKey } = computeRoundTimings(friday);

  const result = await env.DB.prepare(`
    UPDATE rounds
    SET status = 'rating_open'
    WHERE weekKey = ? AND status = 'announced'
  `).bind(weekKey).run();

  if (result.meta.changes === 0) {
    return error(`No announced round found for ${weekKey}`, 404);
  }

  return json({ ok: true, weekKey, status: 'rating_open' });
}
