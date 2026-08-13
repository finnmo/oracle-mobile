// Round schedule math. Times are stored/compared as UTC ISO strings.
// Local wall times come from ScheduleConfig (wrangler [vars] / onboard wizard).

import { isWaPublicHoliday } from './waPublicHolidays';
import {
  DEFAULT_SCHEDULE,
  ScheduleConfig,
  addZonedDays,
  zonedLocalToUtc,
  zonedWeekday,
  zonedYmd,
  prevWeekday,
} from './schedule';

export interface RoundTimings {
  weekKey: string; // YYYY-MM-DD of the round anchor in the configured timezone
  announceAtUtc: string;
  meetAtUtc: string;
  rateOpenAtUtc: string;
  rateCloseAtUtc: string;
}

/** @deprecated Prefer zonedYmd(utc, schedule.timezone). Kept for Perth-era tests. */
export function perthYmd(utc: Date): string {
  return zonedYmd(utc, 'Australia/Perth');
}

/** @deprecated Prefer zonedWeekday. */
export function perthWeekday(utc: Date): number {
  return zonedWeekday(utc, 'Australia/Perth');
}

/** @deprecated Prefer addZonedDays. */
export function addPerthDays(perthYmdStr: string, deltaDays: number): string {
  return addZonedDays(perthYmdStr, deltaDays, 'Australia/Perth');
}

/** Next calendar day after `ymd` (Gregorian). */
export function utcYmdPlusOneDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * True if `ymd` (in schedule.timezone) is a valid round anchor day.
 * With holidayShift=wa: primary weekday when not a WA PH, or previous day when
 * the following primary weekday is a WA PH.
 */
export function isPotentialRoundAnchorYmd(
  ymd: string,
  schedule: ScheduleConfig = DEFAULT_SCHEDULE
): boolean {
  const noon = zonedLocalToUtc(ymd, '12:00', schedule.timezone);
  const wd = zonedWeekday(noon, schedule.timezone);
  const primary = schedule.announceWeekday;

  if (schedule.holidayShift === 'wa') {
    if (wd === primary) return !isWaPublicHoliday(ymd);
    if (wd === prevWeekday(primary)) {
      return isWaPublicHoliday(addZonedDays(ymd, 1, schedule.timezone));
    }
    return false;
  }

  return wd === primary;
}

/** @deprecated Use isPotentialRoundAnchorYmd with DEFAULT_SCHEDULE. */
export function isPotentialRoundAnchorPerthYmd(perthYmdStr: string): boolean {
  return isPotentialRoundAnchorYmd(perthYmdStr, DEFAULT_SCHEDULE);
}

function collectPotentialAnchorTimingsInRange(
  centerYmd: string,
  daysBack: number,
  daysForward: number,
  schedule: ScheduleConfig
): RoundTimings[] {
  const out: RoundTimings[] = [];
  for (let i = -daysBack; i <= daysForward; i++) {
    const ymd = addZonedDays(centerYmd, i, schedule.timezone);
    if (isPotentialRoundAnchorYmd(ymd, schedule)) {
      out.push(computeRoundTimingsFromAnchorYmd(ymd, schedule));
    }
  }
  return out;
}

export function computeRoundTimingsFromAnchorYmd(
  anchorYmd: string,
  schedule: ScheduleConfig = DEFAULT_SCHEDULE
): RoundTimings {
  const weekKey = anchorYmd;
  const announceAtUtc = zonedLocalToUtc(weekKey, schedule.announceLocalTime, schedule.timezone).toISOString();
  const meetAtUtc = zonedLocalToUtc(weekKey, schedule.meetLocalTime, schedule.timezone).toISOString();
  const rateOpenAtUtc = zonedLocalToUtc(weekKey, schedule.rateOpenLocalTime, schedule.timezone).toISOString();

  const closeYmd = addZonedDays(weekKey, 1, schedule.timezone);
  const rateCloseAtUtc = zonedLocalToUtc(
    closeYmd,
    schedule.rateCloseLocalTime,
    schedule.timezone
  ).toISOString();

  return { weekKey, announceAtUtc, meetAtUtc, rateOpenAtUtc, rateCloseAtUtc };
}

