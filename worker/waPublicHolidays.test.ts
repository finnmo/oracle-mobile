import { describe, it, expect } from 'vitest';
import { isWaPublicHoliday, WA_PUBLIC_HOLIDAYS } from './waPublicHolidays';

describe('WA_PUBLIC_HOLIDAYS', () => {
  it('contains Good Friday 2026', () => {
    expect(WA_PUBLIC_HOLIDAYS.has('2026-04-03')).toBe(true);
  });

  it('contains Christmas Day 2027', () => {
    expect(WA_PUBLIC_HOLIDAYS.has('2027-12-25')).toBe(true);
  });

  it('contains New Year 2027 (a Friday)', () => {
    expect(WA_PUBLIC_HOLIDAYS.has('2027-01-01')).toBe(true);
  });

  it('contains Good Friday 2028', () => {
    expect(WA_PUBLIC_HOLIDAYS.has('2028-04-14')).toBe(true);
  });

  it('does not contain a random Wednesday', () => {
    expect(WA_PUBLIC_HOLIDAYS.has('2026-06-10')).toBe(false);
  });

  it('does not contain a date outside the 2026-2028 range', () => {
    expect(WA_PUBLIC_HOLIDAYS.has('2025-12-25')).toBe(false);
    expect(WA_PUBLIC_HOLIDAYS.has('2029-01-01')).toBe(false);
  });
});

describe('isWaPublicHoliday', () => {
  it('returns true for a known holiday', () => {
    expect(isWaPublicHoliday('2026-04-03')).toBe(true);
  });

  it('returns false for a non-holiday', () => {
    expect(isWaPublicHoliday('2026-04-04')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isWaPublicHoliday('')).toBe(false);
  });

  it('returns false for malformed date', () => {
    expect(isWaPublicHoliday('not-a-date')).toBe(false);
  });
});

describe('WA_PUBLIC_HOLIDAYS coverage', () => {
  it('contains Australia Day 2026', () => {
    expect(WA_PUBLIC_HOLIDAYS.has('2026-01-26')).toBe(true);
  });

  it('contains Easter Monday 2026', () => {
    expect(WA_PUBLIC_HOLIDAYS.has('2026-04-06')).toBe(true);
  });

  it('contains ANZAC Day 2027', () => {
    expect(WA_PUBLIC_HOLIDAYS.has('2027-04-25')).toBe(true);
  });

  it('contains Boxing Day public holiday 2027', () => {
    expect(WA_PUBLIC_HOLIDAYS.has('2027-12-28')).toBe(true);
  });

  it('contains Labour Day 2028', () => {
    expect(WA_PUBLIC_HOLIDAYS.has('2028-03-06')).toBe(true);
  });

  it('has a reasonable total count (30-40 entries for 3 years)', () => {
    expect(WA_PUBLIC_HOLIDAYS.size).toBeGreaterThanOrEqual(30);
    expect(WA_PUBLIC_HOLIDAYS.size).toBeLessThanOrEqual(45);
  });
});
