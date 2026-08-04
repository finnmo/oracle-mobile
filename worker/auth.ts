import { jwtVerify, createRemoteJWKSet } from 'jose';
import { Env } from './types';
import { error } from './response';

/**
 * Admin auth: accept either Cloudflare Access JWT or Bearer ADMIN_API_TOKEN.
 * Returns null if authorized, otherwise an error Response.
 */
export async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
  if (await verifyBearerToken(request, env)) return null;
  if (await verifyAccessJwt(request, env)) return null;
  return error('Unauthorized', 401);
}

function verifyBearerToken(request: Request, env: Env): boolean {
  const token = env.ADMIN_API_TOKEN;
  if (!token) return false;

  const auth = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${token}`;

  // Constant-time comparison to prevent timing attacks
  const a = new TextEncoder().encode(auth);
  const b = new TextEncoder().encode(expected);
  const len = Math.max(a.length, b.length);
  const pa = new Uint8Array(len); pa.set(a);
  const pb = new Uint8Array(len); pb.set(b);

  let diff = a.length !== b.length ? 1 : 0;
  for (let i = 0; i < len; i++) diff |= pa[i] ^ pb[i];
  return diff === 0;
}

async function verifyAccessJwt(request: Request, env: Env): Promise<boolean> {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.replace(/\/$/, '');
  const aud = env.CF_ACCESS_AUD;
  if (!teamDomain || !aud) return false;

  const jwt = extractAccessJwt(request);
  if (!jwt) return false;

  try {
    const JWKS = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    await jwtVerify(jwt, JWKS, {
      issuer: teamDomain,
      audience: aud,
    });
    return true;
  } catch (err) {
    console.error('[auth] Access JWT verification failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/** Prefer Access edge header; fall back to CF_Authorization cookie (SPA API calls). */
function extractAccessJwt(request: Request): string | null {
  const header =
    request.headers.get('Cf-Access-Jwt-Assertion') ??
    request.headers.get('cf-access-jwt-assertion');
  if (header) return header;

  const cookie = request.headers.get('Cookie') ?? '';
  const match = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
