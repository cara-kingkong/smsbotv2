/**
 * Injected into the system prompt when the system has blocked a premature
 * booking attempt for this turn (the lead is not yet `qualified`). Steers the
 * regenerated reply back into qualification instead of booking.
 */
export const BOOKING_BLOCKED_NOTE =
  `IMPORTANT — DO NOT BOOK YET: This lead has NOT met your qualification criteria, ` +
  `so booking is currently blocked by the system. Do not offer times, do not say ` +
  `you'll book them in, and do not imply a call is locked in. Instead, ask the single ` +
  `next qualification question that gets you closer to a decision, in your normal warm, ` +
  `casual tone. Set should_offer_times and should_book to false this turn.`;

interface BookingSignal {
  acceptanceDetected: boolean;
  schedulingContext: boolean;
  evidence: string[];
}

/**
 * How far ahead we fetch Calendly availability — for BOTH offering slots and
 * validating a confirmed/proposed time. The two must use the same horizon: a
 * lead can only be matched against, or offered, times we actually fetched. This
 * is the ceiling — a self-proposed time beyond it ("how about in 3 weeks?")
 * won't match and the lead gets offered nearer slots instead. Widen here if you
 * need to honour further-out requests.
 */
export const AVAILABILITY_WINDOW_DAYS = 14;

/**
 * Find the available slot that matches a requested time. Calendly requires the
 * booking `start_time` to EXACTLY match a real available slot — a self-proposed
 * or model-constructed timestamp gets rejected with a 400 — so we compare to
 * the minute and, on a hit, return the slot's own canonical ISO to send back to
 * Calendly. Returns null when the requested time is missing, unparseable, or
 * not currently available (the caller should then offer real slots instead).
 */
export function matchAvailableSlot(
  requestedTime: string | null | undefined,
  slots: string[],
): string | null {
  if (!requestedTime) return null;
  const target = new Date(requestedTime).getTime();
  if (Number.isNaN(target)) return null;
  const targetMinute = Math.floor(target / 60000);

  for (const slot of slots) {
    const slotMs = new Date(slot).getTime();
    if (!Number.isNaN(slotMs) && Math.floor(slotMs / 60000) === targetMinute) {
      return slot;
    }
  }
  return null;
}

interface HistoryMessage {
  direction: string;
  body_text: string;
}

const SCHEDULING_CONTEXT_RE =
  /\b(book|booking|booked|calendar|schedule|scheduled|appointment|meeting|call|availability|available|slot|time)\b/i;
const AFFIRMATIVE_RE =
  /\b(yes|yep|yeah|sure|ok|okay|works|perfect|great|confirmed|confirm|book it|let'?s do it|sounds good|that works|works for me)\b/i;
const TIME_RE =
  /\b(\d{1,2}(:\d{2})?\s?(am|pm)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|tomorrow|next|morning|afternoon|evening)\b/i;

export function detectBookingAcceptance(history: HistoryMessage[]): BookingSignal {
  const latestInbound = [...history].reverse().find((msg) => msg.direction === 'inbound');
  if (!latestInbound) {
    return { acceptanceDetected: false, schedulingContext: false, evidence: [] };
  }

  const inboundIndex = history.findLastIndex((msg) => msg === latestInbound);
  const previousOutbound = inboundIndex > 0
    ? [...history.slice(0, inboundIndex)].reverse().find((msg) => msg.direction === 'outbound')
    : null;

  const inboundText = latestInbound.body_text ?? '';
  const outboundText = previousOutbound?.body_text ?? '';
  const schedulingContext = SCHEDULING_CONTEXT_RE.test(outboundText);
  const outboundHasTime = TIME_RE.test(outboundText);
  const inboundHasTime = TIME_RE.test(inboundText);
  const affirmative = AFFIRMATIVE_RE.test(inboundText);
  const explicitAcceptance = /\b(that works|works for me|book it|confirm(ed)?|let'?s do it|sounds good)\b/i.test(inboundText);

  const evidence: string[] = [];
  if (schedulingContext) evidence.push('prior_outbound_scheduling_context');
  if (outboundHasTime) evidence.push('prior_outbound_time_reference');
  if (affirmative) evidence.push('inbound_affirmation');
  if (inboundHasTime) evidence.push('inbound_time_reference');
  if (explicitAcceptance) evidence.push('inbound_explicit_acceptance');

  return {
    acceptanceDetected: schedulingContext && (explicitAcceptance || (affirmative && (inboundHasTime || outboundHasTime))),
    schedulingContext,
    evidence,
  };
}
