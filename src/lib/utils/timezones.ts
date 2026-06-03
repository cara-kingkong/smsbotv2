export interface TimezoneOption {
  value: string;
  label: string;
}

/**
 * Build the full IANA timezone list from the JS runtime.
 * Uses Intl.supportedValuesOf('timeZone') which returns all
 * canonical IANA timezone identifiers (e.g. "America/New_York").
 * The label replaces underscores and slashes for readability.
 */
export function getTimezoneOptions(): TimezoneOption[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.map((tz) => ({
    value: tz,
    label: tz.replace(/_/g, ' ').replace(/\//g, ' / '),
  }));
}

export const timezoneOptions: TimezoneOption[] = getTimezoneOptions();

/**
 * Validate that a string is a timezone the runtime understands via ICU
 * (e.g. "Australia/Melbourne"). Accepts any IANA id Intl recognises —
 * including legacy aliases like "EST" or "US/Eastern" — and rejects
 * free-text like "Sydney", bare offsets ("GMT+10"), and empty strings.
 * Every value the browser's Intl.supportedValuesOf('timeZone') produces
 * passes this check, so frontend-selected zones are always accepted.
 */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
