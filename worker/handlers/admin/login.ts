import { Env } from '../../types';
import { json, error } from '../../response';
import {
  createSessionToken,
  sessionClearCookie,
  sessionSetCookie,
  verifyPassword,
} from '../../auth';

interface LoginBody {
  password?: string;
}

export async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return error('Method not allowed', 405);

  // Soft rate limit by IP when available
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  try {
    const limited = await env.RATE_LIMITER.limit({ key: `admin-login:${ip}` });
    if (!limited.success) return error('Too many login attempts — try again shortly', 429);
  } catch {
    // Rate limiter optional in local tests
  }

  if (!env.ADMIN_PASSWORD) {
    return error('Admin password is not configured (set ADMIN_PASSWORD secret)', 503);
  }

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return error('Invalid JSON body', 400);
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (!(await verifyPassword(password, env))) {
    return error('Wrong password', 401);
  }

  const token = await createSessionToken(env);
  if (!token) return error('Could not create session', 500);

  const res = json({ ok: true });
  const headers = new Headers(res.headers);
  headers.append('Set-Cookie', sessionSetCookie(token, request.url));
  return new Response(res.body, { status: 200, headers });
}

export async function handleAdminLogout(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return error('Method not allowed', 405);
  void env;
  const res = json({ ok: true });
  const headers = new Headers(res.headers);
  headers.append('Set-Cookie', sessionClearCookie(request.url));
  return new Response(res.body, { status: 200, headers });
}
