import { Env } from '../types';
import { json, error } from '../response';
import { sha256 } from '../auth';
import { getNextFridayUtc, computeRoundTimings } from '../timeUtils';

interface VoteBody {
  pubId: string;
  deviceId: string;
}

interface VoteRow {
  pubId: string;
  pubName: string;
  count: number;
}

interface PubRow {
  id: string;
  name: string;
  address: string | null;
}

export async function handleVotes(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET')  return getVotes(request, env);
  if (request.method === 'POST') return castVote(request, env);
  return error('Method not allowed', 405);
}

// ── GET /api/votes ─────────────────────────────────────────────────────────

async function getVotes(request: Request, env: Env): Promise<Response> {
  const nowUtc  = new Date();
  const friday  = getNextFridayUtc(nowUtc);
  const { weekKey } = computeRoundTimings(friday);

  // Identify caller for personalisation (optional — no error if missing)
  const url      = new URL(request.url);
  const deviceId = url.searchParams.get('deviceId');
  const ip       = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? '';
  const deviceHash = deviceId
    ? await sha256(deviceId)
    : ip ? await sha256(ip) : null;

  // Vote counts per pub
  const voteCounts = await env.DB.prepare(`
    SELECT v.pubId, p.name AS pubName, COUNT(*) AS count
    FROM votes v
    JOIN pubs p ON v.pubId = p.id
    WHERE v.weekKey = ?
    GROUP BY v.pubId, p.name
  `).bind(weekKey).all<VoteRow>();

  // Vetoes for this week
  const vetoes = await env.DB.prepare(`
    SELECT pubId FROM vetoes WHERE weekKey = ?
  `).bind(weekKey).all<{ pubId: string }>();

  // All active pubs for the ballot
  const pubs = await env.DB.prepare(
    'SELECT id, name, address FROM pubs WHERE active = 1 ORDER BY name ASC'
  ).all<PubRow>();

  const voteMap  = new Map(voteCounts.results.map(v => [v.pubId, v.count]));
  const vetoedSet = new Set(vetoes.results.map(v => v.pubId));

  // Caller's own vote + veto this month
  let userVote:        string | null = null;
  let userVetoedPubId: string | null = null;
  let userVetoUsed = false;

  if (deviceHash) {
    const uv = await env.DB.prepare(
      'SELECT pubId FROM votes WHERE weekKey = ? AND deviceHash = ?'
    ).bind(weekKey, deviceHash).first<{ pubId: string }>();
    userVote = uv?.pubId ?? null;

    const monthKey = nowUtc.toISOString().slice(0, 7); // YYYY-MM
    const uvo = await env.DB.prepare(
      'SELECT pubId FROM vetoes WHERE monthKey = ? AND deviceHash = ?'
    ).bind(monthKey, deviceHash).first<{ pubId: string }>();
    userVetoedPubId = uvo?.pubId ?? null;
    userVetoUsed    = uvo != null;
  }

  const totalVotes = voteCounts.results.reduce((s, v) => s + v.count, 0);

  return json({
    weekKey,
    pubs: pubs.results.map(p => ({
      id:     p.id,
      name:   p.name,
      address: p.address,
      votes:  voteMap.get(p.id) ?? 0,
      vetoed: vetoedSet.has(p.id),
    })),
    totalVotes,
    userVote,
    userVetoedPubId,
    userVetoUsed,
  });
}

// ── POST /api/votes ────────────────────────────────────────────────────────

async function castVote(request: Request, env: Env): Promise<Response> {
  let body: VoteBody;
  try {
    body = (await request.json()) as VoteBody;
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

  // Voting closes once the pub is announced
  const round = await env.DB.prepare(
    'SELECT status FROM rounds WHERE weekKey = ?'
  ).bind(weekKey).first<{ status: string }>();
  if (round && round.status !== 'scheduled') {
    return error('Voting has closed — the pub has already been announced', 409);
  }

  const deviceHash = await sha256(deviceId);

  // Upsert — changing your vote is allowed
  await env.DB.prepare(`
    INSERT INTO votes (id, weekKey, pubId, deviceHash)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(weekKey, deviceHash) DO UPDATE SET pubId = excluded.pubId
  `).bind(crypto.randomUUID(), weekKey, pubId, deviceHash).run();

  return json({ ok: true, weekKey, pubId });
}
