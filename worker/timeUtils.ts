// All times are stored and compared in UTC as ISO 8601 strings.
// Perth is UTC+8. Key mappings:
//   Friday 10:00 Perth = Friday 02:00 UTC  → announcement
//   Friday 12:00 Perth = Friday 04:00 UTC  → meet time
//   Friday 12:20 Perth = Friday 04:20 UTC  → ratings open
//   Friday 23:59 Perth = Saturday 15:59 UTC → ratings close

export interface RoundTimings {
  weekKey: string;       // YYYY-MM-DD of the Friday (Perth date = UTC date for these hours)
  announceAtUtc: string;
  meetAtUtc: string;
  rateOpenAtUtc: string;
  rateCloseAtUtc: string;
}

/**
 * Given a Date that falls on a Friday (any UTC time), compute all round timestamps.
 * weekKey is the YYYY-MM-DD of that Friday.
 */
export function computeRoundTimings(fridayUtc: Date): RoundTimings {
  const y = fridayUtc.getUTCFullYear();
  const m = String(fridayUtc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(fridayUtc.getUTCDate()).padStart(2, '0');
  const weekKey = `${y}-${m}-${d}`;

  const announceAtUtc  = `${weekKey}T02:00:00.000Z`; // 10:00 Perth
  const meetAtUtc      = `${weekKey}T04:00:00.000Z`; // 12:00 Perth
  const rateOpenAtUtc  = `${weekKey}T04:20:00.000Z`; // 12:20 Perth

  // Saturday 15:59 UTC = Friday 23:59 Perth
  const saturday = new Date(fridayUtc);
  saturday.setUTCDate(saturday.getUTCDate() + 1);
  const sy = saturday.getUTCFullYear();
  const sm = String(saturday.getUTCMonth() + 1).padStart(2, '0');
  const sd = String(saturday.getUTCDate()).padStart(2, '0');
  const rateCloseAtUtc = `${sy}-${sm}-${sd}T15:59:00.000Z`;

  return { weekKey, announceAtUtc, meetAtUtc, rateOpenAtUtc, rateCloseAtUtc };
}

/**
 * Given any UTC Date, return the Date for the current or next Friday.
 * If today is Friday, always returns this Friday (round stays active until Saturday 15:59 UTC).
 * On Saturday or later, naturally advances to next Friday.
 */
export function getNextFridayUtc(now: Date): Date {
  const day = now.getUTCDay(); // 0=Sun … 5=Fri … 6=Sat

  let daysUntil = (5 - day + 7) % 7;

  // If today is Friday, always target this Friday — the round stays active
  // until Saturday 15:59 UTC, at which point day !== 5 and daysUntil > 0 naturally.

  const friday = new Date(now);
  friday.setUTCDate(now.getUTCDate() + daysUntil);
  friday.setUTCHours(2, 0, 0, 0);
  return friday;
}

/** Convenience: compute timings for "the next" Friday from now. */
export function getNextRoundTimings(now: Date): RoundTimings {
  return computeRoundTimings(getNextFridayUtc(now));
}
