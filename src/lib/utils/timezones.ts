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
