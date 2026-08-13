/**
 * Weekly announce schedule — configured via wrangler [vars] (set in onboard wizard).
 * Defaults preserve the original Oracle / Perth Friday ritual.
 */

export type HolidayShift = 'none' | 'wa';

export interface ScheduleConfig {
  timezone: string;
  /** 0 = Sunday … 6 = Saturday */
  announceWeekday: number;
  announceLocalTime: string; // HH:MM
  meetLocalTime: string;
  rateOpenLocalTime: string;
  /** Local wall time on the calendar day after the round anchor */
  rateCloseLocalTime: string;
  holidayShift: HolidayShift;
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  timezone: 'Australia/Perth',
  announceWeekday: 5, // Friday
  announceLocalTime: '10:00',
  meetLocalTime: '12:00',
  rateOpenLocalTime: '12:20',
  rateCloseLocalTime: '23:59',
  holidayShift: 'wa',
};

const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function weekdayLabel(day: number): string {
  return WEEKDAY_LABELS[((day % 7) + 7) % 7] ?? 'Friday';
}

export function parseHhmm(value: string | undefined, fallback: string): string {
  const raw = (value ?? fallback).trim();
  const m = HHMM.exec(raw);
  if (!m) return fallback;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function parseWeekday(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const raw = value.trim().toLowerCase();
  const asNum = Number(raw);
  if (Number.isInteger(asNum) && asNum >= 0 && asNum <= 6) return asNum;
  const map: Record<string, number> = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
  };
  return map[raw] ?? fallback;
}

export function parseHolidayShift(value: string | undefined, fallback: HolidayShift): HolidayShift {
  const raw = (value ?? fallback).trim().toLowerCase();
  if (raw === 'wa' || raw === 'wa_friday' || raw === 'perth') return 'wa';
  if (raw === 'none' || raw === 'off' || raw === 'false') return 'none';
  return fallback;
}

export interface ScheduleEnv {
  SCHEDULE_TIMEZONE?: string;
  SCHEDULE_ANNOUNCE_WEEKDAY?: string;
  SCHEDULE_ANNOUNCE_TIME?: string;
  SCHEDULE_MEET_TIME?: string;
  SCHEDULE_RATE_OPEN_TIME?: string;
  SCHEDULE_RATE_CLOSE_TIME?: string;
  SCHEDULE_HOLIDAY_SHIFT?: string;
  /** Exact cron expressions written by onboard (preferred for trigger matching). */
  SCHEDULE_CRON_ANNOUNCE?: string;
  SCHEDULE_CRON_OPEN?: string;
  SCHEDULE_CRON_CLOSE?: string;
}

export function getSchedule(env: ScheduleEnv = {}): ScheduleConfig {
  const timezone = (env.SCHEDULE_TIMEZONE ?? DEFAULT_SCHEDULE.timezone).trim() || DEFAULT_SCHEDULE.timezone;
  const announceWeekday = parseWeekday(env.SCHEDULE_ANNOUNCE_WEEKDAY, DEFAULT_SCHEDULE.announceWeekday);
  const announceLocalTime = parseHhmm(env.SCHEDULE_ANNOUNCE_TIME, DEFAULT_SCHEDULE.announceLocalTime);
  const meetLocalTime = parseHhmm(env.SCHEDULE_MEET_TIME, DEFAULT_SCHEDULE.meetLocalTime);
  const rateOpenLocalTime = parseHhmm(
    env.SCHEDULE_RATE_OPEN_TIME,
    env.SCHEDULE_MEET_TIME
      ? addMinutesToHhmm(meetLocalTime, 20)
      : DEFAULT_SCHEDULE.rateOpenLocalTime
  );
  const rateCloseLocalTime = parseHhmm(env.SCHEDULE_RATE_CLOSE_TIME, DEFAULT_SCHEDULE.rateCloseLocalTime);
  const holidayShift = parseHolidayShift(env.SCHEDULE_HOLIDAY_SHIFT, DEFAULT_SCHEDULE.holidayShift);
  return {
    timezone,
    announceWeekday,
    announceLocalTime,
    meetLocalTime,
    rateOpenLocalTime,
    rateCloseLocalTime,
    holidayShift,
  };
}

