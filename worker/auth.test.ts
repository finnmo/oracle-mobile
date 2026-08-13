import { describe, it, expect } from 'vitest';
import {
  requireAdmin,
  sha256,
  createSessionToken,
  verifySessionToken,
  sessionSetCookie,
  SESSION_COOKIE,
} from './auth';
import type { Env } from './types';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ADMIN_API_TOKEN: 'secret-token',
    ADMIN_PASSWORD: 'correct-horse',
    ASSETS: {} as Fetcher,
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  };
}

describe('requireAdmin Bearer', () => {
  it('allows a matching Bearer token', async () => {
    const req = new Request('https://example.com/api/admin/pubs', {
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(await requireAdmin(req, makeEnv())).toBeNull();
  });

  it('rejects a wrong Bearer token', async () => {
    const req = new Request('https://example.com/api/admin/pubs', {
      headers: { Authorization: 'Bearer wrong' },
    });
    const res = await requireAdmin(req, makeEnv());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it('rejects missing Authorization when no session', async () => {
    const req = new Request('https://example.com/api/admin/pubs');
    const res = await requireAdmin(req, makeEnv());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });
});

describe('requireAdmin session cookie', () => {
  it('allows a valid session cookie', async () => {
    const env = makeEnv();
    const token = await createSessionToken(env);
    expect(token).toBeTruthy();
    const req = new Request('https://example.com/api/admin/pubs', {
      headers: { Cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(await requireAdmin(req, env)).toBeNull();
  });

  it('rejects a tampered session cookie', async () => {
    const env = makeEnv();
    const token = await createSessionToken(env);
    const tampered = token!.slice(0, -4) + 'dead';
    const req = new Request('https://example.com/api/admin/pubs', {
      headers: { Cookie: `${SESSION_COOKIE}=${tampered}` },
    });
    const res = await requireAdmin(req, env);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it('verifySessionToken rejects expired tokens', async () => {
    const env = makeEnv();
    const ok = await verifySessionToken('v1.1.abcdef', env);
    expect(ok).toBe(false);
  });
});

describe('sessionSetCookie', () => {
  it('adds Secure on https', () => {
    const header = sessionSetCookie('v1.1.abc', 'https://example.com/admin');
    expect(header).toContain('Secure');
    expect(header).toContain('HttpOnly');
    expect(header).toContain(SESSION_COOKIE);
  });

  it('omits Secure on http (local wrangler)', () => {
    const header = sessionSetCookie('v1.1.abc', 'http://localhost:8787/admin');
    expect(header).not.toContain('Secure');
  });
});

describe('sha256()', () => {
  it('returns a 64-character lowercase hex string', async () => {
    const hash = await sha256('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a known hash for "hello"', async () => {
    const hash = await sha256('hello');
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('produces different hashes for different inputs', async () => {
    const a = await sha256('device-123');
    const b = await sha256('device-456');
    expect(a).not.toBe(b);
  });

  it('produces the same hash for the same input', async () => {
    const a = await sha256('consistent');
    const b = await sha256('consistent');
    expect(a).toBe(b);
  });

  it('handles empty string', async () => {
    const hash = await sha256('');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('handles unicode input', async () => {
    const hash = await sha256('🍺🍗');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
