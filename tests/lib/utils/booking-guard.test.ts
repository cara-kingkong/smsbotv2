import { describe, expect, it } from 'vitest';
import { detectBookingAcceptance, detectBookingPromise, matchAvailableSlot } from '../../../src/lib/utils/booking-guard';

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

  // Regression (Frank Pali): the qualifying offer used "strategy session", not a
  // tracked scheduling keyword, so an explicit "sounds good" acceptance was being
  // ignored and the thread stalled qualified-not-booked.
  it('detects acceptance when the offer was framed as a "session"', () => {
    const result = detectBookingAcceptance([
      {
        direction: 'outbound',
        body_text:
          'Would you be interested in a free 30-minute strategy session where we can break down your goals?',
      },
      { direction: 'inbound', body_text: 'Yeah I would like that, just to here some advice, sounds good 👍' },
    ]);

    expect(result.schedulingContext).toBe(true);
    expect(result.acceptanceDetected).toBe(true);
    expect(result.evidence).toContain('inbound_explicit_acceptance');
  });
});

describe('detectBookingPromise', () => {
  // Regression (Andrew + Frank): the model narrates the booking in prose but
  // leaves should_offer_times/should_book false, stalling the thread forever.
  it('detects the verbatim stall lines from both stalled threads', () => {
    expect(detectBookingPromise('Great! I’ll get you booked in now. 👍')).toBe(true);
    expect(detectBookingPromise('Perfect. I’ll get you booked in now.')).toBe(true);
    expect(detectBookingPromise('Sweet, let me lock in a time for you.')).toBe(true);
  });

  it('detects other committal booking phrasings', () => {
    expect(detectBookingPromise('Awesome — booking you in now.')).toBe(true);
    expect(detectBookingPromise('Leave it with me, I’ll lock you in.')).toBe(true);
    expect(detectBookingPromise('Let me line up a call for you.')).toBe(true);
  });

  it('does NOT fire on an offer-to-book question (lead has not agreed yet)', () => {
    // This is the qualifying question itself — firing here would offer times
    // before the lead says yes.
    expect(
      detectBookingPromise(
        'Sounds like a great fit. Do you want me to line up a free 30-minute call to map out your strategy?',
      ),
    ).toBe(false);
    expect(detectBookingPromise('Want me to book you in?')).toBe(false);
    expect(detectBookingPromise('Shall I lock in a time?')).toBe(false);
  });

  it('does NOT fire on ordinary replies with no booking commitment', () => {
    expect(detectBookingPromise('No worries — what’s your monthly revenue right now?')).toBe(false);
    expect(detectBookingPromise('Thanks for sharing that, really helpful.')).toBe(false);
    expect(detectBookingPromise('')).toBe(false);
    expect(detectBookingPromise(null)).toBe(false);
    expect(detectBookingPromise(undefined)).toBe(false);
  });

  it('does NOT fire on a negated commitment (AI explicitly not booking)', () => {
    expect(detectBookingPromise("I won't book you in yet — what's your budget first?")).toBe(false);
    expect(detectBookingPromise("I can't lock you in until you confirm budget.")).toBe(false);
  });

  it('still fires when a negation trails the promise (different clause)', () => {
    // The commitment stands; the negation isn't about the booking.
    expect(detectBookingPromise("I'll book you in now, don't worry about a thing.")).toBe(true);
  });
});

describe('scheduling context "chat" handling', () => {
  const accept = (outbound: string, inbound = 'yeah sounds good') =>
    detectBookingAcceptance([
      { direction: 'outbound', body_text: outbound },
      { direction: 'inbound', body_text: inbound },
    ]);

  it('does NOT treat casual "chat" as scheduling context', () => {
    // The previous over-broad keyword would have offered slots off "good to chat".
    expect(accept('Great to chat!').schedulingContext).toBe(false);
    expect(accept('Thanks for the chat earlier.').schedulingContext).toBe(false);
  });

  it('treats a qualified "chat" (a meeting) as scheduling context', () => {
    expect(accept('Want to jump on a quick chat to map this out?').schedulingContext).toBe(true);
    expect(accept('Keen for a 15-min chat this week?').schedulingContext).toBe(true);
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
