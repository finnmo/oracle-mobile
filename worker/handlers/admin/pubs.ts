import { Env } from '../../types';
import { json, error } from '../../response';
import { requireAdmin } from '../../auth';

interface PubRow {
  id: string;
  name: string;
  address: string | null;
  mapsUrl: string | null;
  active: number;
  createdAt: string;
}

interface AddBody {
  name?: string;
  address?: string;
  mapsUrl?: string;
}

interface UpdateBody {
  name?: string;
  address?: string | null;
  mapsUrl?: string | null;
  active?: boolean;
}

export async function handleAdminPubs(request: Request, env: Env): Promise<Response> {
  const authErr = await requireAdmin(request, env);
  if (authErr) return authErr;

  const url    = new URL(request.url);
  const parts  = url.pathname.split('/'); // ['','api','admin','pubs', pubId?]
  const pubId  = parts[4] ?? null;
  const method = request.method;

  if (!pubId) {
    if (method === 'GET')  return listPubs(env);
    if (method === 'POST') return addPub(request, env);
    return error('Method not allowed', 405);
  }

  if (method === 'PATCH')  return updatePub(request, env, pubId);
  if (method === 'DELETE') return deletePub(env, pubId);
  return error('Method not allowed', 405);
}

// ─── List ─────────────────────────────────────────────────────────────────────

async function listPubs(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT id, name, address, mapsUrl, active, createdAt FROM pubs ORDER BY active DESC, name ASC'
  ).all<PubRow>();

  return json({ pubs: result.results });
}

// ─── Add ──────────────────────────────────────────────────────────────────────

async function addPub(request: Request, env: Env): Promise<Response> {
  let body: AddBody;
  try {
    body = (await request.json()) as AddBody;
  } catch {
    return error('Invalid JSON', 400);
  }

  if (!body.name?.trim()) return error('name is required', 400);

  const id = `pub-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

  await env.DB.prepare(
    'INSERT INTO pubs (id, name, address, mapsUrl, active) VALUES (?, ?, ?, ?, 1)'
  ).bind(id, body.name.trim(), body.address ?? null, body.mapsUrl ?? null).run();

  const pub = await env.DB.prepare('SELECT * FROM pubs WHERE id = ?').bind(id).first<PubRow>();
  return json({ pub }, 201);
}

// ─── Update ───────────────────────────────────────────────────────────────────

async function updatePub(request: Request, env: Env, pubId: string): Promise<Response> {
  const existing = await env.DB.prepare(
    'SELECT id FROM pubs WHERE id = ?'
  ).bind(pubId).first<{ id: string }>();
  if (!existing) return error('Pub not found', 404);

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return error('Invalid JSON', 400);
  }

  const clauses: string[] = [];
  const params: unknown[]  = [];

  if (body.name !== undefined) {
    if (!body.name.trim()) return error('name cannot be empty', 400);
    clauses.push('name = ?');
    params.push(body.name.trim());
  }
  if (body.address !== undefined) {
    clauses.push('address = ?');
    params.push(body.address || null);
  }
  if (body.mapsUrl !== undefined) {
    clauses.push('mapsUrl = ?');
    params.push(body.mapsUrl || null);
  }
  if (body.active !== undefined) {
    clauses.push('active = ?');
    params.push(body.active ? 1 : 0);
  }

  if (clauses.length === 0) return error('No fields to update', 400);

  params.push(pubId);
  await env.DB.prepare(
    `UPDATE pubs SET ${clauses.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  const pub = await env.DB.prepare(
    'SELECT * FROM pubs WHERE id = ?'
  ).bind(pubId).first<PubRow>();
  return json({ pub });
}

// ─── Delete / deactivate ──────────────────────────────────────────────────────

async function deletePub(env: Env, pubId: string): Promise<Response> {
  const existing = await env.DB.prepare(
    'SELECT id FROM pubs WHERE id = ?'
  ).bind(pubId).first<{ id: string }>();
  if (!existing) return error('Pub not found', 404);

  // If the pub appears in any round, soft-delete (deactivate) to preserve history
  const usedInRound = await env.DB.prepare(
    'SELECT id FROM rounds WHERE chosenPubId = ? LIMIT 1'
  ).bind(pubId).first<{ id: string }>();

  if (usedInRound) {
    await env.DB.prepare('UPDATE pubs SET active = 0 WHERE id = ?').bind(pubId).run();
    return json({ ok: true, action: 'deactivated' });
  }

  await env.DB.prepare('DELETE FROM pubs WHERE id = ?').bind(pubId).run();
  return json({ ok: true, action: 'deleted' });
}
