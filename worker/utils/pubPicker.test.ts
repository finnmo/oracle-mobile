import { describe, it, expect, vi } from 'vitest';
import { pickPubForWeek } from './pubPicker';
import type { Env } from '../types';

function createMockDb(data: {
  votes: { pubId: string; createdAt: string }[];
  rounds: { chosenPubId: string }[];
  vetoes: { pubId: string }[];
  pubs: { id: string; active: number }[];
}) {
  const allFn = vi.fn();
  const firstFn = vi.fn();
  const bindFn = vi.fn();

  bindFn.mockReturnValue({ first: firstFn, all: allFn });

  const prepareFn = vi.fn().mockImplementation((sql: string) => {
    const trimmed = sql.replace(/\s+/g, ' ').trim();

    if (trimmed.includes('FROM votes') && trimmed.includes('GROUP BY pubId')) {
      return {
        bind: (_wk: string) => {
          const grouped: Record<string, { count: number; minCreatedAt: string }> = {};
          for (const v of data.votes) {
            if (!grouped[v.pubId]) grouped[v.pubId] = { count: 0, minCreatedAt: v.createdAt };
            grouped[v.pubId].count++;
            if (v.createdAt < grouped[v.pubId].minCreatedAt) {
              grouped[v.pubId].minCreatedAt = v.createdAt;
            }
          }
          const sorted = Object.entries(grouped)
            .sort((a, b) => b[1].count - a[1].count || a[1].minCreatedAt.localeCompare(b[1].minCreatedAt));

          const top = sorted[0];
          return {
            first: async () =>
              top ? { pubId: top[0], voteCount: top[1].count } : null,
            all: allFn,
          };
        },
      };
    }

    if (trimmed.includes('FROM pubs') && trimmed.includes('id = ?') && trimmed.includes('active = 1')) {
      return {
        bind: (pubId: string) => ({
          first: async () => {
            const pub = data.pubs.find((p) => p.id === pubId && p.active === 1);
            return pub ? { id: pub.id } : null;
          },
          all: allFn,
        }),
      };
    }

    if (trimmed.includes('FROM rounds') && trimmed.includes('chosenPubId')) {
      return {
        bind: bindFn,
        all: async () => ({
          results: data.rounds.map((r) => ({ chosenPubId: r.chosenPubId })),
        }),
      };
    }

    if (trimmed.includes('FROM vetoes')) {
      return {
        bind: (_wk: string) => ({
          first: firstFn,
          all: async () => ({
            results: data.vetoes.map((v) => ({ pubId: v.pubId })),
          }),
        }),
      };
    }

    if (trimmed.includes('FROM pubs') && trimmed.includes('active = 1') && trimmed.includes('RANDOM()')) {
      const directFirst = async () => {
        const candidates = data.pubs.filter((p) => p.active === 1);
        return candidates.length > 0 ? { id: candidates[0].id } : null;
      };
      return {
        first: directFirst,
        bind: (...args: string[]) => {
          const excluded = new Set(args);
          const candidates = data.pubs.filter((p) => p.active === 1 && !excluded.has(p.id));
          return {
            first: async () => (candidates.length > 0 ? { id: candidates[0].id } : null),
            all: allFn,
          };
        },
      };
    }

    return { bind: bindFn, first: firstFn, all: allFn };
  });

  return { prepare: prepareFn } as unknown as D1Database;
}

function makeEnv(db: D1Database): Env {
  return { DB: db, ADMIN_API_TOKEN: 'test', ASSETS: {} as Fetcher };
}

