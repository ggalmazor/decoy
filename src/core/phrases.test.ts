import { describe, expect, it } from 'vitest';
import { allPhrases, fallbacksFor, MOODS, phrasesFor } from './phrases';

describe('phrases', () => {
  it('has at least 40 distinct phrases per mood', () => {
    for (const mood of MOODS) {
      const texts = allPhrases(mood).map((p) => p.text);
      expect(texts.length, mood).toBeGreaterThanOrEqual(40);
      expect(new Set(texts.map((t) => t.toLowerCase())).size).toBe(texts.length);
    }
  });

  it('clean mode never yields a profane entry in any mood', () => {
    for (const mood of MOODS) {
      expect(
        phrasesFor(mood, true).every((p) => !p.profane),
        mood,
      ).toBe(true);
      expect(
        fallbacksFor(mood, true).every((p) => !p.profane),
        mood,
      ).toBe(true);
    }
  });

  it('clean mode still leaves plenty of rude phrases', () => {
    expect(phrasesFor('rude', true).length).toBeGreaterThanOrEqual(30);
    expect(phrasesFor('rude', false).length).toBeGreaterThan(phrasesFor('rude', true).length);
  });

  it('flags the swear words by data, not by regex', () => {
    const rude = allPhrases('rude');
    for (const phrase of rude) {
      if (/\b(fuck|piss|sod|bugger|shit|dipshit|bollocks)/i.test(phrase.text)) {
        expect(phrase.profane, phrase.text).toBe(true);
      }
    }
    expect(rude.find((p) => p.text === 'back off, nerd')?.profane).toBe(false);
    expect(rude.find((p) => p.text === 'fuck off, nerd')?.profane).toBe(true);
  });

  it('only the rude mood has a profane fallback', () => {
    expect(fallbacksFor('rude', false).some((p) => p.text === 'fu')).toBe(true);
    expect(fallbacksFor('rude', true).some((p) => p.text === 'fu')).toBe(false);
    expect(fallbacksFor('smug', false).some((p) => p.text === 'fu')).toBe(false);
    expect(fallbacksFor('wholesome', false)[0].text).toBe('no');
  });

  it('expands templates into every combination', () => {
    const corporate = allPhrases('corporate').map((p) => p.text);
    expect(corporate).toContain('per my last email: hard pass');
    expect(corporate).toContain('quick sync: still no');
  });
});
