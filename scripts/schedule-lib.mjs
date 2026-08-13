/**
 * Schedule helpers for the onboard wizard (Node).
 * Keep in sync with worker/schedule.ts defaults and cron building.
 */

const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAY_PARSE = {
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

export function parseWeekdayInput(raw, fallback = 5) {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return fallback;
  if (/^[0-6]$/.test(v)) return Number(v);
  return WEEKDAY_PARSE[v] ?? fallback;
}

export function parseHhmmInput(raw, fallback) {
  const v = String(raw ?? '').trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v);
  if (!m) return fallback;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function addMinutesHhmm(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatParts(utc, timeZone) {
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
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour') === '24' ? '0' : get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

function zonedYmd(utc, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(utc);
}

function zonedWeekday(utc, timeZone) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(utc);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
}

function zonedLocalToUtc(ymd, hhmm, timeZone) {
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

function sampleLocalToUtcHm(timeZone, weekday, hhmm, from = new Date()) {
  for (let i = 0; i < 14; i++) {
    const ymd = zonedYmd(new Date(from.getTime() + i * 86400000), timeZone);
    const probe = zonedLocalToUtc(ymd, '12:00', timeZone);
    if (zonedWeekday(probe, timeZone) !== weekday) continue;
    const utc = zonedLocalToUtc(ymd, hhmm, timeZone);
    return { minute: utc.getUTCMinutes(), hour: utc.getUTCHours() };
  }
  const today = zonedYmd(from, timeZone);
  const utc = zonedLocalToUtc(today, hhmm, timeZone);
  return { minute: utc.getUTCMinutes(), hour: utc.getUTCHours() };
}

function cronWeekdayList(days) {
  const unique = [...new Set(days.map((d) => ((d % 7) + 7) % 7))].sort((a, b) => a - b);
  return unique.map((d) => WEEKDAY_NAMES[d]).join(',');
}

export function buildCronBundle(schedule, from = new Date()) {
  const announceDays =
    schedule.holidayShift === 'wa'
      ? [(schedule.announceWeekday + 6) % 7, schedule.announceWeekday]
      : [schedule.announceWeekday];
  const closeDays = announceDays.map((d) => (d + 1) % 7);

  const announceUtc = sampleLocalToUtcHm(schedule.timezone, schedule.announceWeekday, schedule.announceLocalTime, from);
  const openUtc = sampleLocalToUtcHm(schedule.timezone, schedule.announceWeekday, schedule.rateOpenLocalTime, from);
  const closeUtc = sampleLocalToUtcHm(
    schedule.timezone,
    (schedule.announceWeekday + 1) % 7,
    schedule.rateCloseLocalTime,
    from
  );

  return {
    announce: `${announceUtc.minute} ${announceUtc.hour} * * ${cronWeekdayList(announceDays)}`,
    openRatings: `${openUtc.minute} ${openUtc.hour} * * ${cronWeekdayList(announceDays)}`,
    closeRatings: `${closeUtc.minute} ${closeUtc.hour} * * ${cronWeekdayList(closeDays)}`,
  };
}

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