describe('pickPubForWeek', () => {
  const weekKey = '2026-04-03';

  it('returns top-voted active pub when votes exist', async () => {
    const db = createMockDb({
      votes: [
        { pubId: 'pub-a', createdAt: '2026-04-01T01:00:00Z' },
        { pubId: 'pub-a', createdAt: '2026-04-01T02:00:00Z' },
        { pubId: 'pub-b', createdAt: '2026-04-01T01:30:00Z' },
      ],
      rounds: [],
      vetoes: [],
      pubs: [
        { id: 'pub-a', active: 1 },
        { id: 'pub-b', active: 1 },
      ],
    });

    const result = await pickPubForWeek(makeEnv(db), weekKey);
    expect(result).toBe('pub-a');
  });

  it('falls back to random when no votes exist', async () => {
    const db = createMockDb({
      votes: [],
      rounds: [],
      vetoes: [],
      pubs: [
        { id: 'pub-a', active: 1 },
        { id: 'pub-b', active: 1 },
      ],
    });

    const result = await pickPubForWeek(makeEnv(db), weekKey);
    expect(result).toBeTruthy();
    expect(['pub-a', 'pub-b']).toContain(result);
  });

  it('excludes vetoed pubs from random pool', async () => {
    const db = createMockDb({
      votes: [],
      rounds: [],
      vetoes: [{ pubId: 'pub-a' }],
      pubs: [
        { id: 'pub-a', active: 1 },
        { id: 'pub-b', active: 1 },
      ],
    });

    const result = await pickPubForWeek(makeEnv(db), weekKey);
    expect(result).toBe('pub-b');
  });

  it('excludes recent pubs from random pool', async () => {
    const db = createMockDb({
      votes: [],
      rounds: [{ chosenPubId: 'pub-a' }, { chosenPubId: 'pub-c' }, { chosenPubId: 'pub-d' }],
      vetoes: [],
      pubs: [
        { id: 'pub-a', active: 1 },
        { id: 'pub-b', active: 1 },
        { id: 'pub-c', active: 1 },
        { id: 'pub-d', active: 1 },
      ],
    });

    const result = await pickPubForWeek(makeEnv(db), weekKey);
    expect(result).toBe('pub-b');
  });

  it('falls back to any active pub when all are excluded by vetoes + recency', async () => {
    const db = createMockDb({
      votes: [],
      rounds: [{ chosenPubId: 'pub-a' }],
      vetoes: [{ pubId: 'pub-a' }],
      pubs: [{ id: 'pub-a', active: 1 }],
    });

    const result = await pickPubForWeek(makeEnv(db), weekKey);
    expect(result).toBe('pub-a');
  });

  it('returns null when no active pubs exist at all', async () => {
    const db = createMockDb({
      votes: [],
      rounds: [],
      vetoes: [],
      pubs: [],
    });

    const result = await pickPubForWeek(makeEnv(db), weekKey);
    expect(result).toBeNull();
  });

  it('breaks ties by earliest first vote', async () => {
    const db = createMockDb({
      votes: [
        { pubId: 'pub-a', createdAt: '2026-04-01T02:00:00Z' },
        { pubId: 'pub-b', createdAt: '2026-04-01T01:00:00Z' },
      ],
      rounds: [],
      vetoes: [],
      pubs: [
        { id: 'pub-a', active: 1 },
        { id: 'pub-b', active: 1 },
      ],
    });

    const result = await pickPubForWeek(makeEnv(db), weekKey);
    // Both have 1 vote; pub-b was first
    expect(result).toBe('pub-b');
  });

  it('respects vetoes but ignores recency when recency excludes all non-vetoed', async () => {
    const db = createMockDb({
      votes: [],
      rounds: [{ chosenPubId: 'pub-b' }, { chosenPubId: 'pub-c' }, { chosenPubId: 'pub-d' }],
      vetoes: [{ pubId: 'pub-a' }],
      pubs: [
        { id: 'pub-a', active: 1 },
        { id: 'pub-b', active: 1 },
        { id: 'pub-c', active: 1 },
        { id: 'pub-d', active: 1 },
      ],
    });

    const result = await pickPubForWeek(makeEnv(db), weekKey);
    // All non-vetoed (b, c, d) are recent, so fallback ignores recency but keeps veto
    // Pool: b, c, d (not a which is vetoed)
    expect(result).toBeTruthy();
    expect(result).not.toBe('pub-a');
  });

  it('top-voted pub wins even if it is recent or vetoed', async () => {
    const db = createMockDb({
      votes: [
        { pubId: 'pub-a', createdAt: '2026-04-01T01:00:00Z' },
        { pubId: 'pub-a', createdAt: '2026-04-01T02:00:00Z' },
      ],
      rounds: [{ chosenPubId: 'pub-a' }],
      vetoes: [{ pubId: 'pub-a' }],
      pubs: [
        { id: 'pub-a', active: 1 },
        { id: 'pub-b', active: 1 },
      ],
    });

    const result = await pickPubForWeek(makeEnv(db), weekKey);
    expect(result).toBe('pub-a');
  });

  it('ignores votes for inactive pubs and falls to random', async () => {
    const db = createMockDb({
      votes: [
        { pubId: 'pub-inactive', createdAt: '2026-04-01T01:00:00Z' },
      ],
      rounds: [],
      vetoes: [],
      pubs: [
        { id: 'pub-inactive', active: 0 },
        { id: 'pub-active', active: 1 },
      ],
    });

    const result = await pickPubForWeek(makeEnv(db), weekKey);
    expect(result).toBe('pub-active');
  });
});
