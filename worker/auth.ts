import { jwtVerify, createRemoteJWKSet } from 'jose';
import { Env } from './types';
import { error } from './response';

export const SESSION_COOKIE = 'oracle_admin_session';
const SESSION_TTL_SEC = 60 * 60 * 24 * 14; // 14 days

/**
 * Admin auth: password session cookie, Bearer ADMIN_API_TOKEN, or optional Access JWT.
 * Returns null if authorized, otherwise an error Response.
 */
export async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
  if (verifyBearerToken(request, env)) return null;
  if (await verifySessionCookie(request, env)) return null;
  if (await verifyAccessJwt(request, env)) return null;
  return error('Unauthorized', 401);
}

export function verifyBearerToken(request: Request, env: Env): boolean {
  const token = env.ADMIN_API_TOKEN;
  if (!token) return false;

  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;

  const bearer = auth.slice(7);
  // JWT-shaped Bearer tokens are Cloudflare Access sessions, not the API token.
  if (bearer.split('.').length === 3) return false;

  return timingSafeEqualString(bearer, token);
}

export async function verifyPassword(password: string, env: Env): Promise<boolean> {
  const expected = env.ADMIN_PASSWORD;
  if (!expected || !password) return false;
  return timingSafeEqualString(password, expected);
}

export async function createSessionToken(env: Env): Promise<string | null> {
  const key = await sessionHmacKey(env);
  if (!key) return null;
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const payload = `v1.${exp}`;
  const sig = await hmacHex(key, payload);
  return `${payload}.${sig}`;
}

export async function verifySessionCookie(request: Request, env: Env): Promise<boolean> {
  const raw = getCookie(request, SESSION_COOKIE);
  if (!raw) return false;
  return verifySessionToken(raw, env);
}

export async function verifySessionToken(token: string, env: Env): Promise<boolean> {
  const key = await sessionHmacKey(env);
  if (!key) return false;

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const payload = `v1.${parts[1]}`;
  const expected = await hmacHex(key, payload);
  return timingSafeEqualString(parts[2], expected);
}

export function sessionSetCookie(token: string, requestUrl: string): string {
  const secure = requestUrl.startsWith('https:');
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SEC}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function sessionClearCookie(requestUrl: string): string {
  const secure = requestUrl.startsWith('https:');
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie') ?? '';
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookie);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function sessionHmacKey(env: Env): Promise<CryptoKey | null> {
  const material = env.ADMIN_PASSWORD || env.ADMIN_API_TOKEN;
  if (!material) return null;
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`oracle-admin-session:${material}`)
  );
  return crypto.subtle.importKey('raw', hash, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

async function hmacHex(key: CryptoKey, message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(aa.length, bb.length);
  const pa = new Uint8Array(len);
  pa.set(aa);
  const pb = new Uint8Array(len);
  pb.set(bb);
  let diff = aa.length !== bb.length ? 1 : 0;
  for (let i = 0; i < len; i++) diff |= pa[i] ^ pb[i];
  return diff === 0;
}

/** Optional: Cloudflare Access JWT when CF_ACCESS_* secrets are set. */
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

function extractAccessJwt(request: Request): string | null {
  const header =
    request.headers.get('Cf-Access-Jwt-Assertion') ??
    request.headers.get('cf-access-jwt-assertion');
  if (header) return header;

  const auth = request.headers.get('Authorization') ?? '';
  if (auth.startsWith('Bearer ')) {
    const bearer = auth.slice(7);
    if (bearer.split('.').length === 3) return bearer;
  }

  return getCookie(request, 'CF_Authorization');
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
