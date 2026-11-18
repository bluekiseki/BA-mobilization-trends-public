import * as wanakana from 'wanakana';

// Treat trailing romaji as an incomplete syllable only if adding a vowel converts it to kana.
function stripPartialRomaji(converted: string): string {
  const leftover = /[a-z]+$/i.exec(converted)?.[0];
  if (!leftover) return converted;
  return /[a-z]/i.test(wanakana.toHiragana(`${leftover}a`)) ? converted : converted.slice(0, -leftover.length) || converted;
}

export default function match(target: string, query: string): boolean {
  const normTarget = wanakana.toHiragana(target.normalize('NFKC'));
  const normQuery = stripPartialRomaji(wanakana.toHiragana(query.normalize('NFKC')));
  return normTarget.includes(normQuery);
}
