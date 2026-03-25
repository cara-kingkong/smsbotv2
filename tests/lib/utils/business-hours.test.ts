import { describe, it, expect } from 'vitest';
import { isWithinBusinessHours, getNextBusinessHoursStart } from '../../../src/lib/utils/business-hours';
import type { BusinessHours } from '../../../src/lib/types';

/** Standard Mon-Fri 9-17 schedule in US Eastern */
function makeWeekdaySchedule(): BusinessHours {
  return {
    timezone: 'America/New_York',
    schedule: [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '17:00' })),
  };
}

describe('isWithinBusinessHours', () => {
  it('returns true when current time is within scheduled hours', () => {
    const bh = makeWeekdaySchedule();
    // Wednesday 2026-03-25 12:00 ET (day=3)
    const wednesday_noon = new Date('2026-03-25T16:00:00.000Z'); // 12:00 ET (EDT, UTC-4)
    expect(isWithinBusinessHours(bh, 'America/New_York', wednesday_noon)).toBe(true);
  });

  it('returns false when current time is outside scheduled hours', () => {
    const bh = makeWeekdaySchedule();
    // Wednesday 2026-03-25 20:00 ET
    const wednesday_night = new Date('2026-03-26T00:00:00.000Z'); // 20:00 ET
    expect(isWithinBusinessHours(bh, 'America/New_York', wednesday_night)).toBe(false);
  });

  it('returns false on a weekend with no schedule entry', () => {
    const bh = makeWeekdaySchedule();
    // Saturday 2026-03-28 12:00 ET
    const saturday_noon = new Date('2026-03-28T16:00:00.000Z');
    expect(isWithinBusinessHours(bh, 'America/New_York', saturday_noon)).toBe(false);
  });

  it('falls back to schedule timezone when leadTimezone is null', () => {
    const bh = makeWeekdaySchedule();
    // Wednesday 12:00 ET — passing null for lead timezone should use bh.timezone
    const wednesday_noon = new Date('2026-03-25T16:00:00.000Z');
    expect(isWithinBusinessHours(bh, null, wednesday_noon)).toBe(true);
  });

  it('uses lead timezone when provided, possibly changing the result', () => {
    const bh = makeWeekdaySchedule();
    // 2026-03-25T23:00 UTC = 19:00 ET (outside) but if lead tz is UTC it would be 23:00 (also outside)
    // 2026-03-25T14:00 UTC = 10:00 ET (inside) but 14:00 in UTC — no schedule for that tz
    // Lead tz = America/Los_Angeles: 2026-03-25T16:00Z = 09:00 PT (day=3, inside)
    const time = new Date('2026-03-25T16:00:00.000Z');
    expect(isWithinBusinessHours(bh, 'America/Los_Angeles', time)).toBe(true);
  });
});

describe('getNextBusinessHoursStart', () => {
  it('returns next Monday morning when called on Saturday', () => {
    const bh = makeWeekdaySchedule();
    // Saturday 2026-03-28 12:00 ET
    const saturday = new Date('2026-03-28T16:00:00.000Z');
    const next = getNextBusinessHoursStart(bh, 'America/New_York', saturday);
    expect(next).not.toBeNull();
    // Next business day is Monday (day=1), start 09:00
    expect(next!.getDay()).toBe(1);
    expect(next!.getHours()).toBe(9);
    expect(next!.getMinutes()).toBe(0);
  });

  it('returns the original now when currently within business hours', () => {
    const bh = makeWeekdaySchedule();
    // Wednesday 2026-03-25 12:00 ET — within hours
    const wednesday_noon = new Date('2026-03-25T16:00:00.000Z');
    const result = getNextBusinessHoursStart(bh, 'America/New_York', wednesday_noon);
    // The implementation returns the original `now` Date object when within hours
    expect(result).toEqual(wednesday_noon);
  });

  it('returns null when schedule is empty', () => {
    const bh: BusinessHours = { timezone: 'America/New_York', schedule: [] };
    const now = new Date('2026-03-25T16:00:00.000Z');
    expect(getNextBusinessHoursStart(bh, 'America/New_York', now)).toBeNull();
  });

  it('returns null when schedule is undefined-ish (empty array)', () => {
    const bh: BusinessHours = { timezone: 'UTC', schedule: [] };
    expect(getNextBusinessHoursStart(bh, null)).toBeNull();
  });

  it('returns next day start when called after business hours end', () => {
    const bh = makeWeekdaySchedule();
    // Wednesday 2026-03-25 20:00 ET — after 17:00 close
    const wednesday_night = new Date('2026-03-26T00:00:00.000Z');
    const next = getNextBusinessHoursStart(bh, 'America/New_York', wednesday_night);
    expect(next).not.toBeNull();
    // Next business day is Thursday (day=4)
    expect(next!.getDay()).toBe(4);
    expect(next!.getHours()).toBe(9);
  });
});
