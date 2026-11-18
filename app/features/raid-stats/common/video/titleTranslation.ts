import bossData from '~/data/bossdata.json';
import type { Student } from '~/types/data';
import { TITLE_GLOSSARY, type TermLocale } from './titleGlossary';

/** A concept with surface forms in any locale; every form is rendered as `label[target]`. */
export interface TermConcept {
  label: Partial<Record<TermLocale, string>>;
  forms: Partial<Record<TermLocale, string[]>>;
  /** Higher priority wins when two concepts share a surface form with different outputs. */
  priority: number;
  /** Curated concepts may use single-character forms. */
  allowShortForms?: boolean;
}

export type StudentsByLocale = Partial<Record<TermLocale, Record<string, Student>>>;

export type TitleSegment = string | { src: string; dst: string };

export interface TitleDictionary {
  /** Lower-cased surface forms grouped by first character, longest first. */
  byFirstChar: Map<string, Array<{ key: string; dst: string; locales: Set<TermLocale> }>>;
}

const PRIORITY = { costume: 1, glossary: 2, boss: 3, student: 4 } as const;
const LOCALES: TermLocale[] = ['ko', 'en', 'ja', 'zh_Hant'];

type CharClass = 'latin' | 'katakana' | 'hiragana' | 'hangul' | 'han' | 'other';

function charClass(ch: string | undefined): CharClass {
  if (!ch) return 'other';
  if (/[A-Za-z]/.test(ch)) return 'latin';
  // The middle dot (U+30FB) is punctuation, not part of a word.
  if (/[\u30A1-\u30FA\u30FC-\u30FF\uFF66-\uFF9F]/.test(ch)) return 'katakana';
  if (/[\u3040-\u309F]/.test(ch)) return 'hiragana';
  if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(ch)) return 'hangul';
  if (/[\u3400-\u9FFF\uF900-\uFAFF]/.test(ch)) return 'han';
  return 'other';
}

// Very short forms match inside unrelated words too easily.
function isUsableForm(form: string, allowShort: boolean): boolean {
  if (charClass(form[0]) === 'latin') return form.length >= (allowShort ? 2 : 3);
  return form.length >= (allowShort ? 1 : 2);
}

const COSTUME_RE = /^(.+?)\s*[（(](.+?)[）)]$/;

function splitCostume(name: string): { base: string; costume: string } | null {
  const m = name.match(COSTUME_RE);
  return m ? { base: m[1], costume: m[2] } : null;
}

// Move parenthesized variants before the name: "Kasumi (Swimsuit)" -> "Swimsuit Kasumi".
function costumePrefixForm(name: string, locale: TermLocale): string | null {
  const parts = splitCostume(name);
  if (!parts) return null;
  const joiner = locale === 'en' || locale === 'ko' ? ' ' : '';
  return `${parts.costume}${joiner}${parts.base}`;
}

export function glossaryConcepts(): TermConcept[] {
  return Object.values(TITLE_GLOSSARY).map(({ label, aliases }) => ({
    label,
    forms: Object.fromEntries(LOCALES.map((l) => [l, [label[l], ...(aliases?.[l] ?? [])]])),
    priority: PRIORITY.glossary,
    allowShortForms: true,
  }));
}

export function bossConcepts(): TermConcept[] {
  return Object.values(bossData).map(({ name }) => ({
    label: name,
    forms: Object.fromEntries(LOCALES.map((l) => [l, [name[l]]])),
    priority: PRIORITY.boss,
  }));
}

/** One concept per student id, plus costume words derived from "Name (Costume)" pairs across locales. */
export function studentConcepts(students: StudentsByLocale): TermConcept[] {
  const ids = new Set<string>();
  for (const l of LOCALES) for (const id of Object.keys(students[l] ?? {})) ids.add(id);

  const concepts: TermConcept[] = [];
  const costumes = new Map<string, { label: Partial<Record<TermLocale, string>>; count: number }>();
  for (const id of ids) {
    const label: Partial<Record<TermLocale, string>> = {};
    const forms: Partial<Record<TermLocale, string[]>> = {};
    const costumeLabel: Partial<Record<TermLocale, string>> = {};
    for (const l of LOCALES) {
      const student = students[l]?.[id];
      if (!student) continue;
      label[l] = student.Name;
      const prefixed = costumePrefixForm(student.Name, l);
      // Titles may omit the star separator in variant names.
      const unstarred = student.Name.replace(/\s*[＊*]\s*/g, '');
      forms[l] = [student.Name, ...student.SearchTags, ...(prefixed ? [prefixed] : []), ...(unstarred !== student.Name ? [unstarred] : [])];
      const costume = splitCostume(student.Name)?.costume;
      if (costume) costumeLabel[l] = costume;
    }
    concepts.push({ label, forms, priority: PRIORITY.student });
    if (Object.keys(costumeLabel).length > 1) {
      const key = JSON.stringify(costumeLabel);
      const entry = costumes.get(key);
      if (entry) entry.count++;
      else costumes.set(key, { label: costumeLabel, count: 1 });
    }
  }
  // A costume word shared by more students wins over rare variants of the same word.
  for (const { label, count } of costumes.values()) {
    concepts.push({ label, forms: Object.fromEntries(Object.entries(label).map(([l, v]) => [l, [v]])), priority: PRIORITY.costume + count / 1000 });
  }
  return concepts;
}

