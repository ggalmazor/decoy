import { describe, expect, it } from 'vitest';
import { grawlix, hasProfanity } from './grawlix';
import { allPhrases, MOODS } from './phrases';

describe('grawlix', () => {
  it('keeps the first letter and swaps the vowels for symbols', () => {
    const out = grawlix('fuck off');
    expect(out).toMatch(/^f[@#$%&*!]ck off$/);
    expect(grawlix('piss off, nerd')).toMatch(/^p[@#$%&*!]ss off, nerd$/);
    expect(grawlix('bugger off')).toMatch(/^b[@#$%&*!]gg[@#$%&*!]r off$/);
  });

  it('is deterministic for the same text', () => {
    expect(grawlix('fuck right off')).toBe(grawlix('fuck right off'));
  });

  it('leaves clean text alone', () => {
    expect(grawlix('nice try, enhance harder')).toBe('nice try, enhance harder');
    expect(grawlix('you thought this was a password?')).toBe('you thought this was a password?');
  });

  it('masks every profane phrase in the data and no clean one', () => {
    for (const mood of MOODS) {
      for (const phrase of allPhrases(mood)) {
        if (phrase.profane) {
          expect(hasProfanity(phrase.text), phrase.text).toBe(true);
          expect(grawlix(phrase.text), phrase.text).not.toBe(phrase.text);
        } else {
          expect(hasProfanity(phrase.text), phrase.text).toBe(false);
        }
      }
    }
    expect(grawlix('fu')).toMatch(/^f[@#$%&*!]$/);
  });
});
