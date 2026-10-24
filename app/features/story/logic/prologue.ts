import type { LocalizedText, StoryIndex } from './types';

export const PROLOGUE_ID = 'Main/프롤로그';

const NAME: LocalizedText = { en: 'Prologue', ko: '프롤로그', ja: 'プロローグ', 'zh-Hant': '序幕' };

const episodeNumber = (n: number): LocalizedText => ({ en: `Episode ${n}`, ko: `제${n}화`, ja: `第${n}話`, 'zh-Hant': `第${n}話` });

// The prologue that opens the game (2 episodes, out since the launch of each server) is not in the generated index, so it is added here.
// Its dates come from the `prologue` rows of the main story schedule. It leads into the first chapter of Vol.1.
export function withPrologue(index: StoryIndex): StoryIndex {
  if (index.series[PROLOGUE_ID]) return index;
  const stories = ['prologue-1', 'prologue-2'];
  const first = Object.entries(index.series).find(([, series]) => series.r?.[0] === 'main' && series.r[1] === 'vol1_ch1')?.[0];
  return {
    ...index,
    series: {
      [PROLOGUE_ID]: { c: 'Main', name: NAME, r: ['main', 'prologue'], stories },
      ...index.series,
      ...(first && { [first]: { ...index.series[first], a: [PROLOGUE_ID, ...(index.series[first].a ?? [])] } }),
    },
    stories: {
      ...index.stories,
      ...Object.fromEntries(stories.map((id, at) => [id, { s: PROLOGUE_ID, o: at + 1, t: NAME, l: episodeNumber(at + 1) }])),
    },
  };
}
