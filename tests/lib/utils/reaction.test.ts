import { describe, expect, it } from 'vitest';
import { detectReaction, reactionPromptNote } from '../../../src/lib/utils/reaction';

describe('detectReaction', () => {
  describe('tapbacks', () => {
    it.each([
      'Loved "Looking forward to chatting!"',
      'Liked "See you then"',
      'Disliked "We only have mornings free"',
      'Laughed at "haha good one"',
      'Emphasized "This is important"',
      'Emphasised "British spelling"',
      'Questioned "Are you sure?"',
      'Reacted 👍 to "See you Tuesday"',
      'Reacted ❤️ to "Thanks so much"',
      'Removed a heart from "your message"',
      'Loved an image',
    ])('detects tapback: %s', (body) => {
      const result = detectReaction(body);
      expect(result?.kind).toBe('tapback');
    });
  });

  describe('emoji-only reactions', () => {
    it.each(['👍', '❤️', '😂', '👍👍', '🙏🏽', '👍 ', '🔥🔥🔥', '👨‍👩‍👧'])(
      'detects emoji-only: %s',
      (body) => {
        const result = detectReaction(body);
        expect(result?.kind).toBe('emoji');
      },
    );
  });

  describe('real messages (not reactions)', () => {
    it.each([
      'Yes that works for me',
      '👍 sounds good',
      'Tuesday at 2pm please',
      'I loved the demo, can we talk?',
      'haha that was funny, what time?',
      'Stop',
      '',
      '   ',
    ])('does not flag real message: %s', (body) => {
      expect(detectReaction(body)).toBeNull();
    });

    it('handles null/undefined', () => {
      expect(detectReaction(null)).toBeNull();
      expect(detectReaction(undefined)).toBeNull();
    });
  });
});

describe('reactionPromptNote', () => {
  it('includes the reaction description and steers toward not replying', () => {
    const note = reactionPromptNote({ kind: 'emoji', description: 'Emoji-only reaction: "👍"' });
    expect(note).toContain('REACTION NOTICE');
    expect(note).toContain('👍');
    expect(note).toContain('should_reply to false');
  });
});
