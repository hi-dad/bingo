// A small hate-speech filter for lines, names and game names. Friends roast each other, so
// swearing is fine; slurs and "kill yourself" style taunts are not. Catches the usual
// dodges: capitals, accents, l33t letters, spacing, repeated letters and plurals.
import { BLOCKLIST_B64 } from './blocklist';

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '$': 's', '@': 'a', '!': 'i' };
const squeeze = (w: string) => w.replace(/(.)\1+/g, '$1');

const TERMS = atob(BLOCKLIST_B64).split(',').map((t) => t.trim()).filter(Boolean);
// Long words are also looked for inside text with the spaces taken out ("s l u r").
const WORDS = TERMS.filter((t) => !t.includes(' ')).map((t) => ({ t: squeeze(t), inside: t.length >= 6 }));
const PHRASES = TERMS.filter((t) => t.includes(' ')).map((t) => t.split(' ').map(squeeze).join(' '));

export function isHateful(text: string): boolean {
  const plain = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[013457$@!]/g, (c) => LEET[c]);
  const words = plain.split(/[^a-z]+/).filter(Boolean).map(squeeze);
  const joined = ` ${words.join(' ')} `;
  const squashed = squeeze(words.join(''));
  return WORDS.some(({ t, inside }) => words.some((w) => w === t || w === `${t}s` || w === `${t}z`) || (inside && squashed.includes(t)))
    || PHRASES.some((p) => joined.includes(` ${p} `));
}

export const NOT_ALLOWED = 'Keep it friendly. That one’s not allowed.';