export function addMinutesToHhmm(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function prevWeekday(day: number): number {
  return (day + 6) % 7;
}

export function nextWeekday(day: number): number {
  return (day + 1) % 7;
}

function formatParts(utc: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(utc);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour') === '24' ? '0' : get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

/** Calendar YYYY-MM-DD in the given IANA timezone. */
export function zonedYmd(utc: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(utc);
}

/** 0 = Sunday … 6 = Saturday in the given timezone. */
export function zonedWeekday(utc: Date, timeZone: string): number {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone,
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

/**
 * Convert a local wall date+time in `timeZone` to a UTC Date.
 * Uses iterative offset correction (handles DST).
 */
export function zonedLocalToUtc(ymd: string, hhmm: string, timeZone: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let i = 0; i < 4; i++) {
    const got = formatParts(new Date(utcMs), timeZone);
    const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second, 0);
    const delta = wantedAsUtc - gotAsUtc;
    if (delta === 0) break;
    utcMs += delta;
  }

  return new Date(utcMs);
}

export function addZonedDays(ymd: string, deltaDays: number, timeZone: string): string {
  const noon = zonedLocalToUtc(ymd, '12:00', timeZone);
  const shifted = new Date(noon.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return zonedYmd(shifted, timeZone);
}

/** UTC HH:MM for a sample upcoming occurrence of weekday+localTime (for cron generation). */
export function sampleLocalToUtcHm(
  timeZone: string,
  weekday: number,
  hhmm: string,
  from: Date = new Date()
): { minute: number; hour: number } {
  for (let i = 0; i < 14; i++) {
    const ymd = zonedYmd(new Date(from.getTime() + i * 86400000), timeZone);
    const probe = zonedLocalToUtc(ymd, '12:00', timeZone);
    if (zonedWeekday(probe, timeZone) !== weekday) continue;
    const utc = zonedLocalToUtc(ymd, hhmm, timeZone);
    return { minute: utc.getUTCMinutes(), hour: utc.getUTCHours() };
  }
  // Fallback: treat as fixed offset from "now"
  const today = zonedYmd(from, timeZone);
  const utc = zonedLocalToUtc(today, hhmm, timeZone);
  return { minute: utc.getUTCMinutes(), hour: utc.getUTCHours() };
}

export function cronWeekdayList(days: number[]): string {
  const unique = [...new Set(days.map((d) => ((d % 7) + 7) % 7))].sort((a, b) => a - b);
  return unique.map((d) => WEEKDAY_NAMES[d]).join(',');
}

export interface CronBundle {
  announce: string;
  openRatings: string;
  closeRatings: string;
}

/** Fixed sample dates so DST zones still match winter + summer UTC hours. */
const CRON_SAMPLE_DATES = [
  new Date('2026-01-15T12:00:00.000Z'),
  new Date('2026-04-01T00:00:00.000Z'),
  new Date('2026-07-15T12:00:00.000Z'),
  new Date('2026-10-15T12:00:00.000Z'),
];

/** Build Cloudflare cron expressions (UTC) for the schedule. */
export function buildCronBundle(schedule: ScheduleConfig, from: Date = new Date()): CronBundle {
  const announceDays =
    schedule.holidayShift === 'wa'
      ? [prevWeekday(schedule.announceWeekday), schedule.announceWeekday]
      : [schedule.announceWeekday];
  const closeDays = announceDays.map(nextWeekday);

  const announceUtc = sampleLocalToUtcHm(schedule.timezone, schedule.announceWeekday, schedule.announceLocalTime, from);
  const openUtc = sampleLocalToUtcHm(schedule.timezone, schedule.announceWeekday, schedule.rateOpenLocalTime, from);
  const closeUtc = sampleLocalToUtcHm(
    schedule.timezone,
    nextWeekday(schedule.announceWeekday),
    schedule.rateCloseLocalTime,
    from
  );

  return {
    announce: `${announceUtc.minute} ${announceUtc.hour} * * ${cronWeekdayList(announceDays)}`,
    openRatings: `${openUtc.minute} ${openUtc.hour} * * ${cronWeekdayList(announceDays)}`,
    closeRatings: `${closeUtc.minute} ${closeUtc.hour} * * ${cronWeekdayList(closeDays)}`,
  };
}

/**
 * All cron expression variants we may have registered (DST seasons + holiday shift).
 * Used so runtime matching still works if the Worker clock is in a different season
 * than when onboard generated the triggers.
 */
export function cronBundleVariants(schedule: ScheduleConfig, extraFrom?: Date): CronBundle[] {
  const dates = [...CRON_SAMPLE_DATES];
  if (extraFrom) dates.push(extraFrom);
  const seen = new Set<string>();
  const out: CronBundle[] = [];
  for (const from of dates) {
    const bundle = buildCronBundle(schedule, from);
    const key = `${bundle.announce}|${bundle.openRatings}|${bundle.closeRatings}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(bundle);
  }
  return out;
}

export type CronRole = 'announce' | 'open' | 'close' | 'unknown';

/**
 * Map Cloudflare's event.cron (exact registered expression) to a role.
 * Prefers explicit SCHEDULE_CRON_* vars (written by onboard), then regenerated bundles,
 * then legacy Perth constants.
 */
export function classifyCronTrigger(
  eventCron: string,
  schedule: ScheduleConfig,
  opts: {
    now?: Date;
    scheduledCrons?: Partial<CronBundle>;
    legacy?: CronBundle;
  } = {}
): CronRole {
  const cron = eventCron.trim();
  if (!cron) return 'unknown';

  const scheduled = opts.scheduledCrons;
  if (scheduled?.announce && cron === scheduled.announce) return 'announce';
  if (scheduled?.openRatings && cron === scheduled.openRatings) return 'open';
  if (scheduled?.closeRatings && cron === scheduled.closeRatings) return 'close';

  for (const bundle of cronBundleVariants(schedule, opts.now)) {
    if (cron === bundle.announce) return 'announce';
    if (cron === bundle.openRatings) return 'open';
    if (cron === bundle.closeRatings) return 'close';
  }

  const legacy = opts.legacy;
  if (legacy) {
    if (cron === legacy.announce) return 'announce';
    if (cron === legacy.openRatings) return 'open';
    if (cron === legacy.closeRatings) return 'close';
  }

  return 'unknown';
}

export function schedulePublicView(schedule: ScheduleConfig) {
  return {
    timezone: schedule.timezone,
    announceWeekday: schedule.announceWeekday,
    announceWeekdayLabel: weekdayLabel(schedule.announceWeekday),
    announceLocalTime: schedule.announceLocalTime,
    meetLocalTime: schedule.meetLocalTime,
    rateOpenLocalTime: schedule.rateOpenLocalTime,
    rateCloseLocalTime: schedule.rateCloseLocalTime,
    holidayShift: schedule.holidayShift,
  };
}
