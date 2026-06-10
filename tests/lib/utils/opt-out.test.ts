import { describe, expect, it } from 'vitest';
import { isOptOut } from '../../../src/lib/utils/opt-out';

describe('isOptOut', () => {
  describe('bare keywords (entire message)', () => {
    it.each(['stop', 'STOP', 'Stop', ' stop ', 'unsubscribe', 'quit', 'end', 'END'])(
      'opts out: %s',
      (body) => {
        expect(isOptOut(body)).toBe(true);
      },
    );
  });

  describe('keyword with extra context (leads with keyword)', () => {
    it.each([
      'Unsubscribe - sold business',
      'STOP texting me',
      'stop please',
      'Stop, I am not interested',
      'unsubscribe me please',
      'quit it',
      'End. Thanks.',
    ])('opts out: %s', (body) => {
      expect(isOptOut(body)).toBe(true);
    });
  });

  describe('"unsubscribe" anywhere in the message', () => {
    it.each([
      'please unsubscribe me',
      'can you unsubscribe me from this',
      'yes, unsubscribe',
    ])('opts out: %s', (body) => {
      expect(isOptOut(body)).toBe(true);
    });
  });

  describe('conversational use of ambiguous words (NOT opt-outs)', () => {
    it.each([
      "the end of the day works",
      'I quit my job last week',
      "don't stop, this is great",
      'can you stop by tomorrow at the end of your shift', // not leading; "stop"/"end" mid-sentence
      'see you on the weekend', // contains "end" but not as a standalone word
      'sounds good, talk soon',
      'No',
      'Will do!',
    ])('stays active: %s', (body) => {
      expect(isOptOut(body)).toBe(false);
    });
  });

  describe('inflections are not opt-outs', () => {
    it.each(['stopper sold out', 'ending the meeting now', 'quitting time is 5pm'])(
      'stays active: %s',
      (body) => {
        expect(isOptOut(body)).toBe(false);
      },
    );
  });

  describe('empty / nullish input', () => {
    it.each([null, undefined, '', '   '])('returns false: %s', (body) => {
      expect(isOptOut(body)).toBe(false);
    });
  });
});
