import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SCHEDULE,
  buildCronBundle,
  getSchedule,
  zonedLocalToUtc,
  addMinutesToHhmm,
} from './schedule';
import { computeRoundTimingsFromAnchorYmd, isPotentialRoundAnchorYmd } from './timeUtils';

describe('getSchedule', () => {
  it('defaults to Perth Friday ritual', () => {
    expect(getSchedule({})).toEqual(DEFAULT_SCHEDULE);
  });

  it('parses weekday names and times', () => {
    const s = getSchedule({
      SCHEDULE_TIMEZONE: 'Europe/London',
      SCHEDULE_ANNOUNCE_WEEKDAY: 'Monday',
      SCHEDULE_ANNOUNCE_TIME: '18:30',
      SCHEDULE_MEET_TIME: '19:00',
      SCHEDULE_HOLIDAY_SHIFT: 'none',
    });
    expect(s.timezone).toBe('Europe/London');
    expect(s.announceWeekday).toBe(1);
    expect(s.announceLocalTime).toBe('18:30');
    expect(s.meetLocalTime).toBe('19:00');
    expect(s.rateOpenLocalTime).toBe('19:20');
    expect(s.holidayShift).toBe('none');
  });
});

describe('buildCronBundle', () => {
  it('matches legacy Perth Friday crons', () => {
    const from = new Date('2026-04-01T00:00:00Z');
    const crons = buildCronBundle(DEFAULT_SCHEDULE, from);
    expect(crons.announce).toBe('0 2 * * THU,FRI');
    expect(crons.openRatings).toBe('20 4 * * THU,FRI');
    expect(crons.closeRatings).toBe('59 15 * * FRI,SAT');
  });

  it('uses a single weekday when holiday shift is off', () => {
    const crons = buildCronBundle(
      { ...DEFAULT_SCHEDULE, holidayShift: 'none' },
      new Date('2026-04-01T00:00:00Z')
    );
    expect(crons.announce).toBe('0 2 * * FRI');
    expect(crons.closeRatings).toBe('59 15 * * SAT');
  });
});

describe('classifyCronTrigger', () => {
  it('classifies Perth WA-shift triggers via regenerated bundle', async () => {
    const { classifyCronTrigger } = await import('./schedule');
    const schedule = DEFAULT_SCHEDULE;
    expect(classifyCronTrigger('0 2 * * THU,FRI', schedule)).toBe('announce');
    expect(classifyCronTrigger('20 4 * * THU,FRI', schedule)).toBe('open');
    expect(classifyCronTrigger('59 15 * * FRI,SAT', schedule)).toBe('close');
  });

  it('prefers explicit SCHEDULE_CRON_* strings', async () => {
    const { classifyCronTrigger } = await import('./schedule');
    const schedule = { ...DEFAULT_SCHEDULE, holidayShift: 'none' as const };
    expect(
      classifyCronTrigger('0 2 * * FRI', schedule, {
        scheduledCrons: {
          announce: '0 2 * * FRI',
          openRatings: '20 4 * * FRI',
          closeRatings: '59 15 * * SAT',
        },
      })
    ).toBe('announce');
    expect(
      classifyCronTrigger('20 4 * * FRI', schedule, {
        scheduledCrons: {
          announce: '0 2 * * FRI',
          openRatings: '20 4 * * FRI',
          closeRatings: '59 15 * * SAT',
        },
      })
    ).toBe('open');
  });

  it('still matches London triggers across DST sample seasons', async () => {
    const { classifyCronTrigger, buildCronBundle } = await import('./schedule');
    const schedule = {
      ...DEFAULT_SCHEDULE,
      timezone: 'Europe/London',
      announceWeekday: 1,
      announceLocalTime: '18:00',
      meetLocalTime: '19:00',
      rateOpenLocalTime: '19:20',
      rateCloseLocalTime: '23:59',
      holidayShift: 'none' as const,
    };
    const winter = buildCronBundle(schedule, new Date('2026-01-15T12:00:00Z'));
    const summer = buildCronBundle(schedule, new Date('2026-07-15T12:00:00Z'));
    // Winter and summer UTC hours often differ under BST
    expect(classifyCronTrigger(winter.announce, schedule)).toBe('announce');
    expect(classifyCronTrigger(summer.announce, schedule)).toBe('announce');
    expect(classifyCronTrigger(winter.openRatings, schedule)).toBe('open');
    expect(classifyCronTrigger(summer.openRatings, schedule)).toBe('open');
  });
});

describe('zonedLocalToUtc + timings', () => {
  it('converts Perth 10:00 to 02:00 UTC', () => {
    const utc = zonedLocalToUtc('2026-03-27', '10:00', 'Australia/Perth');
    expect(utc.toISOString()).toBe('2026-03-27T02:00:00.000Z');
  });

  it('builds Monday London schedule timings', () => {
    const schedule = {
      ...DEFAULT_SCHEDULE,
      timezone: 'Europe/London',
      announceWeekday: 1,
      announceLocalTime: '18:00',
      meetLocalTime: '19:00',
      rateOpenLocalTime: '19:20',
      rateCloseLocalTime: '23:59',
      holidayShift: 'none' as const,
    };
    expect(isPotentialRoundAnchorYmd('2026-04-06', schedule)).toBe(true); // Monday
    expect(isPotentialRoundAnchorYmd('2026-04-03', schedule)).toBe(false); // Friday
    const t = computeRoundTimingsFromAnchorYmd('2026-04-06', schedule);
    expect(t.weekKey).toBe('2026-04-06');
    expect(t.announceAtUtc).toBe(zonedLocalToUtc('2026-04-06', '18:00', 'Europe/London').toISOString());
  });
});

describe('addMinutesToHhmm', () => {
  it('adds across hour boundary', () => {
    expect(addMinutesToHhmm('12:00', 20)).toBe('12:20');
    expect(addMinutesToHhmm('23:50', 20)).toBe('00:10');
  });
});
