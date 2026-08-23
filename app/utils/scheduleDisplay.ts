import bossDataJson from '~/data/bossdata.json';
import eventListJson from '~/data/jp/eventList.json';
import type { EventListData } from '~/types/eventList';
import { type_translation } from '~/components/raid/raidToString';
import { getLocaleShortName, type Locale, type LocaleShortName } from '~/utils/i18n/config';
import type { MultiLang, ScheduleItemV2 } from '~/utils/calender.data.v2';

const bossData = bossDataJson as unknown as Record<string, { name: Record<LocaleShortName, string> }>;
const eventList = eventListJson as unknown as EventListData;

const EVENT_LOCALE_KEY = { en: 'En', ko: 'Kr', ja: 'Jp', 'zh-Hant': 'Tw' } as const;

export interface I18nLike {
  t(key: string, options?: Record<string, unknown>): string;
  language: string;
  getFixedT(lng: string, ns: string, keyPrefix?: string): (key: string) => string;
}

export function getMLText(ml: MultiLang | undefined, locale: Locale): string | undefined {
  if (!ml) return undefined;
  const short = getLocaleShortName(locale);
  return (ml as Record<string, string | undefined>)[short] ?? ml.ja ?? undefined;
}

export function getBossName(bossKey: string | undefined, locale: Locale): string | undefined {
  if (!bossKey) return undefined;
  const boss = bossData[bossKey];
  if (!boss) return bossKey;
  const short = getLocaleShortName(locale);
  return boss.name[short] ?? boss.name.ja ?? boss.name.en ?? bossKey;
}

export function getEventName(eventId: string | undefined, locale: Locale): string | undefined {
  if (!eventId) return undefined;
  const event = eventList[eventId];
  if (!event) return eventId;
  const key = EVENT_LOCALE_KEY[locale];
  return (event[key] as string | null | undefined) ?? event.Jp ?? eventId;
}

export function getArmorDisplayName(armorType: string | undefined, locale: Locale): string | undefined {
  if (!armorType) return undefined;
  const short = getLocaleShortName(locale);
  return (type_translation as Record<string, Record<LocaleShortName, string>>)[armorType]?.[short] ?? armorType;
}

export function getItemTitle(item: ScheduleItemV2, locale: Locale, i18n: I18nLike): string {
  if (item.bossKey) return getBossName(item.bossKey, locale) ?? item.bossKey;
  if (item.eventId) return getEventName(item.eventId, locale) ?? item.eventId;

  if (item.type === 'campaign' && item.details?.campaignType) {
    const campaignKey = item.details.campaignType.toLowerCase();
    const tCal = i18n.getFixedT(i18n.language, 'calendar', 'campaign');
    const tGame = i18n.getFixedT(i18n.language, 'game');

    const label = campaignKey != 'schedule' ? tCal(campaignKey) : tGame(campaignKey);
    return item.details.multiplier ? `${label} x${item.details.multiplier}` : label;
  }
  if (item.type === 'jointFiringDrill' && item.season != null && item.i18nKey) {
    return `#${item.season} ${i18n.t(item.i18nKey)}`;
  }
  if (item.details?.storyVolume) return item.details.storyVolume;
  if (item.details?.storyTitleKey) {
    const tJukebox = i18n.getFixedT(locale, 'jukebox', 'main_story');
    const titlePart = tJukebox(item.details.storyTitleKey);
    return item.details.part ? `${titlePart} Part.${item.details.part}` : titlePart;
  }
  if (item.details?.storyTitleMulti) {
    const text = getMLText(item.details.storyTitleMulti, locale) ?? '';
    return item.details.part ? `${text} Part.${item.details.part}` : text;
  }
  if (item.details?.ministoryTitle) {
    const storyTitle = getMLText(item.details.ministoryTitle, locale) ?? '';
    return i18n.t('calendar:story.mini', { title: storyTitle });
  }
  if (item.i18nKey) return i18n.t(item.i18nKey);
  return item.id;
}

export function getItemLabel(item: ScheduleItemV2, i18n: I18nLike): string | undefined {
  switch (item.type) {
    case 'raid':
      return i18n.t('game:raid');
    case 'eraid':
      return i18n.t('game:eraid');
    case 'jointFiringDrill':
      return i18n.t('game:jfd');
    case 'event':
      return i18n.t('game:event') + (item.details?.rerun ? `/${i18n.t('game:rerun')}` : '');
    default:
      return undefined;
  }
}
