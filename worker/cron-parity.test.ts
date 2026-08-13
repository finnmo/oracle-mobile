import { describe, it, expect } from 'vitest';
import { buildCronBundle as buildWorker } from '../worker/schedule';
import { buildCronBundle as buildScript } from '../scripts/schedule-lib.mjs';

const FROM = new Date('2026-04-01T00:00:00Z');

describe('wizard vs worker cron generation', () => {
  it('agrees for Perth Friday + WA holiday shift', () => {
    const schedule = {
      timezone: 'Australia/Perth',
      announceWeekday: 5,
      announceLocalTime: '10:00',
      meetLocalTime: '12:00',
      rateOpenLocalTime: '12:20',
      rateCloseLocalTime: '23:59',
      holidayShift: 'wa',
    };
    expect(buildWorker(schedule, FROM)).toEqual(buildScript(schedule, FROM));
    expect(buildWorker(schedule, FROM)).toEqual({
      announce: '0 2 * * THU,FRI',
      openRatings: '20 4 * * THU,FRI',
      closeRatings: '59 15 * * FRI,SAT',
    });
  });

  it('agrees for Monday London with holiday shift off', () => {
    const schedule = {
      timezone: 'Europe/London',
      announceWeekday: 1,
      announceLocalTime: '18:00',
      meetLocalTime: '19:00',
      rateOpenLocalTime: '19:20',
      rateCloseLocalTime: '23:59',
      holidayShift: 'none',
    };
    expect(buildWorker(schedule, FROM)).toEqual(buildScript(schedule, FROM));
  });

  it('agrees for Wednesday NYC', () => {
    const schedule = {
      timezone: 'America/New_York',
      announceWeekday: 3,
      announceLocalTime: '17:30',
      meetLocalTime: '18:00',
      rateOpenLocalTime: '18:20',
      rateCloseLocalTime: '23:59',
      holidayShift: 'none',
    };
    expect(buildWorker(schedule, FROM)).toEqual(buildScript(schedule, FROM));
  });
});
