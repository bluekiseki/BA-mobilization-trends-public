import en from '~/locales/en/jukebox.json';
import ja from '~/locales/ja/jukebox.json';
import ko from '~/locales/ko/jukebox.json';
import zhHant from '~/locales/zh_Hant/jukebox.json';
import type { StoryLang } from './types';

// Chapter titles of the main story, shared with the jukebox page (keys like "vol3_ch3").
const MAIN_TITLES: Record<StoryLang, Record<string, string>> = { en: en.main_story, ko: ko.main_story, ja: ja.main_story, 'zh-Hant': zhHant.main_story };

// The shared titles leave the chapter name out for chapters a server has not released yet (spoilers on the jukebox); the story pages show it anyway.
const ENDS_WITH_CHAPTER_NUMBER = /(?:Ch\.\s*\d+|\d+장|第\d+章)\s*$/;

// `name` is the chapter name of the series in the story index (taken from the game's text), in this language. A name in another language is never shown instead.
export function mainTitle(key: string, lang: StoryLang, name?: string): string | undefined {
  const own = MAIN_TITLES[lang][key];
  if (!own || !name || !ENDS_WITH_CHAPTER_NUMBER.test(own)) return own;
  return `${own} ${name}`;
}
