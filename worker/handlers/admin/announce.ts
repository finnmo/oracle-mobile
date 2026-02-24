import { Env } from '../../types';
import { json, error } from '../../response';
import { requireAdmin } from '../../auth';
import { computeRoundTimings, getNextFridayUtc } from '../../timeUtils';

interface AnnounceBody {
  pubId?: string;
  pubName?: string;
  weekKey?: string;  // Override which Friday (YYYY-MM-DD)
  force?: boolean;   // Re-announce even if already chosen
}

export async function handleAdminAnnounce(request: Request, env: Env): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;

  let body: AnnounceBody = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as AnnounceBody;
  } catch {
    return error('Invalid JSON', 400);
  }

  const nowUtc = new Date();

  // Determine which Friday we are targeting
  let fridayDate: Date;
  if (body.weekKey) {
    fridayDate = new Date(`${body.weekKey}T02:00:00.000Z`);
    if (isNaN(fridayDate.getTime())) return error('Invalid weekKey format (expected YYYY-MM-DD)', 400);
  } else {
    fridayDate = getNextFridayUtc(nowUtc);
  }

  const timings = computeRoundTimings(fridayDate);
  const { weekKey } = timings;

  // Resolve the pub to use
  let pubId: string | null = null;

  if (body.pubId) {
    const pub = await env.DB.prepare(
      'SELECT id FROM pubs WHERE id = ? AND active = 1'
    ).bind(body.pubId).first<{ id: string }>();
    if (!pub) return error('Pub not found or inactive', 404);
    pubId = pub.id;

  } else if (body.pubName) {
    const pub = await env.DB.prepare(
      'SELECT id FROM pubs WHERE name = ? AND active = 1'
    ).bind(body.pubName).first<{ id: string }>();
    if (!pub) return error(`No active pub named "${body.pubName}"`, 404);
    pubId = pub.id;

  } else {
    pubId = await pickRandomPub(env);
    if (!pubId) return error('No active pubs available', 500);
  }

  const nowIso = nowUtc.toISOString();

  // Upsert the round
  const existing = await env.DB.prepare(
    'SELECT id, chosenPubId, status FROM rounds WHERE weekKey = ?'
  ).bind(weekKey).first<{ id: string; chosenPubId: string | null; status: string }>();

  if (existing) {
    if (existing.chosenPubId && !body.force) {
      // Already announced — only update pub if caller explicitly specified one
      if (body.pubId || body.pubName) {
        await env.DB.prepare(`
          UPDATE rounds SET chosenPubId = ?, chosenAtUtc = ?, chosenBy = 'api'
          WHERE weekKey = ?
        `).bind(pubId, nowIso, weekKey).run();
      }
    } else {
      await env.DB.prepare(`
        UPDATE rounds
        SET chosenPubId = ?, chosenAtUtc = ?, chosenBy = 'api', status = 'announced'
        WHERE weekKey = ?
      `).bind(pubId, nowIso, weekKey).run();
    }
  } else {
    await env.DB.prepare(`
      INSERT INTO rounds
        (id, weekKey, announceAtUtc, meetAtUtc, rateOpenAtUtc, rateCloseAtUtc,
         chosenPubId, chosenAtUtc, chosenBy, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'api', 'announced')
    `).bind(
      crypto.randomUUID(),
      weekKey,
      timings.announceAtUtc,
      timings.meetAtUtc,
      timings.rateOpenAtUtc,
      timings.rateCloseAtUtc,
      pubId,
      nowIso
    ).run();
  }

  const round = await env.DB.prepare(`
    SELECT r.*, p.name AS pubName, p.address AS pubAddress
    FROM rounds r
    JOIN pubs p ON r.chosenPubId = p.id
    WHERE r.weekKey = ?
  `).bind(weekKey).first();

  return json({ ok: true, weekKey, round });
}

async function pickRandomPub(env: Env): Promise<string | null> {
  // Avoid the last 3 chosen pubs to prevent repeats
  const recent = await env.DB.prepare(`
    SELECT chosenPubId FROM rounds
    WHERE chosenPubId IS NOT NULL
    ORDER BY announceAtUtc DESC
    LIMIT 3
  `).all<{ chosenPubId: string }>();

  const recentIds = recent.results.map((r) => r.chosenPubId);

  let query = 'SELECT id FROM pubs WHERE active = 1';
  const params: string[] = [];

  if (recentIds.length > 0) {
    query += ` AND id NOT IN (${recentIds.map(() => '?').join(',')})`;
    params.push(...recentIds);
  }
  query += ' ORDER BY RANDOM() LIMIT 1';

  let pub = await env.DB.prepare(query).bind(...params).first<{ id: string }>();

  // Fallback: if all pubs are in the exclusion list, pick any active pub
  if (!pub) {
    pub = await env.DB.prepare(
      'SELECT id FROM pubs WHERE active = 1 ORDER BY RANDOM() LIMIT 1'
    ).first<{ id: string }>();
  }

  return pub?.id ?? null;
}
