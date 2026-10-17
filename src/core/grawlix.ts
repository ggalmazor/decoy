import { hashString, mulberry32 } from './rng';

// Words the phrase data flags as profane. The website never prints these in plain: the first letter stays
// and the rest is swapped for comic-book symbols, Asterix style, while the mosaic still gets the real word.
const PROFANE = ['fucking', 'fuck', 'shithead', 'dipshit', 'shit', 'piss', 'bugger', 'bollocks', 'sod', 'fu'];
const SYMBOLS = ['@', '#', '$', '%', '&', '*', '!'];
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

const pattern = new RegExp(`\\b(${PROFANE.join('|')})\\b`, 'gi');

export function grawlixWord(word: string, rng: () => number): string {
  const letters = word.split('');
  let masked = 0;
  for (let i = 1; i < letters.length; i++) {
    if (VOWELS.has(letters[i].toLowerCase())) {
      letters[i] = SYMBOLS[Math.floor(rng() * SYMBOLS.length)]!;
      masked++;
    }
  }
  if (masked === 0 && letters.length > 1) {
    letters[1] = SYMBOLS[Math.floor(rng() * SYMBOLS.length)]!;
  }
  return letters.join('');
}

export function grawlix(text: string): string {
  const rng = mulberry32(hashString(text, 11));
  return text.replace(pattern, (word) => grawlixWord(word, rng));
}

export function hasProfanity(text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}
