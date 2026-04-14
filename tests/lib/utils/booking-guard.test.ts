import { describe, expect, it } from 'vitest';
import { detectBookingAcceptance } from '../../../src/lib/utils/booking-guard';

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
