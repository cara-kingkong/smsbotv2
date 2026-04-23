import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import type { BusinessHours } from '@lib/types';

/**
 * Check if the current time is within business hours for a given lead timezone.
 */
export function isWithinBusinessHours(
  businessHours: BusinessHours,
  leadTimezone: string | null,
  now: Date = new Date(),
): boolean {
  const tz = leadTimezone ?? businessHours.timezone ?? 'America/New_York';
  const zonedNow = toZonedTime(now, tz);
  const currentDay = zonedNow.getDay();
  const currentTime = `${String(zonedNow.getHours()).padStart(2, '0')}:${String(zonedNow.getMinutes()).padStart(2, '0')}`;

  const todaySchedule = businessHours.schedule?.find((s) => s.day === currentDay);
  if (!todaySchedule) return false;

  return currentTime >= todaySchedule.start && currentTime <= todaySchedule.end;
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

  const tz = leadTimezone ?? businessHours.timezone ?? 'America/New_York';
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
