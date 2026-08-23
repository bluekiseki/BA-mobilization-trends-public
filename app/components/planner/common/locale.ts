import type { IconInfos, LocalizeEtc } from '~/types/plannerData';
import { type Locale } from '~/utils/i18n/config';

export const getlocaleMethond = (txt: string, type: 'Ja' | 'jp' | 'Jp', locale: Locale) => {
  switch (type) {
    case 'Ja':
      return `${txt}${{ ja: 'Ja', ko: 'Ko', en: 'En', 'zh-Hant': 'Tw' }[locale]}`;
    case 'jp':
      return `${txt}${{ ja: 'jp', ko: 'kr', en: 'en', 'zh-Hant': 'tw' }[locale]}`;
    case 'Jp':
      return `${txt}${{ ja: 'Jp', ko: 'Kr', en: 'En', 'zh-Hant': 'Tw' }[locale]}`;
    default:
      return `${txt}${locale}`;
  }
};

export const getLocalizeEtcName = (localizeEtc: LocalizeEtc | undefined, locale: Locale) => {
  if (!localizeEtc) return null;
  switch (locale) {
    case 'en':
      return localizeEtc.NameEn || localizeEtc.NameJp;
    case 'ko':
      return localizeEtc.NameKr;
    case 'ja':
      return localizeEtc.NameJp;
    case 'zh-Hant':
      return localizeEtc.NameTw || localizeEtc.NameEn || localizeEtc.NameJp;
  }
};

// Resolve a display name for an item key (e.g. 'Item_3000', 'Currency_1') using icon data.
// Returns the key itself if no name is found.
export const getItemName = (key: string, icons: IconInfos | null | undefined, locale: Locale): string => {
  const i = key.lastIndexOf('_');
  if (i < 0) return key;
  const group = icons?.[key.slice(0, i) as keyof IconInfos] as Record<string, { LocalizeEtc?: LocalizeEtc }> | undefined;
  return getLocalizeEtcName(group?.[key.slice(i + 1)]?.LocalizeEtc, locale) || key;
};

export const getLocalizeEtcDescription = (localizeEtc: LocalizeEtc | undefined, locale: Locale): string | null => {
  if (!localizeEtc) return null;
  switch (locale) {
    case 'en':
      return localizeEtc.DescriptionEn || localizeEtc.DescriptionJp;
    case 'ko':
      return localizeEtc.DescriptionKr;
    case 'ja':
      return localizeEtc.DescriptionJp;
    case 'zh-Hant':
      return localizeEtc.DescriptionTw || localizeEtc.DescriptionEn || localizeEtc.DescriptionJp;
  }
};

// Resolve a short description for an item key using icon data. Returns null if none is found
// (unlike getItemName, there's no sensible fallback to the key itself).
export const getItemDescription = (key: string, icons: IconInfos | null | undefined, locale: Locale): string | null => {
  const i = key.lastIndexOf('_');
  if (i < 0) return null;
  const group = icons?.[key.slice(0, i) as keyof IconInfos] as Record<string, { LocalizeEtc?: LocalizeEtc }> | undefined;
  return getLocalizeEtcDescription(group?.[key.slice(i + 1)]?.LocalizeEtc, locale);
};
