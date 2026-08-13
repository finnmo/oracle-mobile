import { describe, expect, it } from 'vitest';
import {
  buildCronBundle,
  deriveRelatedTimes,
  formatScheduleSummary,
  isValidIanaTimeZone,
  parseHhmmStrict,
  parseWeekdayStrict,
} from './schedule-lib.mjs';
import {
  extractWorkersDevUrl,
  isCronLimitError,
  isIncompleteWorkersDevOrigin,
  isValidDatabaseId,
  isValidOptionalPassword,
  isValidResourceName,
  isValidSiteOrigin,
  normalizeSiteOrigin,
  parseYesNo,
  setCronBlock,
  setTomlVar,
  shouldSyncSiteOriginToWorkersDev,
} from './onboard-lib.mjs';

describe('deriveRelatedTimes', () => {
  it('announcing at 09:00 → meet/reviews around noon', () => {
    expect(deriveRelatedTimes('09:00')).toEqual({
      meetLocalTime: '12:00',
      rateOpenLocalTime: '12:20',
      rateCloseLocalTime: '23:59',
    });
  });

  it('announcing at 10:00 (product default) → meet 12:00', () => {
    expect(deriveRelatedTimes('10:00')).toEqual({
      meetLocalTime: '12:00',
      rateOpenLocalTime: '12:20',
      rateCloseLocalTime: '23:59',
    });
  });

  it('afternoon announce → meet +2 hours', () => {
    expect(deriveRelatedTimes('14:00')).toEqual({
      meetLocalTime: '16:00',
      rateOpenLocalTime: '16:20',
      rateCloseLocalTime: '23:59',
    });
  });
});

describe('buildCronBundle weekday linkage', () => {
  it('Thursday announce → ratings close Friday', () => {
    const crons = buildCronBundle({
      timezone: 'Australia/Perth',
      announceWeekday: 4, // Thursday
      announceLocalTime: '09:00',
      rateOpenLocalTime: '12:20',
      rateCloseLocalTime: '23:59',
      holidayShift: 'none',
    });
    expect(crons.announce).toMatch(/THU$/);
    expect(crons.openRatings).toMatch(/THU$/);
    expect(crons.closeRatings).toMatch(/FRI$/);
  });

  it('Friday announce → ratings close Saturday', () => {
    const crons = buildCronBundle({
      timezone: 'Australia/Perth',
      announceWeekday: 5,
      announceLocalTime: '10:00',
      rateOpenLocalTime: '12:20',
      rateCloseLocalTime: '23:59',
      holidayShift: 'none',
    });
    expect(crons.closeRatings).toMatch(/SAT$/);
  });
});

describe('formatScheduleSummary', () => {
  it('shows next-day close', () => {
    const text = formatScheduleSummary({
      timezone: 'Australia/Perth',
      announceWeekday: 4,
      announceLocalTime: '09:00',
      meetLocalTime: '12:00',
      rateOpenLocalTime: '12:20',
      rateCloseLocalTime: '23:59',
    });
    expect(text).toContain('Thursday 09:00');
    expect(text).toContain('close Friday 23:59');
  });
});

describe('strict schedule parsers', () => {
  it('rejects invalid weekdays instead of falling back', () => {
    expect(parseWeekdayStrict('Friday')).toBe(5);
    expect(parseWeekdayStrict('funday')).toBeNull();
    expect(parseWeekdayStrict('')).toBeNull();
  });

  it('rejects invalid times', () => {
    expect(parseHhmmStrict('9:00')).toBe('09:00');
    expect(parseHhmmStrict('24:00')).toBeNull();
    expect(parseHhmmStrict('10am')).toBeNull();
    expect(parseHhmmStrict('')).toBeNull();
  });

  it('validates IANA timezones', () => {
    expect(isValidIanaTimeZone('Australia/Perth')).toBe(true);
    expect(isValidIanaTimeZone('Not/AZone')).toBe(false);
    expect(isValidIanaTimeZone('')).toBe(false);
  });
});

