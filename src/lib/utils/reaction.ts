/**
 * Detect whether an inbound SMS is an "emoji reaction" rather than a real message.
 *
 * Two shapes are recognised:
 *  - tapback: iMessage/RCS reactions that bridge to SMS as text, e.g.
 *      `Loved "your message"`, `Laughed at "..."`, `Emphasized an image`,
 *      `Reacted 👍 to "..."`.
 *  - emoji: a message whose entire content is emoji (a 👍 / ❤️ / 😂 sent as a
 *      lightweight acknowledgement), with no actual words.
 *
 * The result is advisory: it's passed to the AI so the model can decide whether
 * a reply is genuinely warranted, mirroring how a person texts (you usually
 * don't reply to a thumbs-up).
 */
export interface ReactionInfo {
  kind: 'tapback' | 'emoji';
  /** Short human-readable description for the AI prompt. */
  description: string;
}

// iMessage/RCS tapbacks bridged to SMS. Quotes may be straight or curly; some
// reactions reference media instead of quoted text ("Loved an image").
const TAPBACK_VERB_RE =
  /^(loved|liked|disliked|laughed at|emphasi[sz]ed|questioned)\b/i;
const TAPBACK_REACTED_RE = /^reacted\s+.{0,8}\s*to\b/i;
const TAPBACK_REMOVED_RE = /^removed (a|an|the)\b.*\bfrom\b/i;

export function detectReaction(bodyText: string | null | undefined): ReactionInfo | null {
  const text = (bodyText ?? '').trim();
  if (!text) return null;

  if (
    TAPBACK_VERB_RE.test(text) ||
    TAPBACK_REACTED_RE.test(text) ||
    TAPBACK_REMOVED_RE.test(text)
  ) {
    return { kind: 'tapback', description: `Tapback-style reaction: "${text}"` };
  }

  if (isEmojiOnly(text)) {
    return { kind: 'emoji', description: `Emoji-only reaction: "${text}"` };
  }

  return null;
}

/**
 * Build the system-prompt guidance shown to the model when the lead's latest
 * message is a reaction, so it can decide whether a reply is warranted.
 */
export function reactionPromptNote(reaction: ReactionInfo): string {
  return [
    'REACTION NOTICE:',
    `The lead's most recent message looks like an emoji reaction, not a real message (${reaction.description}).`,
    'In normal texting, people usually do NOT reply to a reaction — a 👍 or "Loved ..." is an acknowledgement, not a new message or a question.',
    'Decide whether a reply is genuinely warranted:',
    '- If the reaction just acknowledges your last message and nothing further is needed, set should_reply to false and leave reply_text empty. Do NOT treat the reaction as a new message to answer, and do NOT escalate.',
    '- Only reply if the reaction clearly invites or requires a response (e.g. a questioning/confused reaction to something that needs clarifying, or it changes the booking state).',
  ].join('\n');
}

/**
 * True when the message is nothing but emoji (plus the modifiers/joiners that
 * compose them) and whitespace — i.e. there are no actual words. Requires at
 * least one pictographic character so plain punctuation isn't misclassified.
 */
function isEmojiOnly(text: string): boolean {
  if (!/\p{Extended_Pictographic}/u.test(text)) return false;

  // Strip emoji and everything that combines into them (modifiers, skin tones,
  // ZWJ, variation selectors, regional indicators, keycap digits/#/*), plus
  // whitespace. Keycap emoji like 1️⃣ require allowing those base chars.
  const stripped = text.replace(
    /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Modifier_Base}|\p{Regional_Indicator}|\u200d|\uFE0F|\u20E3|[\s0-9#*]/gu,
    '',
  );
  return stripped.length === 0;
}
