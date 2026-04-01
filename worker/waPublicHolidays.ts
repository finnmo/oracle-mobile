/**
 * Western Australia statewide public holidays (observed calendar dates in Perth).
 * Sources (verify annually): https://publicholidays.com.au/western-australia/
 * and https://www.wa.gov.au/service/employment/workplace-arrangements/public-holidays-western-australia
 *
 * The app only uses this set to detect when a **Friday** is a public holiday so the
 * weekly round can move to **Thursday** (same clock times in Perth).
 */

export const WA_PUBLIC_HOLIDAYS = new Set<string>([
  // ── 2026 ───────────────────────────────────────────────────────────────────
  '2026-01-01',
  '2026-01-26',
  '2026-03-02',
  '2026-04-03',
  '2026-04-05',
  '2026-04-06',
  '2026-04-25',
  '2026-04-27',
  '2026-06-01',
  '2026-09-28',
  '2026-12-25',
  '2026-12-26',
  '2026-12-28',
  // ── 2027 ───────────────────────────────────────────────────────────────────
  '2027-01-01',
  '2027-01-26',
  '2027-03-01',
  '2027-03-26',
  '2027-03-28',
  '2027-03-29',
  '2027-04-25',
  '2027-04-26',
  '2027-06-07',
  '2027-09-27',
  '2027-12-25',
  '2027-12-26',
  '2027-12-27',
  '2027-12-28',
  // ── 2028 (tentative until WA gazette; update when official) ───────────────
  '2028-01-01',
  '2028-01-03',
  '2028-01-26',
  '2028-03-06',
  '2028-04-14',
  '2028-04-16',
  '2028-04-17',
  '2028-04-25',
  '2028-06-05',
  '2028-10-02',
  '2028-12-25',
  '2028-12-26',
]);

export function isWaPublicHoliday(perthYmd: string): boolean {
  return WA_PUBLIC_HOLIDAYS.has(perthYmd);
}
