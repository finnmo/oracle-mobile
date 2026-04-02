import { describe, it, expect } from 'vitest';
import { sha256 } from './auth';

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
