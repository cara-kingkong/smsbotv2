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
 *  - the message contains an "unsubscribe" word anywhere (including inflections
 *    like "unsubscribed" / "unsubscribing") — no one writes these
 *    conversationally except to opt out; or
 *  - the message contains an unambiguous natural-language removal phrase such as
 *    "remove me from your list" or "stop contacting me". Leads phrase opt-outs
 *    in plain English far more often than with a bare keyword, and the
 *    deterministic keyword check is the ONLY thing that reliably triggers the
 *    OptedOut result (the AI's request_removal flag is a secondary safety net),
 *    so these high-precision phrases are matched directly.
 *
 * The ambiguous keywords (stop / quit / end) are NOT matched mid-sentence, so
 * everyday phrases like "the end of the day", "I quit my job", and "don't stop"
 * keep the conversation active.
 */

// Leading keyword: keyword at the start, bounded so inflections like
// "stopper", "ending", or "quitting" do NOT match.
const OPT_OUT_LEADING_RE = /^\s*(stop|unsubscribe|quit|end)\b/i;

// Any "unsubscribe" inflection anywhere — unsubscribe / unsubscribed /
// unsubscribing / unsubscription. Unambiguous wherever it appears.
const OPT_OUT_ANYWHERE_RE = /\bunsubscrib\w*\b/i;

// High-precision natural-language removal phrases. These read as opt-outs in
// virtually every real-world context, so they're honoured anywhere in the
// message. Kept deliberately specific to avoid false positives (e.g. "remove
// the first item from my cart" must NOT match — only "remove me" does).
const OPT_OUT_PHRASE_RES: RegExp[] = [
  /\bremove me\b/i,
  /\btake me off\b/i,
  /\b(opt|opting) me out\b/i,
  /\bopt(?:ed|ing)? out\b/i,
  // Cessation verb + communication verb + an opt-out object. The object
  // ("me" / "us" / "again" / "my number…") is required so everyday phrases like
  // "don't call it that" or "stop texting the group" don't read as opt-outs.
  // ("don't call me a liar" still matches, but that's a rare, accepted miss.)
  /\b(do not|don'?t|stop|quit|cease|please stop) (contact|text|messag|email|call)\w* (me|us|again|my (number|details|info|information))\b/i,
  /\b(delete|remove) my (number|details|contact|info|information)\b/i,
  /\bremove (me|my number) from (your|the|this) (list|contacts?|database|system)\b/i,
  /\bunsubscribe me\b/i,
];

export function isOptOut(bodyText: string | null | undefined): boolean {
  const text = (bodyText ?? '').trim();
  if (!text) return false;
  if (OPT_OUT_LEADING_RE.test(text) || OPT_OUT_ANYWHERE_RE.test(text)) return true;
  return OPT_OUT_PHRASE_RES.some((re) => re.test(text));
}
