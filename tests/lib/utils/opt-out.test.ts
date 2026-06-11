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

  describe('"unsubscribe" inflections anywhere', () => {
    it.each([
      'I have unsubscribed from King Kong years ago, remove me from your list',
      'I unsubscribed ages ago',
      'stop, I already unsubscribed',
      'why am I still getting these, unsubscribing now',
    ])('opts out: %s', (body) => {
      expect(isOptOut(body)).toBe(true);
    });
  });

  describe('natural-language removal phrases (no bare keyword)', () => {
    it.each([
      'Remove me from your list',
      'please remove me from your list',
      'can you take me off your list',
      'take me off this list please',
      'do not contact me again',
      "don't contact me",
      'please stop contacting me',
      'stop texting me',
      'stop messaging me please',
      "don't call me again",
      'stop emailing me',
      'do not contact us again',
      'opt me out',
      'I want to opt out',
      'I opted out of this',
      'delete my number',
      'remove my number from your database',
      'this is unsolicited. Remove me from your list.',
    ])('opts out: %s', (body) => {
      expect(isOptOut(body)).toBe(true);
    });
  });

  describe('similar phrasing that is NOT a removal request', () => {
    it.each([
      'remove the first item from my cart',
      'can you take the discount off the total',
      'I had to stop by the office',
      'do not forget to send the details',
      'delete my old booking and rebook me', // about a booking, not contact removal
      "don't call it that, call it a strategy session", // "call" without an opt-out object
      'can you stop texting the wrong number', // object is "the wrong number", not me/us
    ])('stays active: %s', (body) => {
      expect(isOptOut(body)).toBe(false);
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