export function buildTitleDictionary(concepts: TermConcept[], target: TermLocale): TitleDictionary {
  // Forms already written in the target locale are never rewritten.
  const targetForms = new Set<string>();
  for (const c of concepts) {
    for (const f of c.forms[target] ?? []) targetForms.add(f.toLowerCase());
    const own = c.label[target];
    if (own) targetForms.add(own.toLowerCase());
  }

  const entries = new Map<string, { dst: string; priority: number; locales: Set<TermLocale> }>();
  const ambiguous = new Set<string>();
  // Process higher priorities first so a lower-priority clash never blocks them.
  for (const c of [...concepts].sort((a, b) => b.priority - a.priority)) {
    const dst = c.label[target];
    if (!dst) continue;
    for (const l of LOCALES) {
      if (l === target) continue;
      for (const form of c.forms[l] ?? []) {
        const key = form.toLowerCase();
        if (!isUsableForm(form, c.allowShortForms ?? false) || targetForms.has(key) || ambiguous.has(key)) continue;
        const prev = entries.get(key);
        if (!prev) entries.set(key, { dst, priority: c.priority, locales: new Set([l]) });
        else if (prev.dst === dst) prev.locales.add(l);
        else if (prev.dst !== dst && prev.priority === c.priority) {
          entries.delete(key);
          ambiguous.add(key);
        }
      }
    }
  }

  const byFirstChar: TitleDictionary['byFirstChar'] = new Map();
  for (const [key, { dst, locales }] of entries) {
    const list = byFirstChar.get(key[0]) ?? [];
    list.push({ key, dst, locales });
    byFirstChar.set(key[0], list);
  }
  for (const list of byFirstChar.values()) list.sort((a, b) => b.key.length - a.key.length);
  return { byFirstChar };
}

// Whether `text` can be split entirely into dictionary forms.
function isTileable(text: string, dict: TitleDictionary): boolean {
  const reachable = [true, ...Array<boolean>(text.length).fill(false)];
  for (let i = 0; i < text.length; i++) {
    if (!reachable[i]) continue;
    for (const { key } of dict.byFirstChar.get(text[i]) ?? []) {
      if (text.startsWith(key, i)) reachable[i + key.length] = true;
    }
  }
  return reachable[text.length];
}

/**
 * Reject matches that are only part of a longer word. Japanese writes words without spaces,
 * so kana neighbours are judged by the leftover piece of the same-script run:
 * - katakana: the leftover must be empty, made of other dictionary forms, or itself a word
 *   (2+ chars next to a 3+ char form). Reject fragments of ordinary words.
 * - hiragana: allow trailing particles, but reject forms that start mid-word.
 */
function isAtBoundary(lower: string, start: number, end: number, dict: TitleDictionary): boolean {
  const keyLength = end - start;
  const sideOk = (side: 'before' | 'after'): boolean => {
    const edge = side === 'before' ? start : end - 1;
    const cls = charClass(lower[edge]);
    const neighbor = side === 'before' ? start - 1 : end;
    if (charClass(lower[neighbor]) !== cls) return true;
    switch (cls) {
      case 'latin':
        return false;
      case 'hangul':
        // Korean particles may follow a noun.
        return side === 'after';
      case 'hiragana':
      case 'katakana': {
        if (cls === 'hiragana' && side === 'after') return true;
        let from = neighbor;
        const step = side === 'before' ? -1 : 1;
        while (charClass(lower[from + step]) === cls) from += step;
        const piece = side === 'before' ? lower.slice(from, start) : lower.slice(end, from + 1);
        return isTileable(piece, dict) || (cls === 'katakana' && keyLength >= 3 && piece.length >= 2);
      }
      default:
        return true;
    }
  };
  return sideOk('before') && sideOk('after');
}

export function segmentTitle(title: string, dict: TitleDictionary): TitleSegment[] {
  // Lower-case per character so indexes stay aligned with the original title.
  const lower = Array.from(title, (ch) => {
    const l = ch.toLowerCase();
    return l.length === ch.length ? l : ch;
  }).join('');
  // Han-only forms from Chinese are skipped in Japanese titles, where the same characters
  // may also be ordinary words in another language.
  const isJapanese = /[\u3040-\u30FF]/.test(title);
  const usable = (locales: Set<TermLocale>, key: string) => !isJapanese || locales.has('ja') || charClass(key[0]) !== 'han';
  const segments: TitleSegment[] = [];
  let plain = '';
  let i = 0;
  while (i < title.length) {
    const match = dict.byFirstChar.get(lower[i])?.find(({ key, locales }) => lower.startsWith(key, i) && usable(locales, key) && isAtBoundary(lower, i, i + key.length, dict));
    if (!match) {
      plain += title[i];
      i++;
      continue;
    }
    if (plain) segments.push(plain);
    plain = '';
    segments.push({ src: title.slice(i, i + match.key.length), dst: match.dst });
    i += match.key.length;
  }
  if (plain) segments.push(plain);
  return spaceTranslatedWords(segments);
}

const isWordChar = (ch: string | undefined) => !!ch && (/[0-9]/.test(ch) || charClass(ch) === 'latin' || charClass(ch) === 'hangul');
const textOf = (s: TitleSegment) => (typeof s === 'string' ? s : s.dst);

// Japanese titles have no spaces between words; space-separated targets (en, ko) need one
// where a translated word touches another word or a season number.
function spaceTranslatedWords(segments: TitleSegment[]): TitleSegment[] {
  const result: TitleSegment[] = [];
  for (const seg of segments) {
    const prev = result[result.length - 1];
    if (prev !== undefined && (typeof prev !== 'string' || typeof seg !== 'string')) {
      const left = textOf(prev);
      const right = textOf(seg);
      if (isWordChar(left[left.length - 1]) && isWordChar(right[0])) result.push(' ');
    }
    result.push(seg);
  }
  return result;
}
