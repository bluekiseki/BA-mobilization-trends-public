export const COOKIE_NAME = 'NEXT_LOCALE';
export const DEFAULT_LOCALE = 'en';
export type LocaleShortName = 'en' | 'ko' | 'ja' | 'zh_Hant';
export type Locale = 'en' | 'ko' | 'ja' | 'zh-Hant';
export const SUPORTED_SHORT_LOCALES: LocaleShortName[] = ['en', 'ko', 'ja', 'zh_Hant'];
export const SUPORTED_LOCALES: Locale[] = ['en', 'ko', 'ja', 'zh-Hant'];
export const getLocaleShortName: (str: Locale) => LocaleShortName = (str: Locale) => {
  if (str == 'zh-Hant') return 'zh_Hant';
  else return str;
};
