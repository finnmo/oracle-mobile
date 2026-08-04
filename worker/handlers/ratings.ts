import { Env } from '../types';
import { json, error } from '../response';
import { sha256 } from '../auth';
import { isValidDeviceId } from '../utils/validate';

interface RatingBody {
  roundId: string;
  score: number;
  comment?: string;
  deviceId?: string;
}

interface RoundRow {
  id: string;
  rateOpenAtUtc: string;
  rateCloseAtUtc: string;
  chosenPubId: string | null;
}

interface RatingStats {
  avg_score: number | null;
  count: number;
}

export async function handleRatings(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.RATE_LIMITER.limit({ key: ip });
  if (!success) return error('Too many requests', 429);

  let body: RatingBody;
  try {
    body = (await request.json()) as RatingBody;
  } catch {
    return error('Invalid JSON', 400);
  }

  const { roundId, score, comment, deviceId } = body;

  if (!roundId || typeof roundId !== 'string') {
    return error('roundId is required', 400);
  }
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return error('score must be an integer between 1 and 5', 400);
  }
  if (comment !== undefined && (typeof comment !== 'string' || comment.length > 500)) {
    return error('comment must be a string under 500 characters', 400);
  }

  const nowIso = new Date().toISOString();

  const round = await env.DB.prepare(
    'SELECT id, rateOpenAtUtc, rateCloseAtUtc, chosenPubId FROM rounds WHERE id = ?'
  ).bind(roundId).first<RoundRow>();

  if (!round) {
    return error('Round not found', 404);
  }
  if (nowIso < round.rateOpenAtUtc) {
    return error('Rating window is not yet open', 403);
  }
  if (nowIso > round.rateCloseAtUtc) {
    return error('Rating window has closed', 403);
  }
  if (!round.chosenPubId) {
    return error('No pub has been chosen for this round', 400);
  }

  if (!isValidDeviceId(deviceId)) {
    return error('Invalid request', 400);
  }

  const ipHash = ip ? await sha256(ip) : null;
  const deviceHash = await sha256(deviceId);

  try {
    await env.DB.prepare(`
      INSERT INTO ratings (id, roundId, pubId, score, comment, deviceHash, ipHash, createdAtUtc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      roundId,
      round.chosenPubId,
      score,
      comment ?? null,
      deviceHash,
      ipHash,
      nowIso
    ).run();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed')) {
      return error('You have already rated this week', 409);
    }
    throw err;
  }

  const stats = await env.DB.prepare(`
    SELECT AVG(score) AS avg_score, COUNT(*) AS count
    FROM ratings WHERE roundId = ?
  `).bind(roundId).first<RatingStats>();

  return json({
    success: true,
    ratings: {
      average: Math.round((stats?.avg_score ?? 0) * 10) / 10,
      count: stats?.count ?? 0,
    },
  });
}
