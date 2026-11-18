import { describe, expect, it } from 'vitest';
import type { StoryIndex } from '~/features/story/logic/types';
import { favorStoryIds, isStoryReleased, studentAppearances, studentCharacterKeys } from './appearances';

const text = (value: string) => ({ en: value });
const index: StoryIndex = {
  series: {
    'Main/a': { c: 'Main', name: text('A'), stories: ['m1', 'm2'] },
    'Event/1': { c: 'Event', name: text('E'), stories: ['e1'] },
    'Favor/10000': { c: 'Favor', name: { ko: 'Aru' }, stories: ['f1', 'f2'] },
    'Favor/10001': { c: 'Favor', name: { ko: 'Mika' }, stories: ['g1'] },
  },
  stories: {
    m1: { s: 'Main/a', o: 1, t: text('m1'), c: ['Aru'] },
    m2: { s: 'Main/a', o: 2, t: text('m2'), c: ['Mika', 'Aru'] },
    e1: { s: 'Event/1', o: 1, t: text('e1'), c: ['Mika'] },
    f1: { s: 'Favor/10000', o: 1, t: text('f1'), c: ['Aru'] },
    f2: { s: 'Favor/10000', o: 2, t: text('f2'), c: ['Aru'] },
    g1: { s: 'Favor/10001', o: 1, t: text('g1'), c: ['Mika', 'Aru'] },
  },
  chars: { Aru: text('Aru'), Mika: text('Mika') },
  cs: { Aru: '10000' },
  vs: { 'Aru NewYear': '10031' },
  bgm: {},
};

describe('outfit appearances', () => {
  const outfit: StoryIndex = {
    ...index,
    series: { ...index.series, 'Favor/10031': { c: 'Favor', name: { ko: 'Aru' }, stories: [] } },
    stories: {
      ...index.stories,
      m1: { ...index.stories.m1, v: { Aru: ['Aru', 'Aru NewYear'] } },
      m2: { ...index.stories.m2, v: { Aru: ['Aru NewYear'] } },
      e1: { ...index.stories.e1, c: ['Aru'], v: { Aru: ['Aru Injured'] } },
    },
  };
  const ids = (studentId: number) => studentAppearances(outfit, studentId, {}).flatMap((row) => row.stories.map((story) => story.id));

  it('lists only the stories the outfit speaks in for an outfit student', () => {
    expect(ids(10031)).toEqual(['m1', 'm2']);
  });

  it('leaves out stories only another outfit speaks in for the plain student, but keeps unmapped variants', () => {
    // m1: plain name speaks; m2: only the New Year outfit; e1: an unmapped variant counts for the plain student
    expect(ids(10000)).toEqual(['m1', 'e1', 'g1']);
  });
});

describe('outfit names that extend another outfit name', () => {
  const nested: StoryIndex = {
    ...index,
    vs: { 'Aru NewYear': '10031', 'Aru NewYear Mode': '10032' },
    series: { ...index.series, 'Favor/10031': { c: 'Favor', name: { ko: 'Aru' }, stories: [] }, 'Favor/10032': { c: 'Favor', name: { ko: 'Aru' }, stories: [] } },
    stories: { ...index.stories, m1: { ...index.stories.m1, v: { Aru: ['Aru NewYear Mode 3'] } }, m2: { ...index.stories.m2, v: { Aru: ['Aru NewYear'] } } },
  };

  it('attributes a speaker name to the longest matching outfit', () => {
    const ids = (studentId: number) => studentAppearances(nested, studentId, {}).flatMap((row) => row.stories.map((story) => story.id));
    expect(ids(10031)).toEqual(['m2']);
    expect(ids(10032)).toEqual(['m1']);
  });
});

describe('appearance scope', () => {
  it('lists every story of the character when asked, whatever the outfit', () => {
    const outfit: StoryIndex = {
      ...index,
      series: { ...index.series, 'Favor/10031': { c: 'Favor', name: { ko: 'Aru' }, stories: [] } },
      stories: { ...index.stories, m1: { ...index.stories.m1, v: { Aru: ['Aru'] } }, m2: { ...index.stories.m2, v: { Aru: ['Aru NewYear'] } } },
    };
    const ids = (scope: 'student' | 'character') => studentAppearances(outfit, 10031, {}, undefined, 'jp', scope).flatMap((row) => row.stories.map((story) => story.id));
    expect(ids('student')).toEqual(['m2']);
    expect(ids('character')).toEqual(expect.arrayContaining(['m1', 'm2']));
  });
});

describe('student appearances', () => {
  it('maps a student to character keys, falling back to the bond story series name', () => {
    expect(studentCharacterKeys(index, 10000)).toEqual(['Aru']);
    // Mika is not in `cs`, so the name of the bond story series is used
    expect(studentCharacterKeys(index, 10001)).toEqual(['Mika']);
    // A name the stories never use gives no key
    expect(studentCharacterKeys({ ...index, chars: {} }, 10001)).toEqual([]);
  });

  it('lists the own bond stories in order', () => {
    expect(favorStoryIds(index, 10000)).toEqual(['f1', 'f2']);
    expect(favorStoryIds(index, 99999)).toEqual([]);
  });

  it('groups appearances by series, skips the own bond series and orders by category then date', () => {
    const releases = { 'Main/a': { jp: [{ date: '2021-02-04 00:00', label: null, estimated: false }] } };
    const found = studentAppearances(index, 10000, releases);
    expect(found.map((row) => row.seriesId)).toEqual(['Main/a', 'Favor/10001']);
    expect(found[0].stories).toEqual([
      { id: 'm1', position: 1 },
      { id: 'm2', position: 2 },
    ]);
  });

  it('drops stories the visibility check rejects', () => {
    const found = studentAppearances(index, 10000, {}, (seriesId, position) => !(seriesId === 'Main/a' && position === 1));
    expect(found.find((row) => row.seriesId === 'Main/a')?.stories).toEqual([{ id: 'm1', position: 1 }]);
  });

  it('reads release by step and treats unknown releases as unreleased', () => {
    const now = Date.parse('2024-01-01T00:00:00+09:00');
    const step = (date: string, episodes?: [number, number]) => ({ date, label: null, estimated: false, ...(episodes && { episodes }) });
    const releases = {
      done: { gl: [step('2023-12-31 00:00')] },
      future: { gl: [step('2024-06-01 00:00')] },
      parts: { gl: [step('2023-01-01 00:00', [1, 2]), step('2024-06-01 00:00', [3, 4])] },
      unclear: { gl: [step('2023-01-01 00:00'), step('2024-06-01 00:00')] },
      guessed: { gl: [{ ...step('2023-01-01 00:00'), estimated: true }] },
    };
    expect(isStoryReleased(releases, 'done', 0, 'gl', now)).toBe(true);
    expect(isStoryReleased(releases, 'future', 0, 'gl', now)).toBe(false);
    expect(isStoryReleased(releases, 'parts', 1, 'gl', now)).toBe(true);
    expect(isStoryReleased(releases, 'parts', 2, 'gl', now)).toBe(false);
    expect(isStoryReleased(releases, 'unclear', 0, 'gl', now)).toBe(false);
    expect(isStoryReleased(releases, 'guessed', 0, 'gl', now)).toBe(false);
    expect(isStoryReleased(releases, 'missing', 0, 'gl', now)).toBe(false);
    expect(isStoryReleased(releases, 'done', 0, 'jp', now)).toBe(false);
  });
});