describe('input validators', () => {
  it('validates worker/db names', () => {
    expect(isValidResourceName('my-weekly-picker')).toBe(true);
    expect(isValidResourceName('oracle')).toBe(true);
    expect(isValidResourceName('-bad')).toBe(false);
    expect(isValidResourceName('bad-')).toBe(false);
    expect(isValidResourceName('has space')).toBe(false);
  });

  it('validates site origins', () => {
    expect(isValidSiteOrigin('https://my-weekly-picker.workers.dev')).toBe(true);
    expect(isValidSiteOrigin('picker.example.com')).toBe(true);
    expect(normalizeSiteOrigin('picker.example.com')).toBe('https://picker.example.com');
    expect(isValidSiteOrigin('not a url')).toBe(false);
  });

  it('validates database UUIDs', () => {
    expect(isValidDatabaseId('d60055ce-335a-4afa-b6ad-d4c6da7fde9c')).toBe(true);
    expect(isValidDatabaseId('nope')).toBe(false);
  });

  it('parses yes/no strictly', () => {
    expect(parseYesNo('', true)).toEqual({ ok: true, value: true });
    expect(parseYesNo('yes', false)).toEqual({ ok: true, value: true });
    expect(parseYesNo('n', true)).toEqual({ ok: true, value: false });
    expect(parseYesNo('maybe', true).ok).toBe(false);
  });

  it('validates optional passwords', () => {
    expect(isValidOptionalPassword('')).toBe(true);
    expect(isValidOptionalPassword('abcd')).toBe(true);
    expect(isValidOptionalPassword('ab')).toBe(false);
    expect(isValidOptionalPassword('  spaced  ')).toBe(false);
  });
});

describe('isIncompleteWorkersDevOrigin', () => {
  it('flags missing account subdomain', () => {
    expect(isIncompleteWorkersDevOrigin('https://my-weekly-picker.workers.dev', 'my-weekly-picker')).toBe(
      true
    );
  });

  it('accepts full workers.dev URL', () => {
    expect(
      isIncompleteWorkersDevOrigin(
        'https://my-weekly-picker.example-account.workers.dev',
        'my-weekly-picker'
      )
    ).toBe(false);
  });

  it('does not treat custom domains as incomplete', () => {
    expect(isIncompleteWorkersDevOrigin('https://picker.example.com', 'oracle')).toBe(false);
    expect(isIncompleteWorkersDevOrigin('https://picker.example.com', 'my-weekly-picker')).toBe(false);
  });
});

describe('shouldSyncSiteOriginToWorkersDev', () => {
  const live = 'https://my-weekly-picker.example-account.workers.dev';

  it('syncs placeholder workers.dev to live URL (non-sandbox path)', () => {
    expect(
      shouldSyncSiteOriginToWorkersDev('https://my-weekly-picker.workers.dev', live, 'my-weekly-picker')
    ).toBe(true);
  });

  it('never overwrites a custom domain with workers.dev', () => {
    expect(shouldSyncSiteOriginToWorkersDev('https://picker.example.com', live, 'my-weekly-picker')).toBe(
      false
    );
    expect(shouldSyncSiteOriginToWorkersDev('https://picker.example.com', live, 'oracle')).toBe(false);
  });

  it('no-ops when already correct', () => {
    expect(shouldSyncSiteOriginToWorkersDev(live, live, 'my-weekly-picker')).toBe(false);
  });
});

describe('extractWorkersDevUrl', () => {
  it('prefers the matching worker URL from wrangler output', () => {
    const text = `
Deployed my-weekly-picker triggers
  https://my-weekly-picker.example-account.workers.dev
Current Version ID: abc
`;
    expect(extractWorkersDevUrl(text, 'my-weekly-picker')).toBe(
      'https://my-weekly-picker.example-account.workers.dev'
    );
  });
});

describe('isCronLimitError', () => {
  it('detects Free-plan cron limit (non-sandbox fallback)', () => {
    const sample =
      'This account has reached the Workers Free limit of 5 cron triggers per account. [code: 10072]';
    expect(isCronLimitError(sample)).toBe(true);
  });

  it('ignores unrelated failures', () => {
    expect(isCronLimitError('Authentication error')).toBe(false);
  });
});

describe('toml helpers', () => {
  it('updates SITE_ORIGIN in place', () => {
    const next = setTomlVar(
      'name = "x"\n\n[vars]\nSITE_ORIGIN = "https://old.example"\n',
      'SITE_ORIGIN',
      'https://new.example'
    );
    expect(next).toContain('SITE_ORIGIN = "https://new.example"');
    expect(next).not.toContain('https://old.example');
  });

  it('can clear cron triggers for Free-plan fallback', () => {
    const src = `[triggers]\ncrons = [\n  "0 2 * * FRI",\n  "20 4 * * FRI",\n  "59 15 * * SAT",\n]`;
    expect(setCronBlock(src, [])).toContain('crons = []');
  });
});
