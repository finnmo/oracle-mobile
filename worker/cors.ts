import { Env } from './types';

export const DEFAULT_SITE_ORIGIN = 'https://picker.example.com';

export function siteOrigin(env: Env): string {
  const raw = env.SITE_ORIGIN?.trim();
  if (!raw) return DEFAULT_SITE_ORIGIN;
  return raw.replace(/\/$/, '');
}

export function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': siteOrigin(env),
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
  };
}

export function withCors(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(env))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function corsPreflight(env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}
