import { describe, it, expect } from 'vitest';
import { CRON_ANNOUNCE, CRON_OPEN_RATINGS, CRON_CLOSE_RATINGS } from './friday';

describe('cron trigger strings', () => {
  it('announce is 02:00 UTC (10:00 Perth) on Thu+Fri', () => {
    expect(CRON_ANNOUNCE).toBe('0 2 * * THU,FRI');
  });

  it('open ratings is 04:20 UTC (12:20 Perth) on Thu+Fri', () => {
    expect(CRON_OPEN_RATINGS).toBe('20 4 * * THU,FRI');
  });

  it('close ratings is 15:59 UTC on Fri+Sat', () => {
    expect(CRON_CLOSE_RATINGS).toBe('59 15 * * FRI,SAT');
  });

  it('uses weekday names to avoid Cloudflare 1=Sun numbering confusion', () => {
    for (const cron of [CRON_ANNOUNCE, CRON_OPEN_RATINGS, CRON_CLOSE_RATINGS]) {
      expect(cron).toMatch(/THU|FRI|SAT/);
      expect(cron).not.toMatch(/\*\s+[0-7](,[0-7])*$/);
    }
  });
});
