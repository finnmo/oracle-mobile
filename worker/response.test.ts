import { describe, it, expect } from 'vitest';
import { json, error } from './response';
import { corsHeaders, corsPreflight, withCors, siteOrigin, DEFAULT_SITE_ORIGIN } from './cors';
import type { Env } from './types';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ADMIN_API_TOKEN: 'secret',
    ASSETS: {} as Fetcher,
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  };
}

describe('json()', () => {
  it('returns 200 with JSON body by default', async () => {
    const res = json({ ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('accepts a custom status code', async () => {
    const res = json({ items: [] }, 201);
    expect(res.status).toBe(201);
  });

  it('does not include CORS headers (applied in router)', () => {
    const res = json({});
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('error()', () => {
  it('returns 400 by default with error message', async () => {
    const res = error('Bad input');
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Bad input');
  });
});

describe('cors', () => {
  it('defaults to oracle production origin', () => {
    expect(siteOrigin(makeEnv())).toBe(DEFAULT_SITE_ORIGIN);
  });

  it('uses SITE_ORIGIN from env', () => {
    expect(siteOrigin(makeEnv({ SITE_ORIGIN: 'https://picker.example.com/' }))).toBe(
      'https://picker.example.com'
    );
  });

  it('withCors adds headers', () => {
    const res = withCors(json({ ok: true }), makeEnv({ SITE_ORIGIN: 'https://picker.example.com' }));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://picker.example.com');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('corsPreflight returns 204', () => {
    const res = corsPreflight(makeEnv());
    expect(res.status).toBe(204);
    expect(corsHeaders(makeEnv())['Access-Control-Allow-Origin']).toBe(DEFAULT_SITE_ORIGIN);
  });
});
