import { expect, test } from 'vitest';
import { isHateful } from '../src/filter';
import { BLOCKLIST_B64 } from '../src/blocklist';

// Built from the list itself, so the test doesn't spell slurs out either.
const terms = atob(BLOCKLIST_B64).split(',');
const words = terms.filter((t) => !t.includes(' '));
const phrases = terms.filter((t) => t.includes(' '));
const leet = (w: string) => w.replace(/o/g, '0').replace(/i/g, '1').replace(/e/g, '3').replace(/a/g, '4');

test('every listed word is caught, with the usual dodges', () => {
  for (const w of words) {
    expect(isHateful(w), w).toBe(true);
    expect(isHateful(`says ${w.toUpperCase()} a lot`), w).toBe(true);
    expect(isHateful(`${w}s`), w).toBe(true);
    expect(isHateful(leet(w)), w).toBe(true);
    expect(isHateful(w.replace(/(.)/, '$1$1$1')), w).toBe(true); // stretched letters
    if (w.length >= 6) expect(isHateful(w.split('').join(' ')), w).toBe(true); // s p a c e d
  }
});

test('listed phrases are caught in a sentence', () => {
  for (const p of phrases) {
    expect(isHateful(`lol ${p}`), p).toBe(true);
    expect(isHateful(p.toUpperCase().replace(/ /g, '   ')), p).toBe(true);
  }
});

test('ordinary lines, swearing and near-misses pass', () => {
  for (const ok of [
    'Talks crypto', '“No because…”', 'Says “f*** this” at least twice', 'Damn it Dan', 'Mentions the gym',
    'Going to go diet starting Monday', 'Skyscraper facts', 'Raccoon in the trash again', 'Spicy food challenge',
    'Pakistan trip stories', 'Bigger is better', 'Fagioli recipe',
  ]) {
    expect(isHateful(ok), ok).toBe(false);
  }
});
