import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import en from '~/locales/en/jukebox.json';
import ja from '~/locales/ja/jukebox.json';
import ko from '~/locales/ko/jukebox.json';
import zhHant from '~/locales/zh_Hant/jukebox.json';
import { loadScheduleDataV2 } from './calender.data.v2';
import { SUPORTED_LOCALES } from './i18n/config';
import { getItemTitle } from './scheduleDisplay';

const resources = {
  en: { jukebox: en },
  ko: { jukebox: ko },
  ja: { jukebox: ja },
  'zh-Hant': { jukebox: zhHant },
};

describe('main story schedule titles', () => {
  it.each(['jp', 'kr'] as const)('localizes Lore Pursuit chapter 3 for the %s schedule in every supported language', async (server) => {
    const schedule = loadScheduleDataV2({ server, tracksToLoad: ['story'] });
    const story = schedule.tracks.mainstory.find((item) => item.details?.storyTitleKey === 'part2_ex_lore_ch3');
    expect(story).toBeDefined();
    if (!story) throw new Error('Lore Pursuit chapter 3 is missing from the schedule');

    for (const locale of SUPORTED_LOCALES) {
      const i18n = createInstance();
      await i18n.init({ lng: locale, fallbackLng: 'en', resources });
      const title = getItemTitle(story, locale, i18n);
      expect(title).toBe(resources[locale].jukebox.main_story.part2_ex_lore_ch3);
      expect(title).not.toContain('part2_ex_lore_ch3');
    }
  });
});
