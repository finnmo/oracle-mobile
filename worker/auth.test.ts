import { describe, it, expect } from 'vitest';
import { requireAdmin, sha256 } from './auth';
import type { Env } from './types';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ADMIN_API_TOKEN: 'secret-token',
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

  it('rejects missing Authorization when Access is not configured', async () => {
    const req = new Request('https://example.com/api/admin/pubs');
    const res = await requireAdmin(req, makeEnv());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
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
