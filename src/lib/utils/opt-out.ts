/**
 * Detect whether an inbound SMS is an opt-out / unsubscribe request.
 *
 * SMS compliance (TCPA + carrier conventions) requires honouring opt-out
 * keywords — STOP, UNSUBSCRIBE, QUIT, END — even when the lead adds context
 * around them ("Unsubscribe - sold business", "STOP texting me"). The previous
 * check only matched when the *entire* trimmed message was a single keyword, so
 * anything with extra words slipped through and the lead kept being messaged.
 *
 * "cancel" is deliberately excluded: leads use it to cancel a booking, not to
 * opt out of messaging.
 *
 * Matching is intentionally biased toward honouring opt-outs — missing a real
 * one is a compliance risk, while a rare false positive only costs a lead:
 *  - the message LEADS with an opt-out keyword (the overwhelmingly common
 *    real-world shape), e.g. "stop", "Unsubscribe - sold business", "Quit"; or
 *  - the message contains the unambiguous word "unsubscribe" anywhere — no one
 *    writes "unsubscribe" conversationally except to opt out.
 *
 * The ambiguous keywords (stop / quit / end) are NOT matched mid-sentence, so
 * everyday phrases like "the end of the day", "I quit my job", and "don't stop"
 * keep the conversation active.
 */

// Leading keyword: keyword at the start, bounded so inflections like
// "stopper", "ending", or "quitting" do NOT match.
const OPT_OUT_LEADING_RE = /^\s*(stop|unsubscribe|quit|end)\b/i;

// "unsubscribe" anywhere — unambiguous enough to honour wherever it appears.
const OPT_OUT_ANYWHERE_RE = /\bunsubscribe\b/i;

export function isOptOut(bodyText: string | null | undefined): boolean {
  const text = (bodyText ?? '').trim();
  if (!text) return false;
  return OPT_OUT_LEADING_RE.test(text) || OPT_OUT_ANYWHERE_RE.test(text);
}
