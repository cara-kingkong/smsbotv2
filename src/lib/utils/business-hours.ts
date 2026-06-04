import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import type { BusinessHours } from '@lib/types';

/**
 * Resolve which timezone the business-hours window is evaluated in.
 *
 * The schedule (days + start/end) is always applied in the LEAD's local time,
 * so a lead is only texted between e.g. 9am–5pm wherever they are. When the
 * lead's own timezone is unknown (common for inbound texts from new numbers),
 * we fall back to the workspace's configured fallback timezone, and finally to
 * a hardcoded default as a last resort.
 */
function resolveTimezone(businessHours: BusinessHours, leadTimezone: string | null): string {
  return leadTimezone ?? businessHours.timezone ?? 'Australia/Melbourne';
}

/**
 * Sensible default window used to guard which booking slots we offer a lead
 * when a campaign/workspace has no business hours configured. Without this,
 * Calendly's raw availability — combined with the timezone gap between the
 * calendar host and the lead — surfaces absurd offers like 4am or midnight.
 * Mon–Fri 09:00–17:00 in the lead's local time.
 */
export const DEFAULT_BOOKABLE_HOURS: BusinessHours = {
  timezone: 'Australia/Melbourne',
  schedule: [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '17:00' })),
};

/**
 * Check if the current time is within business hours, evaluated in the lead's
 * local timezone (falling back to the workspace timezone if unknown).
 */
export function isWithinBusinessHours(
  businessHours: BusinessHours,
  leadTimezone: string | null,
  now: Date = new Date(),
): boolean {
  const tz = resolveTimezone(businessHours, leadTimezone);
  const zonedNow = toZonedTime(now, tz);
  const currentDay = zonedNow.getDay();
  const currentTime = `${String(zonedNow.getHours()).padStart(2, '0')}:${String(zonedNow.getMinutes()).padStart(2, '0')}`;

  const todaySchedule = businessHours.schedule?.find((s) => s.day === currentDay);
  if (!todaySchedule) return false;

  return currentTime >= todaySchedule.start && currentTime <= todaySchedule.end;
}

/**
 * Check whether a specific booking slot's start time falls within business
 * hours, evaluated in the lead's local timezone. Unlike isWithinBusinessHours
 * (which checks "now"), this checks an arbitrary future slot — used to keep the
 * bot from offering unreasonable call times (e.g. 4am Melbourne time) that
 * Calendly returns when the calendar host sits in a different timezone.
 *
 * The slot must start at/after the day's open and strictly before its close, so
 * a slot landing exactly on closing time (which would run past hours) is dropped.
 */
export function isSlotWithinBusinessHours(
  iso: string,
  businessHours: BusinessHours,
  leadTimezone: string | null,
): boolean {
  const tz = resolveTimezone(businessHours, leadTimezone);
  const slot = new Date(iso);
  if (Number.isNaN(slot.getTime())) return false;

  const zonedSlot = toZonedTime(slot, tz);
  const day = zonedSlot.getDay();
  const time = `${String(zonedSlot.getHours()).padStart(2, '0')}:${String(zonedSlot.getMinutes()).padStart(2, '0')}`;

  const daySchedule = businessHours.schedule?.find((s) => s.day === day);
  if (!daySchedule) return false;

  return time >= daySchedule.start && time < daySchedule.end;
}

/**
 * Filter a list of slot ISO strings down to those that fall within business
 * hours (in the lead's timezone). Falls back to DEFAULT_BOOKABLE_HOURS when no
 * schedule is configured so absurd times are never offered.
 */
export function filterSlotsWithinBusinessHours(
  slots: string[],
  businessHours: BusinessHours | null | undefined,
  leadTimezone: string | null,
): string[] {
  const hours =
    businessHours?.schedule?.length ? businessHours : DEFAULT_BOOKABLE_HOURS;
  return slots.filter((iso) => isSlotWithinBusinessHours(iso, hours, leadTimezone));
}

/**
 * Calculate the next available business-hours window opening.
 * Returns null if no schedule is defined.
 */
export function getNextBusinessHoursStart(
  businessHours: BusinessHours,
  leadTimezone: string | null,
  now: Date = new Date(),
): Date | null {
  if (!businessHours.schedule?.length) return null;

  const tz = resolveTimezone(businessHours, leadTimezone);
  const zonedNow = toZonedTime(now, tz);

  // Look up to 7 days ahead
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const checkDate = new Date(zonedNow.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dayOfWeek = checkDate.getDay();
    const schedule = businessHours.schedule.find((s) => s.day === dayOfWeek);

    if (schedule) {
      const [startHour, startMin] = schedule.start.split(':').map(Number);
      const startTime = new Date(checkDate);
      startTime.setHours(startHour, startMin, 0, 0);

      if (startTime > zonedNow) {
        // startTime's hours are in the lead's timezone (via the shifted
        // zonedNow base) — convert back to real UTC before returning.
        return fromZonedTime(startTime, tz);
      }

      // If same day but start already passed, check if still within range
      if (dayOffset === 0) {
        const [endHour, endMin] = schedule.end.split(':').map(Number);
        const endTime = new Date(checkDate);
        endTime.setHours(endHour, endMin, 0, 0);
        if (zonedNow < endTime) return now; // Currently within hours
      }
    }
  }

  return null;
}
