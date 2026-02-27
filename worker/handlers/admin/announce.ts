import { Env } from '../../types';
import { json, error } from '../../response';
import { requireAdmin } from '../../auth';
import { computeRoundTimings, getNextFridayUtc } from '../../timeUtils';
import { pickPubForWeek } from '../../utils/pubPicker';

interface AnnounceBody {
  pubId?: string;
  pubName?: string;
  weekKey?: string; // Target a specific Friday (YYYY-MM-DD). Defaults to next Friday.
  force?: boolean;  // Override an already-chosen pub with a new random pick.
}

interface RoundResult {
  id: string;
  weekKey: string;
  announceAtUtc: string;
  meetAtUtc: string;
  rateOpenAtUtc: string;
  rateCloseAtUtc: string;
  status: string;
  chosenBy: string;
  pubId: string;
  pubName: string;
  pubAddress: string | null;
}

export async function handleAdminAnnounce(request: Request, env: Env): Promise<Response> {
  const authErr = await requireAdmin(request, env);
  if (authErr) return authErr;

  let body: AnnounceBody = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as AnnounceBody;
  } catch {
    return error('Invalid JSON', 400);
  }

  const nowUtc = new Date();
  const nowIso = nowUtc.toISOString();

  // ── 1. Determine target Friday ─────────────────────────────────────────────
  // If a weekKey is explicitly supplied, use it.
  // Otherwise, latch onto whichever round is currently active so the announcement
  // always overrides it — ensuring there is never more than one active round.
  // Only fall back to computing the next Friday when no active round exists.
  let fridayDate: Date;
  if (body.weekKey) {
    fridayDate = new Date(`${body.weekKey}T02:00:00.000Z`);
    if (isNaN(fridayDate.getTime())) {
      return error('Invalid weekKey — expected YYYY-MM-DD', 400);
    }
  } else {
    const activeRound = await env.DB.prepare(
      'SELECT weekKey FROM rounds WHERE rateCloseAtUtc > ? ORDER BY announceAtUtc DESC LIMIT 1'
    ).bind(nowIso).first<{ weekKey: string }>();

    fridayDate = activeRound
      ? new Date(`${activeRound.weekKey}T02:00:00.000Z`)
      : getNextFridayUtc(nowUtc);
  }

  const timings    = computeRoundTimings(fridayDate);
  const { weekKey } = timings;

  // ── 2. Resolve which pub to use ────────────────────────────────────────────
  const existing = await env.DB.prepare(
    'SELECT id, chosenPubId FROM rounds WHERE weekKey = ?'
  ).bind(weekKey).first<{ id: string; chosenPubId: string | null }>();

  // Pub resolution rules:
  //   - pubId / pubName supplied → always use that pub, overriding any existing choice
  //   - force: true (no pub specified) → pick a fresh random pub, overriding existing
  //   - nothing supplied + round already has a pub → keep existing pub
  //   - nothing supplied + no pub yet → pick random
  let pubId: string | null = existing?.chosenPubId ?? null;

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

  } else if (body.force || !pubId) {
    // force = re-pick random even if a pub is already set
    // !pubId = no pub yet, pick one now
    pubId = await pickPubForWeek(env, weekKey);
    if (!pubId) return error('No active pubs available', 500);
  }

  // ── 3. Upsert the round ────────────────────────────────────────────────────
  // Always sets status = 'announced' so the frontend shows the pub immediately.
  if (existing) {
    await env.DB.prepare(`
      UPDATE rounds
      SET chosenPubId = ?, chosenAtUtc = ?, chosenBy = 'api', status = 'announced'
      WHERE weekKey = ?
    `).bind(pubId, nowIso, weekKey).run();
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

  // ── 4. Return the round with pub info ─────────────────────────────────────
  const round = await env.DB.prepare(`
    SELECT r.id, r.weekKey, r.announceAtUtc, r.meetAtUtc, r.rateOpenAtUtc, r.rateCloseAtUtc,
           r.status, r.chosenBy,
           p.id      AS pubId,
           p.name    AS pubName,
           p.address AS pubAddress
    FROM rounds r
    JOIN pubs p ON r.chosenPubId = p.id
    WHERE r.weekKey = ?
  `).bind(weekKey).first<RoundResult>();

  return json({
    ok: true,
    weekKey,
    pub: round
      ? { id: round.pubId, name: round.pubName, address: round.pubAddress }
      : null,
    round,
  });
}
