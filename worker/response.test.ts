import { describe, it, expect } from 'vitest';
import { json, error, cors } from './response';

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

  it('includes CORS headers locked to production origin', () => {
    const res = json({});
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://oracle.finn-morris.com');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });

  it('serializes nested objects', async () => {
    const payload = { user: { name: 'Test', scores: [1, 2, 3] } };
    const res = json(payload);
    expect(await res.json()).toEqual(payload);
  });
});

describe('error()', () => {
  it('returns 400 by default with error message', async () => {
    const res = error('Bad input');
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Bad input');
  });

  it('accepts a custom status code', async () => {
    const res = error('Not found', 404);
    expect(res.status).toBe(404);
  });

  it('includes CORS headers', () => {
    const res = error('fail');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://oracle.finn-morris.com');
  });
});

describe('cors()', () => {
  it('returns 204 with no body', async () => {
    const res = cors();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('includes CORS headers', () => {
    const res = cors();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://oracle.finn-morris.com');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
  });
});
