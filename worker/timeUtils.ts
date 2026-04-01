// All times are stored and compared in UTC as ISO 8601 strings.
// Perth uses Australia/Perth (UTC+8, no DST).
// Normal week: anchor = calendar Friday in Perth. If that Friday is a WA public holiday,
// anchor moves to the preceding Thursday (same local clock times).

import { isWaPublicHoliday } from './waPublicHolidays';

export interface RoundTimings {
  weekKey: string; // YYYY-MM-DD of the round anchor (usually Friday; Thursday when Friday is a WA PH)
  announceAtUtc: string;
  meetAtUtc: string;
  rateOpenAtUtc: string;
  rateCloseAtUtc: string;
}

/** Calendar date YYYY-MM-DD in Australia/Perth for this instant. */
export function perthYmd(utc: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Perth',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(utc);
}

/** 0 = Sunday … 6 = Saturday (Perth calendar day containing `utc`). */
export function perthWeekday(utc: Date): number {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Perth',
    weekday: 'short',
  }).format(utc);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

/** Add whole calendar days in Perth (fixed +08:00, no DST). */
export function addPerthDays(perthYmdStr: string, deltaDays: number): string {
  const ms = Date.parse(`${perthYmdStr}T12:00:00+08:00`) + deltaDays * 24 * 60 * 60 * 1000;
  return perthYmd(new Date(ms));
}

/** Next calendar day after `ymd` (Gregorian, for rate-close which follows anchor by one date). */
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
 * True if `perthYmd` is a valid round anchor day:
 * - Friday and not a WA public holiday, or
 * - Thursday when the following Friday is a WA public holiday.
 */
export function isPotentialRoundAnchorPerthYmd(perthYmd: string): boolean {
  const noon = new Date(Date.parse(`${perthYmd}T12:00:00+08:00`));
  const wd = perthWeekday(noon);
  if (wd === 5) return !isWaPublicHoliday(perthYmd);
  if (wd === 4) return isWaPublicHoliday(addPerthDays(perthYmd, 1));
  return false;
}

/** All anchor weeks whose key dates fall within [center - back, center + forward] in Perth. */
function collectPotentialAnchorTimingsInRange(
  perthCenterYmd: string,
  daysBack: number,
  daysForward: number
): RoundTimings[] {
  const out: RoundTimings[] = [];
  for (let i = -daysBack; i <= daysForward; i++) {
    const ymd = addPerthDays(perthCenterYmd, i);
    if (isPotentialRoundAnchorPerthYmd(ymd)) {
      out.push(computeRoundTimingsFromAnchorYmd(ymd));
    }
  }
  return out;
}

/**
 * Timestamps for a round whose anchor calendar day in Perth is `anchorPerthYmd`
 * (Thursday or Friday as above). Local meaning: 11:45 / 12:00 / 12:20 Perth on that day;
 * ratings close at 23:59 Perth on the following calendar day.
 */
export function computeRoundTimingsFromAnchorYmd(anchorPerthYmd: string): RoundTimings {
  const weekKey = anchorPerthYmd;
  const announceAtUtc = `${weekKey}T03:45:00.000Z`;
  const meetAtUtc = `${weekKey}T04:00:00.000Z`;
  const rateOpenAtUtc = `${weekKey}T04:20:00.000Z`;

  const closeYmd = utcYmdPlusOneDay(weekKey);
  const rateCloseAtUtc = `${closeYmd}T15:59:00.000Z`;

  return { weekKey, announceAtUtc, meetAtUtc, rateOpenAtUtc, rateCloseAtUtc };
}

/**
 * Anchor weekKey used for votes/vetoes and admin targeting: the active round if we are
 * between announce and close, otherwise the next round (by announce time).
 */
export function getVoteAndRoundAnchorPerthYmd(now: Date): string {
  const today = perthYmd(now);
  const nowIso = now.toISOString();
  const candidates = collectPotentialAnchorTimingsInRange(today, 12, 28);
  const open = candidates.filter((t) => t.rateCloseAtUtc > nowIso);
  const inFlight = open.find((t) => t.announceAtUtc <= nowIso && nowIso < t.rateCloseAtUtc);
  if (inFlight) return inFlight.weekKey;

  const future = open
    .filter((t) => t.announceAtUtc > nowIso)
    .sort((a, b) => a.announceAtUtc.localeCompare(b.announceAtUtc));
  if (future.length > 0) return future[0].weekKey;

  for (let i = 0; i <= 35; i++) {
    const ymd = addPerthDays(today, i);
    if (!isPotentialRoundAnchorPerthYmd(ymd)) continue;
    const t = computeRoundTimingsFromAnchorYmd(ymd);
    if (t.rateCloseAtUtc > nowIso) return t.weekKey;
  }

  return computeRoundTimingsFromAnchorYmd(addPerthDays(today, 7)).weekKey;
}

/** Between rounds: next round schedule (first anchor whose round has not yet closed). */
export function getNextRoundTimings(now: Date): RoundTimings {
  const today = perthYmd(now);
  const nowIso = now.toISOString();
  for (let i = 0; i <= 21; i++) {
    const ymd = addPerthDays(today, i);
    if (!isPotentialRoundAnchorPerthYmd(ymd)) continue;
    const t = computeRoundTimingsFromAnchorYmd(ymd);
    if (t.rateCloseAtUtc > nowIso) return t;
  }
  return computeRoundTimingsFromAnchorYmd(addPerthDays(today, 7));
}

/**
 * Cron at Thu/Fri 03:45 UTC: return anchor YYYY-MM-DD to announce, or null to skip.
 */
export function tryResolveCronAnnounceAnchorPerthYmd(now: Date): string | null {
  const todayYmd = perthYmd(now);
  const wd = perthWeekday(now);

  if (wd === 4) {
    const tomorrow = addPerthDays(todayYmd, 1);
    if (isWaPublicHoliday(tomorrow)) return todayYmd;
    return null;
  }
  if (wd === 5) {
    if (isWaPublicHoliday(todayYmd)) return null;
    return todayYmd;
  }
  return null;
}

/** @deprecated Use computeRoundTimingsFromAnchorYmd(perthYmd) or getVoteAndRoundAnchorPerthYmd. */
export function computeRoundTimings(fridayUtc: Date): RoundTimings {
  const y = fridayUtc.getUTCFullYear();
  const m = String(fridayUtc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(fridayUtc.getUTCDate()).padStart(2, '0');
  return computeRoundTimingsFromAnchorYmd(`${y}-${m}-${d}`);
}

/** @deprecated Use getVoteAndRoundAnchorPerthYmd. */
export function getNextFridayUtc(now: Date): Date {
  const anchor = getVoteAndRoundAnchorPerthYmd(now);
  const [y, mo, da] = anchor.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, da, 2, 0, 0, 0));
}
