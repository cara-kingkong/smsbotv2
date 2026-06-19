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

// "chat" is deliberately NOT a bare keyword — it's far too common in casual SMS
// ("thanks for the chat", "good to chat") and would over-trigger the acceptance
// fallback. It only counts as scheduling context when qualified as a meeting
// ("a chat", "quick chat", "30-min chat"). session/catch-up cover the rest.
const SCHEDULING_CONTEXT_RE =
  /\b(?:book|booking|booked|calendar|schedule|scheduled|appointment|meeting|call|availability|available|slot|time|session|catch[\s-]?up)\b|\b(?:a|quick|short|brief|free|\d{1,3}[\s-]?min(?:ute)?s?)\s+chat\b/i;
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

// Phrases where the AI COMMITS to booking the lead in — a declarative promise,
// not a question. These are the lines the model emits once the lead has agreed
// ("Great! I'll get you booked in now", "let me lock in a time for you").
const BOOKING_PROMISE_RE =
  /\b(book(?:ing|ed)? you in|get(?:ting)? you booked|booked in(?: now)?|lock(?:ing)? (?:you |that |it )?in\b|lock in (?:a )?time|set(?:ting)? up (?:a |the )?(?:call|time|booking)|line up (?:a |the )?(?:call|time))\b/i;

// Interrogative offers to book ("want me to book you in?", "shall I line up a
// call?"). These are NOT commitments — the lead hasn't agreed yet — so a promise
// must NOT be inferred from them, or we'd offer times before the lead says yes.
const BOOKING_OFFER_QUESTION_RE =
  /\b(want me to|would you like(?: me)?|shall i|should i|do you want me to|happy for me to|can i|may i)\b[^.!?]*\b(book|lock|set up|line up)/i;

// Negated commitments ("I won't book you in yet", "I can't lock you in until you
// confirm budget"). The booking phrase is present but the AI is explicitly NOT
// booking, so a promise must not be inferred. Only matches when the negation
// precedes the booking verb within the same sentence, so a genuine promise with
// a trailing aside ("I'll book you in, don't worry") is unaffected.
const BOOKING_NEGATION_RE =
  /\b(won'?t|will not|can'?t|cannot|can not|not going to|don'?t|do not|unable to|haven'?t)\b[^.!?]*\b(book|lock|set up|line up|get you booked)/i;

/**
 * Did the AI's own reply COMMIT to booking the lead in (vs. merely offer to)?
 *
 * The model intermittently narrates the booking in prose ("I'll get you booked
 * in now") while leaving `should_offer_times`/`should_book` false — the thread
 * then stalls `WaitingForLead` forever even though the lead already agreed. The
 * orchestrator treats a detected promise as an intent to offer times so the slot
 * menu actually goes out. Interrogative offers ("want me to book you in?") are
 * deliberately excluded: there the lead hasn't said yes, so offering times would
 * jump the gun.
 */
export function detectBookingPromise(replyText: string | null | undefined): boolean {
  const text = (replyText ?? '').trim();
  if (!text) return false;
  if (BOOKING_OFFER_QUESTION_RE.test(text)) return false;
  if (BOOKING_NEGATION_RE.test(text)) return false;
  return BOOKING_PROMISE_RE.test(text);
}
