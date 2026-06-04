import { describe, it, expect } from 'vitest';
import {
  isWithinBusinessHours,
  getNextBusinessHoursStart,
  isSlotWithinBusinessHours,
  filterSlotsWithinBusinessHours,
  DEFAULT_BOOKABLE_HOURS,
} from '../../../src/lib/utils/business-hours';
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

/** Mon-Fri 9-17 in Melbourne (AEST, UTC+10 in June — no DST) */
function makeMelbourneSchedule(): BusinessHours {
  return {
    timezone: 'Australia/Melbourne',
    schedule: [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '17:00' })),
  };
}

// Reference slots, all on Thursday 2026-06-04 in Melbourne time unless noted.
const THU_2PM_MEL = '2026-06-04T04:00:00.000Z'; // 14:00 Melbourne
const THU_4AM_MEL = '2026-06-03T18:00:00.000Z'; // 04:00 Melbourne
const THU_9AM_MEL = '2026-06-03T23:00:00.000Z'; // 09:00 Melbourne (open)
const THU_5PM_MEL = '2026-06-04T07:00:00.000Z'; // 17:00 Melbourne (close)
const SAT_2PM_MEL = '2026-06-06T04:00:00.000Z'; // 14:00 Melbourne, Saturday

describe('isSlotWithinBusinessHours', () => {
  const bh = makeMelbourneSchedule();

  it('returns true for a reasonable weekday slot (2pm)', () => {
    expect(isSlotWithinBusinessHours(THU_2PM_MEL, bh, 'Australia/Melbourne')).toBe(true);
  });

  it('returns false for an absurd early-morning slot (4am)', () => {
    expect(isSlotWithinBusinessHours(THU_4AM_MEL, bh, 'Australia/Melbourne')).toBe(false);
  });

  it('includes the opening time but excludes the closing time', () => {
    expect(isSlotWithinBusinessHours(THU_9AM_MEL, bh, 'Australia/Melbourne')).toBe(true);
    // A slot starting exactly at close would run past hours — dropped.
    expect(isSlotWithinBusinessHours(THU_5PM_MEL, bh, 'Australia/Melbourne')).toBe(false);
  });

  it('returns false on a day with no schedule (weekend)', () => {
    expect(isSlotWithinBusinessHours(SAT_2PM_MEL, bh, 'Australia/Melbourne')).toBe(false);
  });

  it('returns false for an invalid ISO string', () => {
    expect(isSlotWithinBusinessHours('not-a-date', bh, 'Australia/Melbourne')).toBe(false);
  });
});

describe('filterSlotsWithinBusinessHours', () => {
  it('keeps only slots within business hours', () => {
    const bh = makeMelbourneSchedule();
    const filtered = filterSlotsWithinBusinessHours(
      [THU_4AM_MEL, THU_2PM_MEL, SAT_2PM_MEL, THU_5PM_MEL],
      bh,
      'Australia/Melbourne',
    );
    expect(filtered).toEqual([THU_2PM_MEL]);
  });

  it('falls back to DEFAULT_BOOKABLE_HOURS when no schedule is configured', () => {
    expect(DEFAULT_BOOKABLE_HOURS.schedule.length).toBe(5);
    const filtered = filterSlotsWithinBusinessHours(
      [THU_4AM_MEL, THU_2PM_MEL],
      null,
      'Australia/Melbourne',
    );
    expect(filtered).toEqual([THU_2PM_MEL]);
  });

  it('falls back to the default when schedule is empty', () => {
    const empty: BusinessHours = { timezone: 'Australia/Melbourne', schedule: [] };
    const filtered = filterSlotsWithinBusinessHours([THU_4AM_MEL, THU_2PM_MEL], empty, 'Australia/Melbourne');
    expect(filtered).toEqual([THU_2PM_MEL]);
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
