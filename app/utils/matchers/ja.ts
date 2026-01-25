import * as wanakana from 'wanakana';
export default function match(target: string, query: string): boolean {
  const normTarget = wanakana.toHiragana(target.normalize('NFKC'));
  const normQuery = wanakana.toHiragana(query.normalize('NFKC'));
  return normTarget.includes(normQuery);
}
