import { describe, expect, it } from 'vitest';
import { isValidTimezone, friendlyTimezoneLabel } from '../../../src/lib/utils/timezones';

describe('isValidTimezone', () => {
  it('accepts real IANA zones', () => {
    expect(isValidTimezone('Australia/Perth')).toBe(true);
    expect(isValidTimezone('America/New_York')).toBe(true);
  });

  it('rejects free-text, offsets, empty, and non-strings', () => {
    expect(isValidTimezone('Sydney')).toBe(false);
    expect(isValidTimezone('GMT+10')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(undefined)).toBe(false);
  });
});

describe('friendlyTimezoneLabel', () => {
  it('renders the city portion plus " time"', () => {
    expect(friendlyTimezoneLabel('Australia/Brisbane')).toBe('Brisbane time');
    expect(friendlyTimezoneLabel('Australia/Perth')).toBe('Perth time');
    expect(friendlyTimezoneLabel('America/New_York')).toBe('New York time');
  });

  it('uses the last path segment for multi-part zones', () => {
    expect(friendlyTimezoneLabel('America/Argentina/Buenos_Aires')).toBe('Buenos Aires time');
  });

  it('falls back to Melbourne time when missing/empty', () => {
    expect(friendlyTimezoneLabel(null)).toBe('Melbourne time');
    expect(friendlyTimezoneLabel(undefined)).toBe('Melbourne time');
    expect(friendlyTimezoneLabel('')).toBe('Melbourne time');
  });
});
