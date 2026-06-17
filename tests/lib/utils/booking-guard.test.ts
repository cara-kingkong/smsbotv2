import { describe, expect, it } from 'vitest';
import { detectBookingAcceptance, matchAvailableSlot } from '../../../src/lib/utils/booking-guard';

describe('detectBookingAcceptance', () => {
  it('detects acceptance of a previously proposed booking time', () => {
    const result = detectBookingAcceptance([
      { direction: 'outbound', body_text: 'Does Tuesday at 2pm work for your call?' },
      { direction: 'inbound', body_text: 'Yes, Tuesday at 2pm works for me.' },
    ]);

    expect(result.acceptanceDetected).toBe(true);
    expect(result.evidence).toContain('prior_outbound_scheduling_context');
    expect(result.evidence).toContain('inbound_affirmation');
  });

  it('does not detect acceptance without scheduling context', () => {
    const result = detectBookingAcceptance([
      { direction: 'outbound', body_text: 'Thanks for the update.' },
      { direction: 'inbound', body_text: 'Yes that works.' },
    ]);

    expect(result.acceptanceDetected).toBe(false);
    expect(result.schedulingContext).toBe(false);
  });
});

describe('matchAvailableSlot', () => {
  const slots = [
    '2026-06-16T01:00:00.000Z',
    '2026-06-16T03:30:00.000Z',
    '2026-06-17T04:00:00.000Z',
  ];

  it('returns the slot ISO for an exact match', () => {
    expect(matchAvailableSlot('2026-06-16T03:30:00.000Z', slots)).toBe('2026-06-16T03:30:00.000Z');
  });

  it('matches to the minute regardless of seconds/format and returns the slot canonical ISO', () => {
    // Same instant, different formatting (no millis, Z offset) — should snap to the slot.
    expect(matchAvailableSlot('2026-06-16T03:30:45Z', slots)).toBe('2026-06-16T03:30:00.000Z');
    expect(matchAvailableSlot('2026-06-16T11:30:00+08:00', slots)).toBe('2026-06-16T03:30:00.000Z');
  });

  it('returns null when the requested time is not an available slot', () => {
    expect(matchAvailableSlot('2026-06-16T02:00:00.000Z', slots)).toBeNull();
  });

  it('returns null for a missing or unparseable time', () => {
    expect(matchAvailableSlot(null, slots)).toBeNull();
    expect(matchAvailableSlot(undefined, slots)).toBeNull();
    expect(matchAvailableSlot('not a date', slots)).toBeNull();
  });

  it('returns null when there are no available slots', () => {
    expect(matchAvailableSlot('2026-06-16T03:30:00.000Z', [])).toBeNull();
  });
});