export function getVoteAndRoundAnchorYmd(
  now: Date,
  schedule: ScheduleConfig = DEFAULT_SCHEDULE
): string {
  const today = zonedYmd(now, schedule.timezone);
  const nowIso = now.toISOString();
  const candidates = collectPotentialAnchorTimingsInRange(today, 12, 28, schedule);
  const open = candidates.filter((t) => t.rateCloseAtUtc > nowIso);
  const inFlight = open.find((t) => t.announceAtUtc <= nowIso && nowIso < t.rateCloseAtUtc);
  if (inFlight) return inFlight.weekKey;

  const future = open
    .filter((t) => t.announceAtUtc > nowIso)
    .sort((a, b) => a.announceAtUtc.localeCompare(b.announceAtUtc));
  if (future.length > 0) return future[0].weekKey;

  for (let i = 0; i <= 35; i++) {
    const ymd = addZonedDays(today, i, schedule.timezone);
    if (!isPotentialRoundAnchorYmd(ymd, schedule)) continue;
    const t = computeRoundTimingsFromAnchorYmd(ymd, schedule);
    if (t.rateCloseAtUtc > nowIso) return t.weekKey;
  }

  return computeRoundTimingsFromAnchorYmd(addZonedDays(today, 7, schedule.timezone), schedule).weekKey;
}

/** @deprecated */
export function getVoteAndRoundAnchorPerthYmd(now: Date): string {
  return getVoteAndRoundAnchorYmd(now, DEFAULT_SCHEDULE);
}

export function getNextRoundTimings(
  now: Date,
  schedule: ScheduleConfig = DEFAULT_SCHEDULE
): RoundTimings {
  const today = zonedYmd(now, schedule.timezone);
  const nowIso = now.toISOString();
  for (let i = 0; i <= 21; i++) {
    const ymd = addZonedDays(today, i, schedule.timezone);
    if (!isPotentialRoundAnchorYmd(ymd, schedule)) continue;
    const t = computeRoundTimingsFromAnchorYmd(ymd, schedule);
    if (t.rateCloseAtUtc > nowIso) return t;
  }
  return computeRoundTimingsFromAnchorYmd(addZonedDays(today, 7, schedule.timezone), schedule);
}

/**
 * Cron announce tick: return anchor YYYY-MM-DD to announce, or null to skip.
 */
export function tryResolveCronAnnounceAnchorYmd(
  now: Date,
  schedule: ScheduleConfig = DEFAULT_SCHEDULE
): string | null {
  const todayYmd = zonedYmd(now, schedule.timezone);
  const wd = zonedWeekday(now, schedule.timezone);
  const primary = schedule.announceWeekday;

  if (schedule.holidayShift === 'wa') {
    if (wd === prevWeekday(primary)) {
      const tomorrow = addZonedDays(todayYmd, 1, schedule.timezone);
      if (isWaPublicHoliday(tomorrow)) return todayYmd;
      return null;
    }
    if (wd === primary) {
      if (isWaPublicHoliday(todayYmd)) return null;
      return todayYmd;
    }
    return null;
  }

  if (wd === primary) return todayYmd;
  return null;
}

/** @deprecated */
export function tryResolveCronAnnounceAnchorPerthYmd(now: Date): string | null {
  return tryResolveCronAnnounceAnchorYmd(now, DEFAULT_SCHEDULE);
}

/** @deprecated */
export function computeRoundTimings(fridayUtc: Date): RoundTimings {
  const y = fridayUtc.getUTCFullYear();
  const m = String(fridayUtc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(fridayUtc.getUTCDate()).padStart(2, '0');
  return computeRoundTimingsFromAnchorYmd(`${y}-${m}-${d}`);
}

/** @deprecated */
export function getNextFridayUtc(now: Date): Date {
  const anchor = getVoteAndRoundAnchorYmd(now);
  const [y, mo, da] = anchor.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, da, 2, 0, 0, 0));
}
