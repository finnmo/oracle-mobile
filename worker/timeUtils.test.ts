import { describe, it, expect } from 'vitest';
import {
  perthYmd,
  perthWeekday,
  addPerthDays,
  utcYmdPlusOneDay,
  computeRoundTimingsFromAnchorYmd,
  isPotentialRoundAnchorPerthYmd,
  tryResolveCronAnnounceAnchorPerthYmd,
  getVoteAndRoundAnchorPerthYmd,
  getNextRoundTimings,
} from './timeUtils';

// ── perthYmd ────────────────────────────────────────────────────────────────

describe('perthYmd', () => {
  it('returns Perth date for a UTC midnight that is already the next day in Perth', () => {
    // 2026-03-26 22:00 UTC = 2026-03-27 06:00 Perth
    expect(perthYmd(new Date('2026-03-26T22:00:00Z'))).toBe('2026-03-27');
  });

  it('returns same UTC date when Perth has not crossed midnight', () => {
    // 2026-03-27 02:00 UTC = 2026-03-27 10:00 Perth
    expect(perthYmd(new Date('2026-03-27T02:00:00Z'))).toBe('2026-03-27');
  });

  it('handles year boundary', () => {
    // 2026-12-31 20:00 UTC = 2027-01-01 04:00 Perth
    expect(perthYmd(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });
});

// ── perthWeekday ────────────────────────────────────────────────────────────

describe('perthWeekday', () => {
  it('returns 5 (Friday) for a Perth Friday', () => {
    // 2026-04-03 is a Friday; 03:00 UTC = 11:00 Perth
    expect(perthWeekday(new Date('2026-04-03T03:00:00Z'))).toBe(5);
  });

  it('returns 4 (Thursday) for a Perth Thursday', () => {
    // 2026-04-02 is a Thursday; 03:00 UTC = 11:00 Perth
    expect(perthWeekday(new Date('2026-04-02T03:00:00Z'))).toBe(4);
  });

  it('handles late UTC where Perth day is one ahead', () => {
    // 2026-04-02 Thursday 20:00 UTC = 2026-04-03 Friday 04:00 Perth
    expect(perthWeekday(new Date('2026-04-02T20:00:00Z'))).toBe(5);
  });
});

// ── addPerthDays ────────────────────────────────────────────────────────────

describe('addPerthDays', () => {
  it('adds days within a month', () => {
    expect(addPerthDays('2026-03-10', 5)).toBe('2026-03-15');
  });

  it('crosses month boundary', () => {
    expect(addPerthDays('2026-01-30', 3)).toBe('2026-02-02');
  });

  it('crosses year boundary', () => {
    expect(addPerthDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('subtracts days', () => {
    expect(addPerthDays('2026-03-03', -5)).toBe('2026-02-26');
  });
});

// ── utcYmdPlusOneDay ────────────────────────────────────────────────────────

describe('utcYmdPlusOneDay', () => {
  it('next day within a month', () => {
    expect(utcYmdPlusOneDay('2026-04-02')).toBe('2026-04-03');
  });

  it('crosses month boundary', () => {
    expect(utcYmdPlusOneDay('2026-01-31')).toBe('2026-02-01');
  });

  it('crosses year boundary', () => {
    expect(utcYmdPlusOneDay('2026-12-31')).toBe('2027-01-01');
  });
});

// ── computeRoundTimingsFromAnchorYmd ────────────────────────────────────────

describe('computeRoundTimingsFromAnchorYmd', () => {
  it('produces correct UTC timestamps for a Friday anchor', () => {
    const t = computeRoundTimingsFromAnchorYmd('2026-03-27');
    expect(t.weekKey).toBe('2026-03-27');
    expect(t.announceAtUtc).toBe('2026-03-27T03:45:00.000Z');
    expect(t.meetAtUtc).toBe('2026-03-27T04:00:00.000Z');
    expect(t.rateOpenAtUtc).toBe('2026-03-27T04:20:00.000Z');
    expect(t.rateCloseAtUtc).toBe('2026-03-28T15:59:00.000Z');
  });

  it('produces correct UTC timestamps for a Thursday anchor (PH week)', () => {
    // Good Friday 2026 = 2026-04-03 (PH), so anchor is Thursday 2026-04-02
    const t = computeRoundTimingsFromAnchorYmd('2026-04-02');
    expect(t.weekKey).toBe('2026-04-02');
    expect(t.announceAtUtc).toBe('2026-04-02T03:45:00.000Z');
    expect(t.meetAtUtc).toBe('2026-04-02T04:00:00.000Z');
    expect(t.rateOpenAtUtc).toBe('2026-04-02T04:20:00.000Z');
    expect(t.rateCloseAtUtc).toBe('2026-04-03T15:59:00.000Z');
  });
});

// ── isPotentialRoundAnchorPerthYmd ──────────────────────────────────────────

describe('isPotentialRoundAnchorPerthYmd', () => {
  it('returns true for a normal Friday (not a PH)', () => {
    expect(isPotentialRoundAnchorPerthYmd('2026-03-27')).toBe(true);
  });

  it('returns false for Good Friday 2026 (a public holiday)', () => {
    expect(isPotentialRoundAnchorPerthYmd('2026-04-03')).toBe(false);
  });

  it('returns true for Thursday before Good Friday 2026', () => {
    expect(isPotentialRoundAnchorPerthYmd('2026-04-02')).toBe(true);
  });

  it('returns false for a normal Thursday (Friday is not a PH)', () => {
    expect(isPotentialRoundAnchorPerthYmd('2026-03-26')).toBe(false);
  });

  it('returns false for a Wednesday', () => {
    expect(isPotentialRoundAnchorPerthYmd('2026-04-01')).toBe(false);
  });

  it('returns true for New Year Friday 2027 shifted to Thursday 2026-12-31', () => {
    // 2027-01-01 is a Friday AND a PH, so anchor shifts to Thu 2026-12-31
    expect(isPotentialRoundAnchorPerthYmd('2026-12-31')).toBe(true);
    expect(isPotentialRoundAnchorPerthYmd('2027-01-01')).toBe(false);
  });
});

// ── tryResolveCronAnnounceAnchorPerthYmd ────────────────────────────────────

describe('tryResolveCronAnnounceAnchorPerthYmd', () => {
  it('returns Thursday anchor when cron fires Thursday before Good Friday 2026', () => {
    // Thu 2026-04-02 03:45 UTC = Thu 11:45 Perth
    const now = new Date('2026-04-02T03:45:00Z');
    expect(tryResolveCronAnnounceAnchorPerthYmd(now)).toBe('2026-04-02');
  });

  it('returns null on Good Friday 2026 (Friday is a PH, skip)', () => {
    const now = new Date('2026-04-03T03:45:00Z');
    expect(tryResolveCronAnnounceAnchorPerthYmd(now)).toBeNull();
  });

  it('returns the Friday anchor on a normal Friday', () => {
    // Fri 2026-03-27 03:45 UTC
    const now = new Date('2026-03-27T03:45:00Z');
    expect(tryResolveCronAnnounceAnchorPerthYmd(now)).toBe('2026-03-27');
  });

  it('returns null on a normal Thursday (Friday is not a PH)', () => {
    const now = new Date('2026-03-26T03:45:00Z');
    expect(tryResolveCronAnnounceAnchorPerthYmd(now)).toBeNull();
  });

  it('returns null on a Wednesday', () => {
    const now = new Date('2026-04-01T03:45:00Z');
    expect(tryResolveCronAnnounceAnchorPerthYmd(now)).toBeNull();
  });
});

// ── getVoteAndRoundAnchorPerthYmd ───────────────────────────────────────────

describe('getVoteAndRoundAnchorPerthYmd', () => {
  it('targets this Friday on a mid-week Tuesday', () => {
    // Tue 2026-03-24 10:00 UTC → next anchor is Fri 2026-03-27
    expect(getVoteAndRoundAnchorPerthYmd(new Date('2026-03-24T10:00:00Z'))).toBe('2026-03-27');
  });

  it('targets Thursday when the upcoming Friday is a PH', () => {
    // Mon 2026-03-30 10:00 UTC → next anchor is Thu 2026-04-02 (Good Friday 2026-04-03 is PH)
    expect(getVoteAndRoundAnchorPerthYmd(new Date('2026-03-30T10:00:00Z'))).toBe('2026-04-02');
  });

  it('returns current round anchor during the active rating window', () => {
    // Fri 2026-03-27 05:00 UTC = rating_open window (rateOpen is 04:20, close is 2026-03-28 15:59)
    expect(getVoteAndRoundAnchorPerthYmd(new Date('2026-03-27T05:00:00Z'))).toBe('2026-03-27');
  });

  it('advances to next week after Saturday close', () => {
    // Sat 2026-03-28 16:00 UTC → past rateClose (15:59), targets next week Fri 2026-04-02 (Thu anchor due to PH)
    expect(getVoteAndRoundAnchorPerthYmd(new Date('2026-03-28T16:00:00Z'))).toBe('2026-04-02');
  });
});

// ── getNextRoundTimings ─────────────────────────────────────────────────────

describe('getNextRoundTimings', () => {
  it('returns this week timings on a mid-week day', () => {
    const t = getNextRoundTimings(new Date('2026-03-24T10:00:00Z'));
    expect(t.weekKey).toBe('2026-03-27');
  });

  it('returns Thursday-anchor timings during a PH week', () => {
    const t = getNextRoundTimings(new Date('2026-03-30T10:00:00Z'));
    expect(t.weekKey).toBe('2026-04-02');
    expect(t.announceAtUtc).toBe('2026-04-02T03:45:00.000Z');
  });

  it('returns this round while still in rating window', () => {
    const t = getNextRoundTimings(new Date('2026-03-27T10:00:00Z'));
    expect(t.weekKey).toBe('2026-03-27');
  });

  it('advances past a closed round on the same Saturday', () => {
    // Sat 2026-03-28 16:00 UTC is past the close (15:59)
    const t = getNextRoundTimings(new Date('2026-03-28T16:00:00Z'));
    expect(t.weekKey).not.toBe('2026-03-27');
  });
});

// ── Additional edge cases ───────────────────────────────────────────────────

describe('perthYmd edge cases', () => {
  it('handles UTC midnight exactly', () => {
    // 2026-06-05 00:00 UTC = 2026-06-05 08:00 Perth
    expect(perthYmd(new Date('2026-06-05T00:00:00Z'))).toBe('2026-06-05');
  });

  it('handles 15:59 UTC (23:59 Perth — same day)', () => {
    expect(perthYmd(new Date('2026-06-05T15:59:00Z'))).toBe('2026-06-05');
  });

  it('handles 16:00 UTC (00:00 next day Perth)', () => {
    expect(perthYmd(new Date('2026-06-05T16:00:00Z'))).toBe('2026-06-06');
  });
});

describe('addPerthDays edge cases', () => {
  it('adding zero days returns the same date', () => {
    expect(addPerthDays('2026-07-15', 0)).toBe('2026-07-15');
  });

  it('handles leap year (2028) February boundary', () => {
    expect(addPerthDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addPerthDays('2028-02-29', 1)).toBe('2028-03-01');
  });
});

describe('computeRoundTimingsFromAnchorYmd field consistency', () => {
  it('rateCloseAtUtc is always one calendar day after the anchor', () => {
    const t = computeRoundTimingsFromAnchorYmd('2026-05-15');
    expect(t.rateCloseAtUtc).toContain('2026-05-16');
  });

  it('announceAtUtc < meetAtUtc < rateOpenAtUtc < rateCloseAtUtc', () => {
    const t = computeRoundTimingsFromAnchorYmd('2026-06-12');
    expect(t.announceAtUtc < t.meetAtUtc).toBe(true);
    expect(t.meetAtUtc < t.rateOpenAtUtc).toBe(true);
    expect(t.rateOpenAtUtc < t.rateCloseAtUtc).toBe(true);
  });
});

describe('getVoteAndRoundAnchorPerthYmd edge cases', () => {
  it('on Sunday targets the next Friday', () => {
    // Sun 2026-03-22 10:00 UTC → next anchor is Fri 2026-03-27
    expect(getVoteAndRoundAnchorPerthYmd(new Date('2026-03-22T10:00:00Z'))).toBe('2026-03-27');
  });

  it('on Monday targets the upcoming Friday', () => {
    expect(getVoteAndRoundAnchorPerthYmd(new Date('2026-03-23T10:00:00Z'))).toBe('2026-03-27');
  });

  it('during announce window targets current round', () => {
    // Fri 2026-03-27 03:50 UTC — between announce (03:45) and rateClose
    expect(getVoteAndRoundAnchorPerthYmd(new Date('2026-03-27T03:50:00Z'))).toBe('2026-03-27');
  });
});

describe('isPotentialRoundAnchorPerthYmd edge cases', () => {
  it('returns false for Saturday', () => {
    expect(isPotentialRoundAnchorPerthYmd('2026-03-28')).toBe(false);
  });

  it('returns false for Sunday', () => {
    expect(isPotentialRoundAnchorPerthYmd('2026-03-29')).toBe(false);
  });

  it('returns false for Monday', () => {
    expect(isPotentialRoundAnchorPerthYmd('2026-03-23')).toBe(false);
  });
});
