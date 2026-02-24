import { Env } from '../types';
import { json, error } from '../response';
import { sha256 } from '../auth';
import { getNextFridayUtc, computeRoundTimings } from '../timeUtils';

interface VetoBody {
  pubId: string;
  deviceId: string;
}

export async function handleVetoes(request: Request, env: Env): Promise<Response> {
  if (request.method === 'POST') return castVeto(request, env);
  return error('Method not allowed', 405);
}

async function castVeto(request: Request, env: Env): Promise<Response> {
  let body: VetoBody;
  try {
    body = (await request.json()) as VetoBody;
  } catch {
    return error('Invalid JSON', 400);
  }

  const { pubId, deviceId } = body;
  if (!pubId)    return error('pubId is required', 400);
  if (!deviceId) return error('deviceId is required', 400);

  const pub = await env.DB.prepare(
    'SELECT id FROM pubs WHERE id = ? AND active = 1'
  ).bind(pubId).first<{ id: string }>();
  if (!pub) return error('Pub not found or inactive', 404);

  const nowUtc   = new Date();
  const friday   = getNextFridayUtc(nowUtc);
  const { weekKey } = computeRoundTimings(friday);

  // Veto window closes once pub is announced
  const round = await env.DB.prepare(
    'SELECT status FROM rounds WHERE weekKey = ?'
  ).bind(weekKey).first<{ status: string }>();
  if (round && round.status !== 'scheduled') {
    return error('Veto window has closed — the pub has already been announced', 409);
  }

  const deviceHash = await sha256(deviceId);
  const monthKey   = nowUtc.toISOString().slice(0, 7); // YYYY-MM

  try {
    await env.DB.prepare(`
      INSERT INTO vetoes (id, weekKey, pubId, deviceHash, monthKey)
      VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), weekKey, pubId, deviceHash, monthKey).run();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed')) {
      return error('You have already used your veto this month', 409);
    }
    throw err;
  }

  return json({ ok: true, weekKey, pubId, monthKey });
}
