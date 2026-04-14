interface BookingSignal {
  acceptanceDetected: boolean;
  schedulingContext: boolean;
  evidence: string[];
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
